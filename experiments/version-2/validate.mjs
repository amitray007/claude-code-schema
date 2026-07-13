import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const here = dirname(fileURLToPath(import.meta.url));
const readJson = async (...parts) =>
  JSON.parse(await readFile(resolve(here, ...parts), "utf8"));
const readText = async (...parts) => readFile(resolve(here, ...parts), "utf8");
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

const [settingsSchema, envSchema, keybindingsSchema, flags, defaults, manifest] =
  await Promise.all([
    readJson("output", "settings.schema.json"),
    readJson("output", "env.schema.json"),
    readJson("output", "keybindings.schema.json"),
    readJson("output", "flags.catalog.json"),
    readJson("output", "keybinding-defaults.catalog.json"),
    readJson("output", "manifest.json")
  ]);

const [settingsExample, envExample, keybindingsExample] = await Promise.all([
  readJson("examples", "settings.json"),
  readJson("examples", "env.json"),
  readJson("examples", "keybindings.json")
]);

const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });

if (manifest.experimentVersion !== 2) {
  throw new Error(`Expected experimentVersion=2, got ${manifest.experimentVersion}`);
}

function validateExample(name, schema, example) {
  const validate = ajv.compile(schema);
  if (!validate(example)) {
    throw new Error(`${name} failed:\n${JSON.stringify(validate.errors, null, 2)}`);
  }
}

function expectRejected(name, schema, example) {
  const validate = ajv.compile(schema);
  if (validate(example)) {
    throw new Error(`${name} was expected to fail validation`);
  }
}

function expectAccepted(name, schema, example) {
  const validate = ajv.compile(schema);
  if (!validate(example)) {
    throw new Error(
      `${name} demonstrates an intended limitation but was rejected:\n${JSON.stringify(validate.errors, null, 2)}`
    );
  }
}

validateExample("settings example", settingsSchema, settingsExample);
validateExample("environment example", envSchema, envExample);
validateExample("keybindings example", keybindingsSchema, keybindingsExample);
expectAccepted("unverified settings type mutation", settingsSchema, {
  ...settingsExample,
  autoUpdatesChannel: 42
});
expectRejected("environment value mutation", envSchema, {
  ...envExample,
  HTTPS_PROXY: 42
});
expectRejected("keybindings context mutation", keybindingsSchema, {
  bindings: [{ context: "NotARealContext", bindings: { "ctrl+e": "chat:submit" } }]
});
expectRejected("keybindings action mutation", keybindingsSchema, {
  bindings: [{ context: "Chat", bindings: { "ctrl+e": "not-a-real:action" } }]
});

const floors = {
  documentedSettingsRows: 100,
  settingsSchemaProperties: 100,
  untypedSettingsProperties: 100,
  documentedEnvironmentVariables: 200,
  documentedTopLevelFlags: 50,
  documentedKeybindingActions: 80,
  documentedKeybindingContexts: 15,
  keybindingSchemaActions: 90
};
for (const [name, floor] of Object.entries(floors)) {
  if (manifest.counts[name] < floor) {
    throw new Error(`${name}=${manifest.counts[name]} fell below ${floor}`);
  }
}

if (flags.options.length !== manifest.counts.documentedTopLevelFlags) {
  throw new Error("Flag count does not match the manifest");
}
if (defaults.actions.length !== manifest.counts.documentedKeybindingActions) {
  throw new Error("Keybinding-default count does not match the manifest");
}
const flagNames = flags.options.flatMap(({ names }) => names);
if (new Set(flagNames).size !== flagNames.length) {
  throw new Error("A documented top-level flag spelling appears in multiple records");
}
const defaultIdentities = defaults.actions.map(
  ({ section, action }) => `${section}\u0000${action}`
);
if (new Set(defaultIdentities).size !== defaultIdentities.length) {
  throw new Error("A keybinding default repeats the same section/action identity");
}
if (
  Object.keys(envSchema.properties).length !==
  manifest.counts.documentedEnvironmentVariables
) {
  throw new Error("Environment rows collapsed onto duplicate property names");
}
if (manifest.sources.some(({ id }) => /schemastore/i.test(id))) {
  throw new Error("Experiment version 2 must not contain a SchemaStore source");
}
const docsOnlyActions =
  keybindingsSchema.properties.bindings.items.properties.bindings
    .additionalProperties.anyOf[0].enum;
if (new Set(docsOnlyActions).size !== manifest.counts.keybindingSchemaActions) {
  throw new Error("Docs-derived keybinding action enum does not match the manifest");
}
for (const [file, metadata] of Object.entries(manifest.artifacts)) {
  const actual = sha256(await readText("output", file));
  if (actual !== metadata.sha256) {
    throw new Error(`${file} digest ${actual} does not match manifest ${metadata.sha256}`);
  }
}

console.log(
  JSON.stringify(
    {
      status: "ok",
      experiment: "version-2-docs-only",
      claudeCodeVersion: manifest.claudeCodeVersion,
      validatedExamples: ["settings", "environment", "keybindings"],
      rejectedMutations: [
        "environment non-string value",
        "keybindings invalid context",
        "keybindings invalid action"
      ],
      acceptedLimitation: "settings known-property type is not validated without SchemaStore",
      counts: manifest.counts,
      note: "This experiment uses no SchemaStore source; the manifest records the resulting validation limitations."
    },
    null,
    2
  )
);
