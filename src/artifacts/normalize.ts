import {
  combinedSchemaFile,
  generatorVersion,
  releaseVersionBaseUrl,
} from "../config.js";
import type {
  ArtifactDescriptor,
  JsonObject,
  JsonValue,
  SurfaceManifest,
} from "../domain/types.js";
import { cloneJson, jsonSha256 } from "../shared/json.js";
import { combinedSchema } from "./combined.js";
import { releaseCatalog, structureArtifacts } from "./structured.js";

function rewriteStrings(value: JsonValue, from: string, to: string): JsonValue {
  if (typeof value === "string") return value.replaceAll(from, to);
  if (Array.isArray(value))
    return value.map((item) => rewriteStrings(item, from, to));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        child === undefined ? undefined : rewriteStrings(child, from, to),
      ]),
    );
  }
  return value;
}

function artifactKind(payload: JsonObject): string {
  const value = payload["x-artifact-kind"] ?? payload.artifactKind;
  return typeof value === "string" ? value : "json-artifact";
}

export function normalizeArtifacts(
  sourceArtifacts: Record<string, JsonObject>,
  baseUrl: string,
): { artifacts: Record<string, JsonObject>; manifest: SurfaceManifest } {
  const sourceManifest = sourceArtifacts["manifest.json"] as
    SurfaceManifest | undefined;
  if (!sourceManifest?.claudeCodeVersion)
    throw new Error("Source artifacts do not contain a valid manifest.json");
  const version = sourceManifest.claudeCodeVersion;
  const settingsId = sourceArtifacts["settings.schema.json"]?.$id;
  const sourcePrefix =
    typeof settingsId === "string" &&
    settingsId.endsWith("settings.schema.json")
      ? settingsId.slice(0, -"settings.schema.json".length)
      : `https://example.invalid/claude-code/${version}/`;
  const targetPrefix = `${releaseVersionBaseUrl(baseUrl, version)}/`;
  const rewrittenSource: Record<string, JsonObject> = {};
  for (const [file, original] of Object.entries(sourceArtifacts)) {
    if (file === "manifest.json" || file === "validation-report.json") continue;
    let rewritten = rewriteStrings(
      cloneJson(original),
      sourcePrefix,
      targetPrefix,
    ) as JsonObject;
    rewritten = rewriteStrings(
      rewritten,
      "keybindings.runtime-compat.schema.json",
      "keybindings.compat.schema.json",
    ) as JsonObject;
    rewritten = rewriteStrings(
      rewritten,
      "env.schema.json",
      "environment.schema.json",
    ) as JsonObject;
    delete rewritten["x-experiment"];
    rewritten["x-generator-version"] = generatorVersion;
    if (typeof rewritten.title === "string")
      rewritten.title = rewritten.title.replace(/\s+[—-].*experiment$/i, "");
    if (file === "changelog-review.schema.json") {
      rewritten.title = "Claude Code changelog human review";
      rewritten["x-review-policy"] =
        "Human review is required; changelog hints never mutate published artifacts without deterministic source evidence and validation gates.";
    }
    if (file === "changelog-hints.catalog.json")
      rewritten.policy =
        "Hints never mutate schemas or catalogs automatically. Deterministic evidence and validation are required; ambiguous entries enter human review.";
    rewrittenSource[file] = rewritten;
  }
  const artifacts = structureArtifacts(rewrittenSource, version, targetPrefix);
  artifacts[combinedSchemaFile] = combinedSchema(
    version,
    baseUrl.replace(/\/$/, ""),
  );
  artifacts["catalog.json"] = releaseCatalog(version, targetPrefix);

  const descriptors: Record<string, ArtifactDescriptor> = Object.fromEntries(
    Object.entries(artifacts).map(([file, payload]) => [
      file,
      { artifactKind: artifactKind(payload), sha256: jsonSha256(payload) },
    ]),
  );
  const publishedArtifactCount = Array.isArray(
    artifacts["catalog.json"]?.artifacts,
  )
    ? artifacts["catalog.json"].artifacts.length
    : Object.keys(artifacts).length + 2;
  const publishedSchemas = Object.keys(artifacts).filter((file) =>
    file.endsWith(".schema.json"),
  ).length;
  const publishedDomainCatalogs = Object.values(descriptors).filter(
    ({ artifactKind: kind }) => kind.endsWith("-surface-catalog"),
  ).length;
  const publishedReviewCatalogs = Object.values(descriptors).filter(
    ({ artifactKind: kind }) => kind === "release-review-catalog",
  ).length;
  let manifest = rewriteStrings(
    cloneJson(sourceManifest),
    "keybindings.runtime-compat.schema.json",
    "keybindings.compat.schema.json",
  ) as SurfaceManifest;
  manifest = rewriteStrings(
    manifest,
    "env.schema.json",
    "environment.schema.json",
  ) as SurfaceManifest;
  delete manifest.experimentVersion;
  manifest.generatorVersion = generatorVersion;
  manifest.sourcePolicy =
    "current official documentation, release-tagged first-party examples, integrity-verified platform package, bounded CLI probes, and isolated runtime validation; SchemaStore is not a generation source";
  manifest.artifacts = descriptors;
  manifest.counts = {
    ...manifest.counts,
    publishedArtifacts: publishedArtifactCount,
    digestedArtifacts: Object.keys(artifacts).length,
    publishedSchemas,
    publishedDomainCatalogs,
    publishedReviewCatalogs,
    combinedEnvelopeSurfaces: 5,
  };
  manifest.safety = {
    ...manifest.safety,
    historicalExperimentExecutedFromTemporaryCopy: true,
    schemaStoreUsedAsGenerationSource: false,
  };
  artifacts["manifest.json"] = manifest;
  return { artifacts, manifest };
}
