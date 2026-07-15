import assert from "node:assert/strict";
import test from "node:test";
import type {
  JsonObject,
  SurfaceManifest,
  ValidationReport,
} from "../src/domain/types.js";
import { releaseNotesMarkdown } from "../src/reports/release.js";

function manifest(): SurfaceManifest {
  return {
    schemaVersion: 1,
    artifactKind: "claude-code-surface-manifest",
    claudeCodeVersion: "2.1.208",
    sourcePolicy: "first-party evidence",
    sources: [
      {
        id: "matchingTagChangelog",
        requestedUrl:
          "https://raw.githubusercontent.com/anthropics/claude-code/v2.1.208/CHANGELOG.md",
      },
    ],
    artifacts: {},
    counts: {},
    drift: {},
    safety: {},
    release: {},
  };
}

const validation: ValidationReport = {
  schemaVersion: 1,
  artifactKind: "schema-validation-report",
  claudeCodeVersion: "2.1.208",
  status: "passed",
  checks: [],
  counts: { checks: 53 },
};

const catalog: JsonObject = {
  artifacts: [
    { file: "settings.schema.json", validates: "settings | configuration" },
    { file: "manifest.json", describes: "sources and digests" },
  ],
};

test("release notes include semantic paths, count deltas, changelog, and source limitations", () => {
  const notes = releaseNotesMarkdown(manifest(), validation, catalog, {
    fromVersion: "2.1.207",
    settingsPaths: { added: ["vimInsertModeRemaps"], removed: [] },
    artifacts: { added: ["review.catalog.json"], removed: [] },
    counts: {
      from: { typedSettingsProperties: 125, unchanged: 1 },
      to: { typedSettingsProperties: 127, unchanged: 1 },
    },
  });
  assert.match(notes, /Semantic changes from v2\.1\.207/);
  assert.match(notes, /`vimInsertModeRemaps`/);
  assert.match(notes, /Typed Settings Properties \| 125 \| 127 \| \+2/);
  assert.match(notes, /v2\.1\.208\/CHANGELOG\.md/);
  assert.match(notes, /Mutable documentation matched/);
  assert.match(notes, /settings \\| configuration/);
  assert.match(notes, /`SHA256SUMS`/);
});

test("release notes state when semantic counts and paths are unchanged", () => {
  const notes = releaseNotesMarkdown(manifest(), validation, catalog, {
    fromVersion: "2.1.207",
    settingsPaths: { added: [], removed: [] },
    artifacts: { added: [], removed: [] },
    counts: { from: { checks: 53 }, to: { checks: 53 } },
  });
  assert.match(notes, /No numeric manifest counts changed/);
  assert.match(notes, /Mutable documentation matched/);
  assert.equal((notes.match(/_None\._/g) ?? []).length, 4);
});
