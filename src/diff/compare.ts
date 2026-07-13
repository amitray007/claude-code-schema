import { resolve } from "node:path";
import type { JsonObject, SurfaceManifest } from "../domain/types.js";
import { readJson } from "../shared/json.js";

function propertyPaths(
  schema: JsonObject,
  prefix = "",
  output = new Set<string>(),
): Set<string> {
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
      propertyPaths(child as JsonObject, path, output);
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
  const [fromManifest, toManifest, fromSettings, toSettings] =
    await Promise.all([
      readJson<SurfaceManifest>(resolve(fromDirectory, "manifest.json")),
      readJson<SurfaceManifest>(resolve(toDirectory, "manifest.json")),
      readJson<JsonObject>(resolve(fromDirectory, "settings.schema.json")),
      readJson<JsonObject>(resolve(toDirectory, "settings.schema.json")),
    ]);
  const fromArtifacts = new Set(Object.keys(fromManifest.artifacts));
  const toArtifacts = new Set(Object.keys(toManifest.artifacts));
  const fromPaths = propertyPaths(fromSettings);
  const toPaths = propertyPaths(toSettings);
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
