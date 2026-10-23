import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { repositoryRoot } from "../src/config.js";

const script = await readFile(
  resolve(repositoryRoot, "experiments/version-3/generate.mjs"),
  "utf8",
);
const start = script.indexOf("function sectionLines(");
const end = script.indexOf("function parseCommands(", start);
assert.ok(start >= 0 && end > start);
const parseOptions = new Function(
  `${script.slice(start, end)}; return parseOptions;`,
)();

// Reduced from 2.1.309 --help: the example label is a wrapped description.
const help = `Usage: claude [options] [command] [prompt]

Options:
  --json-schema <schema>                JSON Schema for structured output
                                        validation (only works with --print).
                                        Example:
                                        {"type":"object"}
  --max-budget-usd <amount>             Maximum dollar amount to spend
  -p, --print                          Print response and exit
  -w, --worktree [name]                Create a worktree

Commands:
  doctor                               Check installation
    --not-a-root-option                A command description
`;

test("wrapped help labels do not truncate the options catalog", () => {
  const options = parseOptions(help);
  assert.deepEqual(
    options.map((option: { names: string[] }) => option.names),
    [
      ["--json-schema"],
      ["--max-budget-usd"],
      ["-p", "--print"],
      ["-w", "--worktree"],
    ],
  );
  assert.equal(options[0].valueArity, "required");
  assert.equal(options[3].valueArity, "optional");
});

test("real top-level sections still stop option extraction", () => {
  const options = parseOptions(
    help.replace("    --not-a-root-option", "  --not-a-root-option"),
  );
  assert.equal(options.length, 4);
  assert.deepEqual(parseOptions("Commands:\n  --command-only"), []);
});
