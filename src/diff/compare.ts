import { resolve } from "node:path";
import type { JsonObject, SurfaceManifest } from "../domain/types.js";
import { readJson } from "../shared/json.js";

function resolveLocalReference(
  rootSchema: JsonObject,
  reference: string,
): JsonObject | undefined {
  if (reference === "#") return rootSchema;
  if (!reference.startsWith("#/")) return undefined;
  let current: unknown = rootSchema;
  for (const rawToken of reference.slice(2).split("/")) {
    if (!current || typeof current !== "object" || Array.isArray(current))
      return undefined;
    const token = rawToken.replaceAll("~1", "/").replaceAll("~0", "~");
    current = (current as JsonObject)[token];
  }
  return current && typeof current === "object" && !Array.isArray(current)
    ? (current as JsonObject)
    : undefined;
}

function propertyPaths(
  schema: JsonObject,
  prefix = "",
  output = new Set<string>(),
  siblingSchemas = new Map<string, JsonObject>(),
  activeReferences = new Set<string>(),
  rootSchema = schema,
): Set<string> {
  const allOf = Array.isArray(schema.allOf) ? schema.allOf : [];
  for (const entry of allOf) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const branch = entry as JsonObject;
    const reference = branch.$ref;
    if (typeof reference === "string") {
      const local = reference.startsWith("#");
      const key = local
        ? reference
        : reference.split("#", 1)[0]!.split("/").at(-1)!;
      const referenced = local
        ? resolveLocalReference(rootSchema, reference)
        : siblingSchemas.get(key);
      if (referenced && !activeReferences.has(key)) {
        activeReferences.add(key);
        propertyPaths(
          referenced,
          prefix,
          output,
          siblingSchemas,
          activeReferences,
          local ? rootSchema : referenced,
        );
        activeReferences.delete(key);
      }
    } else {
      propertyPaths(
        branch,
        prefix,
        output,
        siblingSchemas,
        activeReferences,
        rootSchema,
      );
    }
  }
  const properties = schema.properties;
  if (
    !properties ||
    typeof properties !== "object" ||
    Array.isArray(properties)
  )
    return output;
  for (const [name, child] of Object.entries(properties)) {
    const path = prefix ? `${prefix}.${name}` : name;
    output.add(path);
    if (child && typeof child === "object" && !Array.isArray(child))
      propertyPaths(
        child as JsonObject,
        path,
        output,
        siblingSchemas,
        activeReferences,
        rootSchema,
      );
  }
  return output;
}

function difference(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((value) => !right.has(value)).sort();
}

export async function compareDirectories(
  fromDirectory: string,
  toDirectory: string,
): Promise<JsonObject> {
  const [
    fromManifest,
    toManifest,
    fromSettings,
    toSettings,
    fromEnvironment,
    toEnvironment,
  ] = await Promise.all([
    readJson<SurfaceManifest>(resolve(fromDirectory, "manifest.json")),
    readJson<SurfaceManifest>(resolve(toDirectory, "manifest.json")),
    readJson<JsonObject>(resolve(fromDirectory, "settings.schema.json")),
    readJson<JsonObject>(resolve(toDirectory, "settings.schema.json")),
    readJson<JsonObject>(resolve(fromDirectory, "environment.schema.json")),
    readJson<JsonObject>(resolve(toDirectory, "environment.schema.json")),
  ]);
  const fromArtifacts = new Set(Object.keys(fromManifest.artifacts));
  const toArtifacts = new Set(Object.keys(toManifest.artifacts));
  const fromPaths = propertyPaths(
    fromSettings,
    "",
    new Set<string>(),
    new Map([["environment.schema.json", fromEnvironment]]),
  );
  const toPaths = propertyPaths(
    toSettings,
    "",
    new Set<string>(),
    new Map([["environment.schema.json", toEnvironment]]),
  );
  return {
    schemaVersion: 1,
    artifactKind: "schema-release-semantic-diff",
    fromVersion: fromManifest.claudeCodeVersion,
    toVersion: toManifest.claudeCodeVersion,
    artifacts: {
      added: difference(toArtifacts, fromArtifacts),
      removed: difference(fromArtifacts, toArtifacts),
      retained: [...toArtifacts]
        .filter((file) => fromArtifacts.has(file))
        .sort(),
    },
    settingsPaths: {
      added: difference(toPaths, fromPaths),
      removed: difference(fromPaths, toPaths),
      retainedCount: [...toPaths].filter((path) => fromPaths.has(path)).length,
      fromCount: fromPaths.size,
      toCount: toPaths.size,
    },
    counts: {
      from: fromManifest.counts,
      to: toManifest.counts,
    },
  };
}
