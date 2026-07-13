import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const here = dirname(fileURLToPath(import.meta.url));
const readJson = async (...parts) =>
  JSON.parse(await readFile(resolve(here, ...parts), "utf8"));
const readText = async (...parts) => readFile(resolve(here, ...parts), "utf8");
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

const [
  settingsSchema,
  envSchema,
  keybindingsSchema,
  reviewSchema,
  flags,
  defaults,
  cli,
  binaryCandidates,
  changelogHints,
  manifest
] = await Promise.all([
  readJson("output", "settings.schema.json"),
  readJson("output", "env.schema.json"),
  readJson("output", "keybindings.schema.json"),
  readJson("output", "changelog-review.schema.json"),
  readJson("output", "flags.catalog.json"),
  readJson("output", "keybinding-defaults.catalog.json"),
  readJson("output", "cli.catalog.json"),
  readJson("output", "binary-candidates.catalog.json"),
  readJson("output", "changelog-hints.catalog.json"),
  readJson("output", "manifest.json")
]);
const [settingsExample, envExample, keybindingsExample, reviewExample] =
  await Promise.all([
    readJson("examples", "settings.json"),
    readJson("examples", "env.json"),
    readJson("examples", "keybindings.json"),
    readJson("examples", "changelog-review.json")
  ]);

if (manifest.experimentVersion !== 3) {
  throw new Error(`Expected experimentVersion=3, got ${manifest.experimentVersion}`);
}
if (manifest.sources.some((source) => /schemastore/i.test(JSON.stringify(source)))) {
  throw new Error("Experiment version 3 must not contain a SchemaStore source");
}
for (const id of [
  "npmRelease",
  "settingsDocs",
  "envDocs",
  "cliDocs",
  "keybindingsDocs",
  "platformPackageMetadata",
  "platformTarball",
  "platformBinary",
  "matchingTagChangelog",
  "githubReleaseNotes"
]) {
  if (!manifest.sources.some((source) => source.id === id)) {
    throw new Error(`Manifest is missing source ${id}`);
  }
}
if (!manifest.release.platformIntegrityVerified) {
  throw new Error("Platform package integrity was not verified");
}
if (
  !manifest.safety.binaryExecuted ||
  manifest.safety.binaryRedistributed ||
  manifest.safety.rawStringsRedistributed ||
  manifest.safety.rawHelpRedistributed
) {
  throw new Error("Manifest safety assertions do not describe the bounded probe");
}

const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
function expectAccepted(name, schema, value) {
  const validate = ajv.compile(schema);
  if (!validate(value)) {
    throw new Error(`${name} failed:\n${JSON.stringify(validate.errors, null, 2)}`);
  }
}
function expectRejected(name, schema, value) {
  const validate = ajv.compile(schema);
  if (validate(value)) throw new Error(`${name} was expected to fail validation`);
}
expectAccepted("settings example", settingsSchema, settingsExample);
expectAccepted("environment example", envSchema, envExample);
expectAccepted("keybindings example", keybindingsSchema, keybindingsExample);
expectAccepted("changelog review example", reviewSchema, reviewExample);
expectAccepted("known settings type remains unverified", settingsSchema, {
  ...settingsExample,
  autoUpdatesChannel: 42
});
expectRejected("environment non-string mutation", envSchema, {
  ...envExample,
  HTTPS_PROXY: 42
});
expectRejected("invalid keybinding action", keybindingsSchema, {
  bindings: [{ context: "Chat", bindings: { "ctrl+e": "not-a-real:action" } }]
});

const root = cli.commands.find(({ commandPath }) => commandPath.join(" ") === "claude");
if (!root || root.exitCode !== 0 || root.timedOut || root.outputExceeded) {
  throw new Error("Root CLI help probe did not complete safely");
}
if (!root.options.some(({ names }) => names.includes("--print"))) {
  throw new Error("Root CLI probe did not recover --print");
}
if (!root.arguments.some(({ name, valueArity }) =>
  name === "prompt" && valueArity === "optional")) {
  throw new Error("Root CLI probe did not recover the optional prompt argument");
}
if (!root.childCommands.some(({ name }) => name === "mcp")) {
  throw new Error("Root CLI probe did not recover the mcp subcommand");
}
for (const command of cli.commands) {
  if (
    command.exitCode !== 0 ||
    command.timedOut ||
    command.outputExceeded ||
    command.invocation.at(-1) !== "--help"
  ) {
    throw new Error(`Unsafe or failed probe record: ${command.commandPath.join(" ")}`);
  }
  if (command.commandPath.length > 1) {
    const parentPath = command.commandPath.slice(0, -1);
    const parent = cli.commands.find(
      (candidate) => candidate.commandPath.join("\u0000") === parentPath.join("\u0000")
    );
    if (!parent?.childCommands.some(({ name, aliases }) =>
      name === command.commandPath.at(-1) || aliases.includes(command.commandPath.at(-1)))) {
      throw new Error(`Probe path was not discovered from parent help: ${command.commandPath.join(" ")}`);
    }
  }
}

const reviewHashes = new Set(changelogHints.entries.map(({ bulletSha256 }) => bulletSha256));
for (const review of reviewExample.reviews) {
  if (!reviewHashes.has(review.bulletSha256)) {
    throw new Error(`Review example references an unknown changelog bullet: ${review.bulletSha256}`);
  }
}
if (!changelogHints.entries.every(({ needsReview }) => needsReview)) {
  throw new Error("Every changelog bullet must enter the advisory review stage");
}
if (flags.options.length !== manifest.counts.documentedTopLevelFlags) {
  throw new Error("Documented flag count does not match the manifest");
}
if (defaults.actions.length !== manifest.counts.documentedKeybindingActions) {
  throw new Error("Keybinding-default count does not match the manifest");
}

const floors = {
  probedCommands: 30,
  probedOptionsAcrossCommands: 100,
  probedArgumentsAcrossCommands: 10,
  uniqueProbedOptionNames: 90,
  staticEnvironmentCandidates: 300,
  retainedStaticCliOptionCandidates: 80,
  binaryCorroboratedDocumentedSettings: 90,
  binaryCorroboratedDocumentedKeybindingActions: 80,
  changelogBullets: 1,
  changelogEntriesNeedingReview: 1
};
for (const [name, floor] of Object.entries(floors)) {
  if (manifest.counts[name] < floor) {
    throw new Error(`${name}=${manifest.counts[name]} fell below ${floor}`);
  }
}
if (
  binaryCandidates.cliOptions.length !==
  manifest.counts.retainedStaticCliOptionCandidates
) {
  throw new Error("Retained static CLI candidate count does not match the manifest");
}

for (const [file, metadata] of Object.entries(manifest.artifacts)) {
  const actual = sha256(await readText("output", file));
  if (actual !== metadata.sha256) {
    throw new Error(`${file} digest ${actual} does not match manifest ${metadata.sha256}`);
  }
}
const outputFiles = await readdir(resolve(here, "output"));
if (outputFiles.some((file) => !file.endsWith(".json"))) {
  throw new Error("Version 3 output must contain distilled JSON only");
}

console.log(
  JSON.stringify(
    {
      status: "ok",
      experiment: "version-3-independent-package-and-cli-probe",
      claudeCodeVersion: manifest.claudeCodeVersion,
      platformPackage: manifest.release.selectedPlatformPackage,
      validatedExamples: ["settings", "environment", "keybindings", "changelog review"],
      probePolicy: cli.probePolicy,
      counts: manifest.counts,
      acceptedLimitation:
        "Static binary evidence does not independently prove settings value types."
    },
    null,
    2
  )
);
