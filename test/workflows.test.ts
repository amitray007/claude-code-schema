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

test("release discovery analyzes only npm latest and records superseded versions", async () => {
  const workflow = await readFile(
    resolve(repositoryRoot, ".github/workflows/discover-releases.yml"),
    "utf8",
  );
  assert.match(workflow, /analysisVersion \/\/ empty/);
  assert.match(workflow, /"\$version" != "\$analysis_version"/);
  assert.match(workflow, /--add-label superseded/);
  assert.match(workflow, /--reason "not planned"/);
  assert.match(workflow, /lifecycle_labels=\$\(gh issue view/);
  assert.match(workflow, /analysis-running\|analysis-failed\|needs-review/);
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
