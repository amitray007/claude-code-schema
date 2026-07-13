import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";
import { combinedSchemaFile, surfaceSchemaFiles } from "../config.js";
import type {
  JsonObject,
  SurfaceManifest,
  ValidationCheck,
  ValidationReport,
} from "../domain/types.js";
import { jsonSha256, readJson } from "../shared/json.js";

const retiredFragmentFiles = [
  "binary-candidates.catalog.json",
  "changelog-hints.catalog.json",
  "changelog-review.schema.json",
  "env.schema.json",
  "environment-capabilities.catalog.json",
  "flags.catalog.json",
  "keybinding-capabilities.catalog.json",
  "keybinding-defaults.catalog.json",
  "keybindings.runtime-compat.schema.json",
  "legacy-candidates.catalog.json",
  "settings-facts.catalog.json",
];

function describeErrors(errors: ErrorObject[] | null | undefined): string {
  return JSON.stringify(errors ?? [], null, 2);
}

function fullEnvelope(settings: JsonObject = {}): JsonObject {
  return {
    settings,
    globalConfig: {},
    desktopManagedSettings: {},
    environment: {},
    keybindings: { bindings: [] },
  };
}

function topLevelTypedCount(schema: JsonObject): {
  typed: number;
  total: number;
  untyped: string[];
} {
  const properties = (schema.properties ?? {}) as JsonObject;
  const entries = Object.entries(properties).filter(
    ([name]) => name !== "$schema",
  );
  const constrained = (value: unknown): boolean => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return false;
    const record = value as JsonObject;
    return Boolean(
      record.type ??
      record.enum ??
      record.oneOf ??
      record.anyOf ??
      record.allOf ??
      record.$ref ??
      record.const,
    );
  };
  return {
    typed: entries.filter(([, value]) => constrained(value)).length,
    total: entries.length,
    untyped: entries
      .filter(([, value]) => !constrained(value))
      .map(([name]) => name),
  };
}

