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

if (manifest.experimentVersion !== 1) {
  throw new Error(`Expected experimentVersion=1, got ${manifest.experimentVersion}`);
}
for (const requiredSource of ["settingsSchemaStore", "keybindingsSchemaStore"]) {
  if (!manifest.sources.some(({ id }) => id === requiredSource)) {
    throw new Error(`Experiment version 1 is missing ${requiredSource}`);
  }
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

validateExample("settings example", settingsSchema, settingsExample);
validateExample("environment example", envSchema, envExample);
validateExample("keybindings example", keybindingsSchema, keybindingsExample);
expectRejected("settings type mutation", settingsSchema, {
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

const floors = {
  documentedSettingsRows: 100,
  settingsSchemaProperties: 120,
  documentedEnvironmentVariables: 200,
  documentedTopLevelFlags: 50,
  documentedKeybindingActions: 80,
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
if (manifest.drift.documentedActionsMissingFromSchema.length) {
  throw new Error(
    `The keybindings schema is missing documented actions: ${manifest.drift.documentedActionsMissingFromSchema.join(", ")}`
  );
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
      claudeCodeVersion: manifest.claudeCodeVersion,
      validatedExamples: ["settings", "environment", "keybindings"],
      rejectedMutations: [
        "settings known-property type",
        "environment non-string value",
        "keybindings invalid context"
      ],
      counts: manifest.counts,
      note: "Schema-only actions absent from docs remain a reported drift, not an automatic failure."
    },
    null,
    2
  )
);
