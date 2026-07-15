import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runProcess } from "../src/shared/process.js";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const cli = resolve(repositoryRoot, "dist/src/cli.js");

async function runCli(args: string[]) {
  return runProcess(process.execPath, [cli, ...args], { cwd: repositoryRoot });
}

test("CLI exposes the production commands", async () => {
  const result = await runCli(["help"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /generate/);
  assert.match(result.stdout, /validate/);
  assert.match(result.stdout, /discover/);
  assert.match(result.stdout, /release-notes/);
  assert.match(result.stdout, /--allow-historical-docs/);
});

test("CLI rejects unknown commands", async () => {
  const result = await runCli(["unknown"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unknown command/);
});

test("CLI runs the offline generate, validate, diff, issue, and stage lifecycle", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "schema-cli-test-"));
  const candidate = resolve(root, "candidate");
  const validationFile = resolve(root, "validation.json");
  const diffFile = resolve(root, "diff.json");
  const issueFile = resolve(root, "issue.md");
  const source = resolve(repositoryRoot, "experiments/version-4/output");

  const generated = await runCli([
    "generate",
    "--version",
    "2.1.207",
    "--source",
    source,
    "--output",
    candidate,
    "--base-url",
    "https://schemas.test.example/claude-code",
  ]);
  assert.equal(generated.code, 0, generated.stderr);
  assert.equal(JSON.parse(generated.stdout).version, "2.1.207");

  const validated = await runCli([
    "validate",
    "--directory",
    candidate,
    "--report",
    validationFile,
  ]);
  assert.equal(validated.code, 0, validated.stderr);
  assert.equal(
    JSON.parse(await readFile(validationFile, "utf8")).status,
    "passed",
  );

  const diffed = await runCli([
    "diff",
    "--from",
    candidate,
    "--to",
    candidate,
    "--output",
    diffFile,
  ]);
  assert.equal(diffed.code, 0, diffed.stderr);
  assert.deepEqual(JSON.parse(diffed.stdout).settingsPaths.added, []);

  const issue = await runCli([
    "issue",
    "--directory",
    candidate,
    "--diff",
    diffFile,
    "--workflow-url",
    "https://github.example/runs/1",
    "--output",
    issueFile,
  ]);
  assert.equal(issue.code, 0, issue.stderr);
  assert.match(
    await readFile(issueFile, "utf8"),
    /Source and semantic drift reviewed/,
  );

  const releaseNotesFile = resolve(root, "release-notes.md");
  const releaseNotes = await runCli([
    "release-notes",
    "--directory",
    candidate,
    "--diff",
    diffFile,
    "--output",
    releaseNotesFile,
  ]);
  assert.equal(releaseNotes.code, 0, releaseNotes.stderr);
  assert.match(await readFile(releaseNotesFile, "utf8"), /Count changes/);

  const staged = await runCli([
    "stage",
    "--candidate",
    candidate,
    "--publication-root",
    resolve(root, "publication"),
  ]);
  assert.equal(staged.code, 0, staged.stderr);
  assert.equal(JSON.parse(staged.stdout).version, "2.1.207");
});

test("CLI rejects missing values and unknown options", async () => {
  const missing = await runCli(["validate", "--directory"]);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /requires a value/);
  const unknown = await runCli(["generate", "--unknown", "value"]);
  assert.equal(unknown.code, 1);
  assert.match(unknown.stderr, /Unknown option/);
  const positional = await runCli(["generate", "unexpected"]);
  assert.equal(positional.code, 1);
  assert.match(positional.stderr, /Unexpected positional argument/);
});
