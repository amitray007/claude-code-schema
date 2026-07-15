import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import type {
  JsonObject,
  SurfaceManifest,
  ValidationReport,
} from "../src/domain/types.js";
import { releaseNotesMarkdown } from "../src/reports/release.js";
import { readJson, sha256 } from "../src/shared/json.js";
import { runProcess } from "../src/shared/process.js";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function manifest(historical: boolean): SurfaceManifest {
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
    drift: historical
      ? {
          historicalDocumentationSnapshot: {
            requestedVersion: "2.1.208",
            documentationVersionContext: "2.1.210",
            policy: "best-effort-discovery-snapshot",
            limitation:
              "Mutable documentation may contain later unmarked facts.",
          },
        }
      : {},
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

test("release notes include semantic paths, count deltas, changelog, and historical limitations", () => {
  const notes = releaseNotesMarkdown(manifest(true), validation, catalog, {
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
  assert.match(notes, /Historical documentation warning/);
  assert.match(notes, /settings \\| configuration/);
  assert.match(notes, /`SHA256SUMS`/);
});

test("release notes state when semantic counts and paths are unchanged", () => {
  const notes = releaseNotesMarkdown(manifest(false), validation, catalog, {
    fromVersion: "2.1.207",
    settingsPaths: { added: [], removed: [] },
    artifacts: { added: [], removed: [] },
    counts: { from: { checks: 53 }, to: { checks: 53 } },
  });
  assert.match(notes, /No numeric manifest counts changed/);
  assert.match(notes, /Mutable documentation matched/);
  assert.equal((notes.match(/_None\._/g) ?? []).length, 4);
});

test("local backfill builds the production asset layout and stages only the final candidate", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "schema-backfill-test-"));
  const work = resolve(root, "work");
  const publication = resolve(root, "publication");
  const source = resolve(repositoryRoot, "output");
  const version = (
    await readJson<SurfaceManifest>(resolve(source, "manifest.json"))
  ).claudeCodeVersion;
  const script = resolve(repositoryRoot, "scripts/backfill-releases.sh");
  const result = await runProcess(
    "bash",
    [
      script,
      "--versions",
      version,
      "--previous",
      source,
      "--candidate",
      source,
      "--work-directory",
      work,
      "--publication-root",
      publication,
    ],
    { cwd: repositoryRoot, timeoutMs: 120_000 },
  );
  assert.equal(result.code, 0, `${result.stderr}\n${result.stdout}`);
  const bundle = resolve(work, "releases", version);
  const entries = (await readdir(bundle)).sort();
  assert.equal(entries.filter((file) => file.endsWith(".json")).length, 15);
  assert.deepEqual(
    entries.filter((file) => !file.endsWith(".json")),
    ["RELEASE_NOTES.md", "SHA256SUMS"],
  );
  assert.equal(entries.includes("semantic-diff.json"), false);
  const checksumLines = (await readFile(resolve(bundle, "SHA256SUMS"), "utf8"))
    .trim()
    .split("\n");
  assert.equal(checksumLines.length, 15);
  for (const line of checksumLines) {
    const match = /^([a-f0-9]{64})\s+(.+)$/.exec(line);
    assert.ok(match, line);
    assert.equal(match[1], sha256(await readFile(resolve(bundle, match[2]!))));
  }
  assert.match(
    await readFile(resolve(bundle, "RELEASE_NOTES.md"), "utf8"),
    new RegExp(`Semantic changes from v${version.replaceAll(".", "\\.")}`),
  );
  assert.equal(
    await readFile(resolve(publication, "output/manifest.json"), "utf8"),
    await readFile(resolve(source, "manifest.json"), "utf8"),
  );
});
