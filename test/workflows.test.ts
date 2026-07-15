import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

test("GitHub releases use the unprefixed vX.Y.Z name", async () => {
  const workflow = await readFile(
    resolve(repositoryRoot, ".github/workflows/publish-release.yml"),
    "utf8",
  );
  assert.match(workflow, /tag="v\$\{VERSION\}"/);
  assert.match(workflow, /git config user\.name github-actions\[bot\]/);
  assert.match(workflow, /git config user\.email 41898282\+github-actions/);
  assert.match(workflow, /gh release create "\$tag".*--title "\$tag"/);
  assert.match(workflow, /Build release changelog from the catalog/);
  assert.match(workflow, /\.artifacts\[\]/);
  assert.match(workflow, /`SHA256SUMS`/);
  assert.match(workflow, /--notes-file \.work\/release\/RELEASE_NOTES\.md/);
  assert.doesNotMatch(workflow, /claude-code-v\$\{VERSION\}/);
  assert.match(workflow, /sha256sum -- \*\.json/);
  assert.match(workflow, /subject-path: output\/\*\.json/);
  assert.match(workflow, /SHA256SUMS output\/\*\.json/);
  assert.match(workflow, /gh release download "\$tag"/);
  assert.match(workflow, /cmp \.work\/release\/SHA256SUMS/);
  assert.match(workflow, /cmp "\$file"/);
  assert.doesNotMatch(workflow, /tar -/);
  assert.doesNotMatch(workflow, /latest\//);
  assert.doesNotMatch(workflow, /site\//);
  assert.doesNotMatch(workflow, /Pages/);
});

test("release discovery publishes only npm latest and records older versions", async () => {
  const workflow = await readFile(
    resolve(repositoryRoot, ".github/workflows/discover-releases.yml"),
    "utf8",
  );
  assert.match(workflow, /analysis_version=\$\(jq -r/);
  assert.match(workflow, /previous_release="\$AFTER_VERSION"/);
  assert.match(workflow, /predecessor="\$previous_release"/);
  assert.match(workflow, /"\$version" != "\$analysis_version"/);
  assert.match(workflow, /gh workflow run auto-release-version\.yml/);
  assert.match(workflow, /--add-label superseded/);
  assert.match(workflow, /lifecycle_labels=\$\(gh issue view/);
  assert.match(workflow, /analysis-running\|analysis-failed\|needs-review/);
});

test("automatic latest publication is immutable, retry-safe, and has no backfill path", async () => {
  const workflow = await readFile(
    resolve(repositoryRoot, ".github/workflows/auto-release-version.yml"),
    "utf8",
  );
  assert.match(workflow, /environment: production/);
  assert.match(
    workflow,
    /Generate latest candidate with read-only permissions/,
  );
  assert.match(workflow, /generate:[\s\S]*permissions:\n\s+contents: read/);
  assert.match(workflow, /Upload sanitized candidate and release bundle/);
  assert.match(workflow, /Download sanitized publication bytes/);
  assert.match(
    workflow,
    /Revalidate without executing the downloaded Claude binary/,
  );
  assert.match(
    workflow,
    /Download and validate the most recent immutable release/,
  );
  assert.match(workflow, /gh release download "v\$\{PREVIOUS_VERSION\}"/);
  assert.match(workflow, /Require a new version to remain npm latest/);
  assert.match(workflow, /npm run schema:generate/);
  assert.match(workflow, /npm run schema:release-notes/);
  assert.doesNotMatch(workflow, /schema:backfill|allow-historical-docs/);
  assert.match(workflow, /Detect an immutable retry/);
  assert.match(workflow, /diff -qr/);
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /subject-path: \.work\/artifact\/release\/\*\.json/);
  assert.match(workflow, /automation\/claude-code-\$\{VERSION\}/);
  assert.match(workflow, /update-issue:[\s\S]*issues: write/);
  assert.match(workflow, /--add-label published/);
  assert.match(workflow, /Automatic publication failed closed/);
});

test("release PR preparation uses a collision-free workflow-attempt branch", async () => {
  const workflow = await readFile(
    resolve(repositoryRoot, ".github/workflows/prepare-release-pr.yml"),
    "utf8",
  );
  assert.match(
    workflow,
    /automation\/claude-code-\$\{VERSION\}-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}/,
  );
});