export async function validateDirectory(
  directory: string,
): Promise<ValidationReport> {
  const checks: ValidationCheck[] = [];
  const pass = (name: string, detail?: string): void => {
    checks.push({ name, status: "passed", ...(detail ? { detail } : {}) });
  };
  const fail = (name: string, detail: string): void => {
    checks.push({ name, status: "failed", detail });
  };
  const manifest = await readJson<SurfaceManifest>(
    resolve(directory, "manifest.json"),
  );
  const files = new Set(await readdir(directory));

  for (const file of [
    ...surfaceSchemaFiles,
    "keybindings.compat.schema.json",
    combinedSchemaFile,
    "catalog.json",
  ]) {
    if (files.has(file)) pass(`required artifact: ${file}`);
    else fail(`required artifact: ${file}`, "file is missing");
  }

  const retainedFragments = retiredFragmentFiles.filter((file) =>
    files.has(file),
  );
  if (retainedFragments.length === 0)
    pass("fragmented legacy artifacts are not published");
  else
    fail(
      "fragmented legacy artifacts are not published",
      retainedFragments.join(", "),
    );

  try {
    const catalog = await readJson<JsonObject>(
      resolve(directory, "catalog.json"),
    );
    const records = Array.isArray(catalog.artifacts) ? catalog.artifacts : [];
    const declaredFiles = records
      .map((record) =>
        record && typeof record === "object" && !Array.isArray(record)
          ? (record as JsonObject).file
          : undefined,
      )
      .filter((file): file is string => typeof file === "string");
    const missing = declaredFiles.filter(
      (file) => file !== "validation-report.json" && !files.has(file),
    );
    const undeclared = [...files].filter(
      (file) => file.endsWith(".json") && !declaredFiles.includes(file),
    );
    if (
      catalog.claudeCodeVersion === manifest.claudeCodeVersion &&
      declaredFiles.length === records.length &&
      new Set(declaredFiles).size === declaredFiles.length &&
      missing.length === 0 &&
      undeclared.length === 0
    )
      pass("release catalog indexes every JSON artifact");
    else
      fail(
        "release catalog indexes every JSON artifact",
        `records=${records.length}, files=${declaredFiles.length}, missing=${missing.join(", ")}, undeclared=${undeclared.join(", ")}`,
      );

    const startHere = catalog.startHere as JsonObject | undefined;
    const settingsStart = startHere?.settingsJson as JsonObject | undefined;
    const environmentStart = startHere?.environmentVariables as
      JsonObject | undefined;
    const expectedBaseUrl = String(catalog.releaseBaseUrl ?? "").replace(
      /\/$/,
      "",
    );
    if (
      settingsStart?.file === "settings.schema.json" &&
      settingsStart.downloadUrl === `${expectedBaseUrl}/settings.schema.json` &&
      environmentStart?.file === "environment.schema.json" &&
      environmentStart.downloadUrl ===
        `${expectedBaseUrl}/environment.schema.json`
    )
      pass(
        "release catalog has unambiguous settings and environment entry points",
      );
    else
      fail(
        "release catalog has unambiguous settings and environment entry points",
        "startHere must point to the primary settings and environment schemas",
      );

    const audiences = catalog.audiences as JsonObject | undefined;
    const audienceFiles = Object.values(audiences ?? {}).flatMap((value) =>
      Array.isArray(value)
        ? value.filter((file): file is string => typeof file === "string")
        : [],
    );
    const expectedAudienceFiles = declaredFiles
      .filter((file) => file !== "catalog.json")
      .sort();
    if (
      new Set(audienceFiles).size === audienceFiles.length &&
      audienceFiles.sort().join("\n") === expectedAudienceFiles.join("\n")
    )
      pass("release catalog assigns every non-index artifact to one audience");
    else
      fail(
        "release catalog assigns every non-index artifact to one audience",
        `expected=${expectedAudienceFiles.join(", ")}, received=${audienceFiles.join(", ")}`,
      );
  } catch (error) {
    fail(
      "release catalog indexes every JSON artifact",
      (error as Error).message,
    );
  }

  for (const [file, descriptor] of Object.entries(manifest.artifacts)) {
    try {
      const payload = await readJson<JsonObject>(resolve(directory, file));
      const actual = jsonSha256(payload);
      if (actual === descriptor.sha256) pass(`digest: ${file}`);
      else
        fail(
          `digest: ${file}`,
          `expected ${descriptor.sha256}, received ${actual}`,
        );
    } catch (error) {
      fail(`digest: ${file}`, (error as Error).message);
    }
  }

  if (manifest.safety.schemaStoreUsedAsGenerationSource === false)
    pass("SchemaStore excluded as generation source");
  else
    fail(
      "SchemaStore excluded as generation source",
      "manifest safety policy is not false",
    );

  const schemaFiles = [...files]
    .filter((file) => file.endsWith(".schema.json"))
    .sort();
  const schemas = new Map<string, JsonObject>();
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });
  for (const file of schemaFiles) {
    try {
      const schema = await readJson<JsonObject>(resolve(directory, file));
      schemas.set(file, schema);
      new Ajv({
        allErrors: true,
        strict: false,
        validateFormats: false,
      }).compile(schema as object);
      pass(`schema compiles standalone: ${file}`);
      ajv.addSchema(schema as object);
      pass(`schema compiles: ${file}`);
      if (typeof schema.$id === "string" && schema.$id.endsWith(`/${file}`))
        pass(`schema ID matches filename: ${file}`);
      else
        fail(
          `schema ID matches filename: ${file}`,
          `received ${String(schema.$id)}`,
        );
    } catch (error) {
      fail(`schema compiles: ${file}`, (error as Error).message);
    }
  }

  let combinedValidator: ValidateFunction | undefined;
  const combined = schemas.get(combinedSchemaFile);
  if (combined && typeof combined.$id === "string")
    combinedValidator = ajv.getSchema(combined.$id);
  if (!combinedValidator && combined) {
    try {
      combinedValidator = ajv.compile(combined as object);
    } catch (error) {
      fail("combined schema resolves all references", (error as Error).message);
    }
  }
  if (combinedValidator) {
    const valid = fullEnvelope();
    if (combinedValidator(valid))
      pass("combined schema accepts a valid complete envelope");
    else
      fail(
        "combined schema accepts a valid complete envelope",
        describeErrors(combinedValidator.errors),
      );

    if (!combinedValidator({ settings: {} }))
      pass("combined schema rejects an incomplete envelope");
    else
      fail(
        "combined schema rejects an incomplete envelope",
        "missing surfaces were accepted",
      );

    if (!combinedValidator({ ...valid, unexpected: true }))
      pass("combined schema rejects unknown envelope properties");
    else
      fail(
        "combined schema rejects unknown envelope properties",
        "unknown property was accepted",
      );

    if (!combinedValidator(fullEnvelope({ includeCoAuthoredBy: "yes" }))) {
      pass("combined schema rejects an invalid settings type");
    } else {
      fail(
        "combined schema rejects an invalid settings type",
        "string includeCoAuthoredBy was accepted",
      );
    }
  }

  const settings = schemas.get("settings.schema.json");
  const settingsProperties = settings?.properties as JsonObject | undefined;
  const settingsEnvironment = settingsProperties?.env as JsonObject | undefined;
  const environmentRefs = Array.isArray(settingsEnvironment?.allOf)
    ? settingsEnvironment.allOf
        .map((entry) =>
          entry && typeof entry === "object" && !Array.isArray(entry)
            ? (entry as JsonObject).$ref
            : undefined,
        )
        .filter(
          (reference): reference is string => typeof reference === "string",
        )
    : [];
  if (
    environmentRefs.includes("#/definitions/environment") &&
    settings?.definitions &&
    typeof settings.definitions === "object" &&
    !Array.isArray(settings.definitions) &&
    Boolean(settings.definitions.environment) &&
    settingsEnvironment?.["x-shared-schema"] === "environment.schema.json"
  )
    pass("settings env bundles the standalone environment schema");
  else
    fail(
      "settings env bundles the standalone environment schema",
      "settings.properties.env must reference #/definitions/environment",
    );
  const typed = settings
    ? topLevelTypedCount(settings)
    : { typed: 0, total: 0, untyped: ["settings schema missing"] };
  if (typed.total > 0 && typed.untyped.length === 0)
    pass(
      "all top-level settings are constrained",
      `${typed.typed}/${typed.total}`,
    );
  else fail("all top-level settings are constrained", typed.untyped.join(", "));

  const failed = checks.filter(({ status }) => status === "failed");
  const report: ValidationReport = {
    schemaVersion: 1,
    artifactKind: "schema-generation-validation-report",
    claudeCodeVersion: manifest.claudeCodeVersion,
    status: failed.length ? "failed" : "passed",
    checks,
    counts: {
      checks: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
      declaredArtifacts: Object.keys(manifest.artifacts).length,
      compiledSchemas: schemas.size,
      typedTopLevelSettings: typed.typed,
      topLevelSettings: typed.total,
    },
  };
  if (failed.length)
    throw new Error(
      `Validation failed:\n${failed.map(({ name, detail }) => `- ${name}: ${detail}`).join("\n")}`,
    );
  return report;
}
