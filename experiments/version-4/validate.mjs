import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const here = dirname(fileURLToPath(import.meta.url));
const readJson = async (...parts) => JSON.parse(await readFile(resolve(here, ...parts), "utf8"));
const readText = async (...parts) => readFile(resolve(here, ...parts), "utf8");
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

const [settings, globalConfig, desktopManaged, keybindings, keybindingsRuntimeCompat, facts, legacy, keybindingCapabilities, environmentCapabilities, env, flags, defaults, cli, manifest] = await Promise.all([
  readJson("output", "settings.schema.json"),
  readJson("output", "global-config.schema.json"),
  readJson("output", "desktop-managed-settings.schema.json"),
  readJson("output", "keybindings.schema.json"),
  readJson("output", "keybindings.runtime-compat.schema.json"),
  readJson("output", "settings-facts.catalog.json"),
  readJson("output", "legacy-candidates.catalog.json"),
  readJson("output", "keybinding-capabilities.catalog.json"),
  readJson("output", "environment-capabilities.catalog.json"),
  readJson("output", "env.schema.json"),
  readJson("output", "flags.catalog.json"),
  readJson("output", "keybinding-defaults.catalog.json"),
  readJson("output", "cli.catalog.json"),
  readJson("output", "manifest.json")
]);
const [settingsExample, globalExample, desktopExample, keybindingsExample] = await Promise.all([
  readJson("examples", "settings.json"),
  readJson("examples", "global-config.json"),
  readJson("examples", "desktop-managed-settings.json"),
  readJson("examples", "keybindings.json")
]);

if (manifest.experimentVersion !== 4) throw new Error("Expected experimentVersion=4");
if (/schemastore/i.test(JSON.stringify(manifest.sources))) throw new Error("Version 4 generation sources must not include SchemaStore");
if (manifest.safety.schemaStoreUsedAsGenerationSource !== false) throw new Error("Manifest must explicitly reject SchemaStore generation input");
if (manifest.drift.untypedTopLevelSettings.length || manifest.drift.dottedSettingsRequiringStructuralResolution.length) throw new Error("Resolved V3 settings limitations leaked into the V4 manifest");
if (manifest.drift.validationLimitations.settings.some((value) => /not validated|not reconstructed/i.test(value))) throw new Error("V4 manifest still claims the V3 partial-settings limitation");
for (const id of ["settingsDocsExpanded", "envDocsExpanded", "keybindingsDocsExpanded", "pluginReferenceDocs", "statuslineDocs", "desktopDocs", "hooksDocs", "monitoringDocs", "autoModeConfigDocs", "voiceDictationDocs", "sandboxingDocs", "managedMcpDocs", "serverManagedSettingsDocs", "officialStrictSettingsExample", "officialManagedSettingsExample", "platformBinary"]) {
  if (!manifest.sources.some((source) => source.id === id)) throw new Error(`Missing first-party source ${id}`);
}

const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
function accept(label, schema, value) {
  const validate = ajv.compile(schema);
  if (!validate(value)) throw new Error(`${label}: ${JSON.stringify(validate.errors, null, 2)}`);
}
function reject(label, schema, value) {
  const validate = ajv.compile(schema);
  if (validate(value)) throw new Error(`${label} was expected to fail`);
}
accept("settings example", settings, settingsExample);
accept("global config example", globalConfig, globalExample);
accept("desktop managed example", desktopManaged, desktopExample);
accept("keybindings example", keybindings, keybindingsExample);
accept("command binding compatibility form", keybindings, { bindings: [{ context: "Chat", bindings: { "ctrl+x ctrl+r": "command:review:current-file" } }] });
reject("bad nested permission mode", settings, { permissions: { defaultMode: "unsafe" } });
reject("bad sandbox boolean", settings, { sandbox: { enabled: "yes" } });
reject("bad hook handler", settings, { hooks: { PostToolUse: [{ hooks: [{ type: "command" }] }] } });
reject("bad global workflow size", globalConfig, { workflowSizeGuideline: "huge" });
reject("bad desktop allowlist", desktopManaged, { sshHostAllowlist: "example.com" });
reject("unknown keybinding action", keybindings, { bindings: [{ context: "Chat", bindings: { "ctrl+e": "unknown:action" } }] });
accept("runtime-compatible unknown action string", keybindingsRuntimeCompat, { bindings: [{ context: "Chat", bindings: { "ctrl+e": "app:openArtifact" } }] });
accept("runtime-compatible malformed command warning", keybindingsRuntimeCompat, { bindings: [{ context: "Chat", bindings: { "ctrl+e": "command:not valid" } }] });
reject("runtime-incompatible object action", keybindingsRuntimeCompat, { bindings: [{ context: "Chat", bindings: { "ctrl+e": { command: "review" } } }] });
reject("arbitrary keybinding object", keybindings, { bindings: [{ context: "Chat", bindings: { "ctrl+e": { command: "anything" } } }] });
reject("malformed keystroke", keybindings, { bindings: [{ context: "Chat", bindings: { "ctrl++e": "chat:externalEditor" } }] });

