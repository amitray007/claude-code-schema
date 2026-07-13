import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Ajv } from "ajv";
import { compareDirectories } from "../src/diff/compare.js";
import type {
  JsonObject,
  SurfaceManifest,
  ValidationReport,
} from "../src/domain/types.js";
import { generate } from "../src/pipeline/generate.js";
import { stagePublication } from "../src/publication/stage.js";
import { releaseIssueMarkdown } from "../src/reports/issue.js";
import { jsonSha256, readJson, sha256, writeJson } from "../src/shared/json.js";
import { validateDirectory } from "../src/validation/validate.js";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const reference = resolve(repositoryRoot, "experiments/version-4/output");

async function digestDirectory(
  directory: string,
): Promise<Record<string, string>> {
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  return Object.fromEntries(
    await Promise.all(
      files.map(
        async (file) =>
          [file, sha256(await readFile(resolve(directory, file)))] as const,
      ),
    ),
  );
}

test("offline production generation is complete, formatted, validated, and deterministic", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "schema-production-test-"));
  const first = resolve(root, "first");
  const second = resolve(root, "second");
  for (const outputDirectory of [first, second]) {
    await generate({
      version: "2.1.207",
      outputDirectory,
      baseUrl: "https://schemas.test.example/claude-code",
      sourceDirectory: reference,
    });
  }
  assert.deepEqual(await digestDirectory(first), await digestDirectory(second));

  const manifest = await readJson<SurfaceManifest>(
    resolve(first, "manifest.json"),
  );
  const validation = await readJson<ValidationReport>(
    resolve(first, "validation-report.json"),
  );
  const combined = await readJson<JsonObject>(
    resolve(first, "claude-code.schema.json"),
  );
  const catalog = await readJson<JsonObject>(resolve(first, "catalog.json"));
  const settingsCatalog = await readJson<JsonObject>(
    resolve(first, "settings.catalog.json"),
  );
  const environmentCatalog = await readJson<JsonObject>(
    resolve(first, "environment.catalog.json"),
  );
  const cliCatalog = await readJson<JsonObject>(
    resolve(first, "cli.catalog.json"),
  );
  const keybindingsCatalog = await readJson<JsonObject>(
    resolve(first, "keybindings.catalog.json"),
  );
  assert.equal(manifest.claudeCodeVersion, "2.1.207");
  assert.equal(manifest.counts.environmentSchemaProperties, 313);
  assert.equal(manifest.counts.probedCommands, 39);
  assert.equal(manifest.counts.runtimeSettingsDiagnostics, 111);
  assert.equal(manifest.counts.publishedArtifacts, 15);
  assert.equal(manifest.counts.digestedArtifacts, 13);
  assert.equal(
    manifest.artifacts["claude-code.schema.json"]?.artifactKind,
    "combined-configuration-envelope-json-schema",
  );
  assert.equal(validation.status, "passed");
  assert.equal(validation.counts.failed, 0);
  assert.equal((catalog.productScope as JsonObject).primary, "Claude Code CLI");
  assert.equal(
    catalog.releaseBaseUrl,
    "https://schemas.test.example/claude-code/v2.1.207",
  );
  const startHere = catalog.startHere as JsonObject;
  const settingsStart = startHere.settingsJson as JsonObject;
  const environmentStart = startHere.environmentVariables as JsonObject;
  assert.equal(settingsStart.file, "settings.schema.json");
  assert.equal(
    settingsStart.downloadUrl,
    "https://schemas.test.example/claude-code/v2.1.207/settings.schema.json",
  );
  assert.equal(environmentStart.file, "environment.schema.json");
  assert.equal(
    environmentStart.downloadUrl,
    "https://schemas.test.example/claude-code/v2.1.207/environment.schema.json",
  );
  const audiences = catalog.audiences as JsonObject;
  assert.deepEqual(audiences.configurationUsers, [
    "settings.schema.json",
    "environment.schema.json",
    "global-config.schema.json",
    "keybindings.schema.json",
  ]);
  assert.equal((settingsCatalog.facts as unknown[]).length, 163);
  assert.equal(
    (environmentCatalog.configurableVariables as unknown[]).length,
    313,
  );
  assert.equal(
    (environmentCatalog.staticBinaryCandidates as unknown[]).length,
    455,
  );
  assert.equal((cliCatalog.commands as unknown[]).length, 39);
  assert.equal((cliCatalog.documentedOptions as unknown[]).length, 70);
  assert.equal((keybindingsCatalog.defaults as unknown[]).length, 109);
  assert.equal((keybindingsCatalog.actions as unknown[]).length, 301);
  assert.match(
    String(combined.$id),
    /^https:\/\/schemas\.test\.example\/claude-code\/v2\.1\.207\//,
  );
  assert.deepEqual((await readdir(first)).sort(), [
    "catalog.json",
    "claude-code.schema.json",
    "cli.catalog.json",
    "desktop-managed-settings.schema.json",
    "environment.catalog.json",
    "environment.schema.json",
    "global-config.schema.json",
    "keybindings.catalog.json",
    "keybindings.compat.schema.json",
    "keybindings.schema.json",
    "manifest.json",
    "review.catalog.json",
    "settings.catalog.json",
    "settings.schema.json",
    "validation-report.json",
  ]);

  const ajv = new Ajv({ strict: false, validateFormats: false });
  for (const file of (await readdir(first))
    .filter((name) => name.endsWith(".schema.json"))
    .sort()) {
    ajv.addSchema(await readJson(resolve(first, file)));
  }
  const validateCombined = ajv.getSchema(String(combined.$id));
  assert.ok(validateCombined, "combined schema must be registered by $id");
  const example = await readJson<JsonObject>(
    resolve(repositoryRoot, "examples/combined.json"),
  );
  assert.equal(
    validateCombined(example),
    true,
    JSON.stringify(validateCombined.errors, null, 2),
  );

  const settingsSchema = await readJson<JsonObject>(
    resolve(first, "settings.schema.json"),
  );
  const environmentSchema = await readJson<JsonObject>(
    resolve(first, "environment.schema.json"),
  );
  const settingsProperties = settingsSchema.properties as JsonObject;
  const settingsEnvironment = settingsProperties.env as JsonObject;
  assert.deepEqual(settingsEnvironment.allOf, [
    { $ref: "environment.schema.json" },
  ]);
  assert.equal(
    settingsEnvironment["x-shared-schema"],
    "environment.schema.json",
  );
  assert.equal(settingsEnvironment.properties, undefined);
  const validateSettings = ajv.getSchema(String(settingsSchema.$id));
  const validateEnvironment = ajv.getSchema(String(environmentSchema.$id));
  assert.ok(validateSettings, "settings schema must be registered by $id");
  assert.ok(
    validateEnvironment,
    "environment schema must be registered by $id",
  );
  assert.equal(
    validateSettings(
      await readJson(resolve(repositoryRoot, "examples/settings.json")),
    ),
    true,
    JSON.stringify(validateSettings.errors, null, 2),
  );
  assert.equal(
    validateEnvironment(
      await readJson(resolve(repositoryRoot, "examples/environment.json")),
    ),
    true,
    JSON.stringify(validateEnvironment.errors, null, 2),
  );
  assert.equal(
    validateSettings({ env: { ANTHROPIC_API_KEY: 42 } }),
    false,
    "settings.env must retain the string-valued environment contract",
  );

  for (const file of await readdir(first)) {
    if (!file.endsWith(".json")) continue;
    const text = await readFile(resolve(first, file), "utf8");
    assert.ok(text.endsWith("\n"), `${file} must end in a newline`);
    assert.equal(
      text,
      `${JSON.stringify(JSON.parse(text), null, 2)}\n`,
      `${file} must use canonical pretty formatting`,
    );
  }

  const diff = await compareDirectories(first, second);
  assert.deepEqual((diff.settingsPaths as JsonObject).added, []);
  assert.deepEqual((diff.settingsPaths as JsonObject).removed, []);

  const issue = releaseIssueMarkdown(
    manifest,
    validation,
    diff,
    "https://github.example/run/1",
  );
  assert.match(issue, /claude-code-schema-release:2\.1\.207/);
  assert.match(issue, /Automated validation passed/);
  assert.match(issue, /npm run schema:generate/);
});

