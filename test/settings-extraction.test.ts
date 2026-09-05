import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { Ajv } from "ajv";
import { repositoryRoot } from "../src/config.js";

// Import the same experiment modules used by the production generation engine.
const moduleUrl = (name: string) =>
  pathToFileURL(
    resolve(repositoryRoot, "experiments/version-4/lib", `${name}.mjs`),
  ).href;
const { referenceSections } = await import(moduleUrl("markdown"));
const { settingRecord, schemaForRecord, schemaFromDocumentedType } =
  await import(moduleUrl("settings"));

const source = { id: "settingsDocsExpanded", sha256: "fixture-digest" };
const reference = `## All settings

### \`keybindingFlavor\`

<Warning>
  Deprecated since v2.1.261 and has no effect. Claude Code still accepts
  \`keybindingFlavor\`, so a settings file that sets it stays valid.
</Warning>

* **Scope**: [\`Any file\`](#scopes)
* **Type**: string, \`"classic"\` or \`"readline"\`
* **Default**: unset

### \`prefersReducedMotion\`

* **Scope**: [\`Any file\`](#scopes)
* **Type**: Boolean
* **Default**: \`false\`

\`\`\`json settings.json
{ "prefersReducedMotion": true }
\`\`\`
`;

test("deprecated settings without examples retain documented type and values", () => {
  const [section] = referenceSections(reference, "## All settings");
  const record = settingRecord(section, source, "2.1.261");
  assert.equal(record.example.parsed, false);
  const schema = schemaForRecord(record);
  assert.equal(schema.type, "string");
  assert.deepEqual(schema.enum, ["classic", "readline"]);
  assert.equal(schema["x-type-status"], "independently-derived");
  assert.deepEqual(schema["x-provenance"].evidence, [
    {
      source: source.id,
      sourceSha256: source.sha256,
      heading: "keybindingFlavor",
      fact: "existence-and-type",
      method: "official-key-entry",
    },
  ]);
  assert.equal("examples" in schema, false);
  const validate = new Ajv({ strict: false }).compile(schema);
  for (const valid of ["classic", "readline"])
    assert.equal(validate(valid), true);
  for (const invalid of [true, 1, null, "vim", {}])
    assert.equal(validate(invalid), false);
});

test("existing examples retain their shape and provenance", () => {
  const [, section] = referenceSections(reference, "## All settings");
  const schema = schemaForRecord(settingRecord(section, source, "2.1.261"));
  assert.equal(schema.type, "boolean");
  assert.deepEqual(schema.examples, [true]);
  assert.equal(
    schema["x-provenance"].evidence[0].fact,
    "existence-and-example",
  );
});

test("explicit primitive types work without examples", () => {
  for (const type of [
    "string",
    "Boolean",
    "number",
    "integer",
    "object",
    "array",
  ]) {
    assert.deepEqual(schemaFromDocumentedType(type), {
      type: type.toLowerCase(),
    });
  }
  assert.deepEqual(
    schemaFromDocumentedType('string, `"one"`, `"two"`, or `"three"`'),
    { type: "string", enum: ["one", "two", "three"] },
  );
});

test("unknown and ambiguous type descriptions remain unconstrained", () => {
  const [section] = referenceSections(reference, "## All settings");
  for (const type of [
    "",
    "custom value",
    "string or Boolean",
    'string, for example `"classic"`',
    'string, `"classic"` or any other value',
  ]) {
    const schema = schemaForRecord(
      settingRecord({ ...section, type }, source, "2.1.261"),
    );
    assert.equal(schema.type, undefined);
    assert.equal(schema.enum, undefined);
    assert.equal(schema["x-type-status"], "unverified");
    assert.equal(schema["x-provenance"].evidence[0].fact, "existence");
  }
});
