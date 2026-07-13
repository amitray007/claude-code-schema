import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
  jsonSha256,
  jsonText,
  readJson,
  replaceDirectory,
  sha256,
  writeJson,
} from "../src/shared/json.js";
import { runProcess } from "../src/shared/process.js";

test("JSON helpers format deterministically and hash the exact emitted bytes", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "schema-json-test-"));
  const file = resolve(directory, "value.json");
  const value = { alpha: true, nested: { count: 2 } };
  await writeJson(file, value);
  assert.equal(await readFile(file, "utf8"), jsonText(value));
  assert.deepEqual(await readJson(file), value);
  assert.equal(jsonSha256(value), sha256(jsonText(value)));
});

test("directory replacement preserves the new complete directory", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "schema-replace-test-"));
  const destination = resolve(root, "published");
  const staging = resolve(root, "staging");
  await Promise.all([mkdir(destination), mkdir(staging)]);
  await Promise.all([
    writeFile(resolve(destination, "old"), "old"),
    writeFile(resolve(staging, "new"), "new"),
  ]);
  await replaceDirectory(staging, destination);
  assert.equal(await readFile(resolve(destination, "new"), "utf8"), "new");
  await assert.rejects(readFile(resolve(destination, "old"), "utf8"), /ENOENT/);
});

test("process runner captures output, enforces output bounds, and times out", async () => {
  const cwd = process.cwd();
  const success = await runProcess(
    process.execPath,
    ["-e", "process.stdout.write('ok')"],
    { cwd },
  );
  assert.equal(success.code, 0);
  assert.equal(success.stdout, "ok");

  await assert.rejects(
    runProcess(
      process.execPath,
      ["-e", "process.stdout.write('x'.repeat(1000))"],
      { cwd, maxOutputBytes: 10 },
    ),
    /exceeded 10 output bytes/,
  );

  const timedOut = await runProcess(
    process.execPath,
    ["-e", "setInterval(() => {}, 1000)"],
    { cwd, timeoutMs: 30 },
  );
  assert.equal(timedOut.signal, "SIGKILL");
});