test("validation detects artifact tampering", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "schema-tamper-test-"));
  const output = resolve(root, "candidate");
  await cp(reference, output, { recursive: true });
  const settingsFile = resolve(output, "settings.schema.json");
  const settings = await readJson<JsonObject>(settingsFile);
  settings.title = "tampered";
  await writeJson(settingsFile, settings);
  await assert.rejects(
    validateDirectory(output),
    /digest: settings\.schema\.json/,
  );
});

test("validation rejects an ambiguous consumer entry point", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "schema-entry-point-test-"));
  const output = resolve(root, "candidate");
  await generate({
    version: "2.1.207",
    outputDirectory: output,
    baseUrl: "https://schemas.test.example/claude-code",
    sourceDirectory: reference,
  });
  const catalogFile = resolve(output, "catalog.json");
  const manifestFile = resolve(output, "manifest.json");
  const catalog = await readJson<JsonObject>(catalogFile);
  const startHere = catalog.startHere as JsonObject;
  (startHere.settingsJson as JsonObject).file = "settings.catalog.json";
  await writeJson(catalogFile, catalog);
  const manifest = await readJson<SurfaceManifest>(manifestFile);
  manifest.artifacts["catalog.json"]!.sha256 = jsonSha256(catalog);
  await writeJson(manifestFile, manifest as unknown as JsonObject);
  await assert.rejects(
    validateDirectory(output),
    /unambiguous settings and environment entry points/,
  );
});

