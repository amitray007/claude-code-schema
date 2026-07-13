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
  assert.match(workflow, /gh release create "\$tag".*--title "\$tag"/);
  assert.doesNotMatch(workflow, /claude-code-v\$\{VERSION\}/);
  assert.match(workflow, /sha256sum -- \*\.json/);
  assert.match(workflow, /subject-path: output\/\*\.json/);
  assert.match(workflow, /SHA256SUMS output\/\*\.json/);
  assert.doesNotMatch(workflow, /tar -/);
  assert.doesNotMatch(workflow, /latest\//);
  assert.doesNotMatch(workflow, /site\//);
  assert.doesNotMatch(workflow, /Pages/);
});