const properties = Object.entries(settings.properties).filter(([name]) => name !== "$schema");
if (properties.some(([name]) => name.includes("."))) throw new Error("Dotted settings must be structurally nested, not literal top-level keys");
const untyped = properties.filter(([, schema]) => !schema.type && !schema.enum && schema.const === undefined && !schema.anyOf && !schema.oneOf);
if (untyped.length) throw new Error(`Untyped settings remain: ${untyped.map(([name]) => name).join(", ")}`);
for (const path of ["permissions.skipDangerousModePermissionPrompt", "worktree.baseRef", "sandbox.network.allowedDomains"]) {
  let current = settings;
  for (const part of path.split(".")) current = current.properties?.[part];
  if (!current?.type && !current?.enum && !current?.const) throw new Error(`Missing nested constraint ${path}`);
}
if (Object.keys(settings.definitions ?? {}).length < 2) throw new Error("Hook structures were not reconstructed");
if (Object.keys(settings.properties.hooks.properties ?? {}).length < 25) throw new Error("Hook event coverage is unexpectedly low");
if (facts.runtimeValidation.diagnosticCount < 100) throw new Error("Runtime settings oracle coverage is unexpectedly low");
if (facts.facts.length < 150) throw new Error("Fact-level settings/path coverage is unexpectedly low");
if (Object.keys(globalConfig.properties).length < 5 || Object.keys(desktopManaged.properties).length < 2) throw new Error("Scoped config artifacts are incomplete");
if (!legacy.settings.some(({ replacementPath }) => replacementPath === "permissions.skipDangerousModePermissionPrompt")) throw new Error("Moved nested setting is not accounted for");
if (!keybindingCapabilities.binary.commandBindingPatternCorroborated || !keybindingCapabilities.binary.commandBindingValidatorMessageCorroborated) throw new Error("Exact binary did not corroborate command-binding validation");
if (keybindingCapabilities.actions.filter(({ status }) => status === "exact-binary-token-candidate").length < 10) throw new Error("Runtime keybinding candidate coverage is unexpectedly low");
if (environmentCapabilities.configurableVariables.length < 300 || !environmentCapabilities.providedToHooks.some(({ name }) => name === "CLAUDE_PROJECT_DIR")) throw new Error("Environment scope coverage is unexpectedly low");
if (cli.commands.length < 30 || flags.options.length < 60 || defaults.actions.length < 100 || Object.keys(env.properties).length < 250) throw new Error("Inherited V3 coverage regressed");

for (const [file, metadata] of Object.entries(manifest.artifacts)) {
  const actual = sha256(await readText("output", file));
  if (actual !== metadata.sha256) throw new Error(`${file} digest differs from manifest`);
}
const outputFiles = await readdir(resolve(here, "output"));
if (outputFiles.some((file) => !file.endsWith(".json"))) throw new Error("Output must contain distilled JSON only");

console.log(JSON.stringify({ status: "ok", experiment: "version-4-first-party-multi-source", claudeCodeVersion: manifest.claudeCodeVersion, validatedExamples: ["settings", "global config", "desktop managed settings", "keybindings"], counts: manifest.counts }, null, 2));