test("validation requires one audience for every non-index artifact", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "schema-audience-test-"));
  const output = resolve(root, "candidate");
  await generate({
    version: "2.1.207",
    outputDirectory: output,
    baseUrl: "https://schemas.test.example/claude-code",
    sourceDirectory: reference,
  });
  const catalogFile = resolve(output, "catalog.json");
  const manifestFile = resolve(output, "manifest.json");
  const catalog = await readJson<JsonObject>(catalogFile);
  const audiences = catalog.audiences as JsonObject;
  assert.ok(Array.isArray(audiences.configurationUsers));
  audiences.configurationUsers = audiences.configurationUsers.filter(
    (file) => file !== "environment.schema.json",
  );
  await writeJson(catalogFile, catalog);
  const manifest = await readJson<SurfaceManifest>(manifestFile);
  manifest.artifacts["catalog.json"]!.sha256 = jsonSha256(catalog);
  await writeJson(manifestFile, manifest as unknown as JsonObject);
  await assert.rejects(
    validateDirectory(output),
    /assigns every non-index artifact to one audience/,
  );
});

test("publication staging keeps one validated output directory without site copies", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "schema-publication-test-"));
  const candidate = resolve(root, "candidate");
  const publication = resolve(root, "publication");
  await generate({
    version: "2.1.207",
    outputDirectory: candidate,
    baseUrl: "https://schemas.test.example/claude-code",
    sourceDirectory: reference,
  });
  const report = await stagePublication(candidate, publication);
  assert.equal(report.version, "2.1.207");
  assert.equal(report.tag, "v2.1.207");
  const publishedOutput = resolve(publication, "output");
  assert.deepEqual(
    await digestDirectory(publishedOutput),
    await digestDirectory(candidate),
  );
  await stagePublication(candidate, publication);
  assert.deepEqual(
    await digestDirectory(publishedOutput),
    await digestDirectory(candidate),
    "staging the same version twice must be idempotent",
  );
  assert.ok(await readJson(resolve(publishedOutput, "cli.catalog.json")));
  assert.equal((await validateDirectory(publishedOutput)).status, "passed");
  await assert.rejects(
    readFile(resolve(publication, "latest/manifest.json")),
    /ENOENT/,
  );
  await assert.rejects(
    readFile(resolve(publication, "site/index.json")),
    /ENOENT/,
  );
});
