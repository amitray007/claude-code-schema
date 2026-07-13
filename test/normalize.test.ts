import assert from "node:assert/strict";
import test from "node:test";
import { normalizeArtifacts } from "../src/artifacts/normalize.js";
import type { JsonObject, SurfaceManifest } from "../src/domain/types.js";
import { jsonSha256 } from "../src/shared/json.js";

function manifest(): SurfaceManifest {
  return {
    schemaVersion: 1,
    experimentVersion: 4,
    artifactKind: "claude-code-surface-manifest",
    claudeCodeVersion: "2.1.207",
    sourcePolicy: "experiment",
    sources: [],
    artifacts: {},
    counts: {},
    drift: {},
    safety: { schemaStoreUsedAsGenerationSource: false },
    release: {},
  };
}

test("artifact normalization rewrites IDs, strips experiment markers, and hashes outputs", () => {
  const settings: JsonObject = {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "https://example.invalid/claude-code/2.1.207/settings.schema.json",
    title: "Settings — experiment",
    type: "object",
    properties: {},
    "x-experiment": "v4",
    "x-artifact-kind": "settings-json-schema",
  };
  const result = normalizeArtifacts(
    { "manifest.json": manifest(), "settings.schema.json": settings },
    "https://schemas.test/x/",
  );
  const normalized = result.artifacts["settings.schema.json"]!;
  assert.equal(
    normalized.$id,
    "https://schemas.test/x/v2.1.207/settings.schema.json",
  );
  assert.equal(normalized.title, "Settings");
  assert.equal(normalized["x-experiment"], undefined);
  assert.equal(result.manifest.experimentVersion, undefined);
  assert.equal(result.manifest.safety.schemaStoreUsedAsGenerationSource, false);
  assert.equal(
    result.manifest.artifacts["settings.schema.json"]?.sha256,
    jsonSha256(normalized),
  );
  assert.ok(result.artifacts["claude-code.schema.json"]);
});

test("normalization rejects an artifact set without a manifest", () => {
  assert.throws(
    () => normalizeArtifacts({}, "https://schemas.test"),
    /valid manifest/,
  );
});

test("production normalization removes historical AI review policy", () => {
  const result = normalizeArtifacts(
    {
      "manifest.json": manifest(),
      "changelog-review.schema.json": {
        title: "Claude Code changelog AI or human review",
        "x-review-policy": "AI output is advisory",
      },
      "changelog-hints.catalog.json": {
        policy: "Ambiguous entries enter AI or human review.",
      },
    },
    "https://schemas.test",
  );
  assert.doesNotMatch(
    JSON.stringify(result.artifacts),
    /\bAI\b|artificial intelligence/i,
  );
  assert.match(
    String(result.artifacts["changelog-review.schema.json"]?.title),
    /human review/,
  );
});
