import assert from "node:assert/strict";
import test from "node:test";
import {
  activeForVersion,
  compareVersions,
  keyFromCell,
  markdownTables,
  parseJsonExample,
  splitMarkdownRow,
  tableRecords,
  versionBounds,
} from "../src/extract/markdown.js";

test("markdown rows preserve pipes inside code spans and escaped pipes", () => {
  assert.deepEqual(splitMarkdownRow("| `a|b` | left\\|right | plain |"), [
    "`a|b`",
    "left\\|right",
    "plain",
  ]);
});

test("markdown table extraction is heading bounded and rejects malformed rows", () => {
  const markdown = `# Before
| Key | Example |
| --- | --- |
| \`alpha\` | true |
| malformed |

## After
| Name | Value |
| :--- | ---: |
| \`beta\` | \`x|y\` |`;
  const tables = markdownTables(markdown);
  assert.equal(tables.length, 2);
  assert.equal(tables[0]?.heading, "Before");
  assert.deepEqual(tableRecords(tables[0]!)[0], {
    key: "`alpha`",
    example: "true",
  });
  assert.equal(keyFromCell(tableRecords(tables[1]!)[0]?.name), "beta");
});

test("version bounds include both limits", () => {
  const bounds = versionBounds(
    "{/* min-version: 2.1.100 */} value {/* max-version: 2.1.207 */}",
  );
  assert.deepEqual(bounds, { minVersion: "2.1.100", maxVersion: "2.1.207" });
  assert.equal(activeForVersion(bounds, "2.1.100"), true);
  assert.equal(activeForVersion(bounds, "2.1.208"), false);
  assert.equal(compareVersions("2.1.10", "2.1.9"), 1);
});

test("JSON examples parse primitives, paths, and invalid prose", () => {
  assert.deepEqual(parseJsonExample("true"), { parsed: true, value: true });
  assert.deepEqual(parseJsonExample("`~/bin/helper`"), {
    parsed: true,
    value: "~/bin/helper",
  });
  assert.deepEqual(parseJsonExample("not json"), {
    parsed: false,
    display: "not json",
  });
});

test("invalid table row syntax fails explicitly", () => {
  assert.throws(
    () => splitMarkdownRow("not a table"),
    /start and end with a pipe/,
  );
});
