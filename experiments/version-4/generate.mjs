import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  activeForVersion,
  keyFromCell,
  markdownTables,
  parseJsonExample,
  stripMarkdown,
  tableRecords,
  versionBounds
} from "./lib/markdown.mjs";
import { mergeSchema, schemaFromValue, setDottedProperty, withEvidence } from "./lib/schema.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, "../..");
const version3Directory = resolve(here, "../version-3");
const outputDirectory = resolve(here, "output");
const argv = process.argv.slice(2);

function argumentValue(name) {
  const index = argv.indexOf(name);
  if (index === -1) return null;
  if (!argv[index + 1] || argv[index + 1].startsWith("--")) throw new Error(`${name} requires a value`);
  return argv[index + 1];
}
const requestedVersion = argumentValue("--version") ?? "latest";
const requestedPlatformPackage = argumentValue("--platform-package");
const knownArguments = new Set(["--version", "--platform-package"]);
for (let index = 0; index < argv.length; index += 2) {
  if (!knownArguments.has(argv[index])) throw new Error(`Unknown argument: ${argv[index]}`);
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;
const readJson = async (...parts) => JSON.parse(await readFile(resolve(...parts), "utf8"));
const isConstrained = (schema) => Boolean(schema?.type || schema?.enum || schema?.const !== undefined || schema?.anyOf || schema?.oneOf);

async function runProcess(command, args, options = {}) {
  const { cwd = repositoryRoot, env = process.env, timeoutMs = 30_000, maxOutputBytes = 8 * 1024 * 1024 } = options;
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    const append = (current, chunk) => {
      const next = Buffer.concat([current, chunk]);
      if (next.length > maxOutputBytes) child.kill("SIGKILL");
      return next.subarray(0, maxOutputBytes);
    };
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    child.on("error", rejectPromise);
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code, signal, stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8") });
    });
  });
}

async function fetchSource(id, url, role) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "claude-schema-first-party-v4-experiment/0.0.0" }
  });
  if (!response.ok) throw new Error(`${id}: ${response.status} ${response.statusText}`);
  const text = await response.text();
  if (!text.trim()) throw new Error(`${id}: source was empty`);
  return {
    id,
    requestedUrl: url,
    resolvedUrl: response.url,
    role,
    sha256: sha256(text),
    bytes: Buffer.byteLength(text),
    text
  };
}

function evidence(source, heading, fact, method = "official-markdown-table") {
  return [{ source: source.id, sourceSha256: source.sha256, heading, fact, method }];
}

function tableByHeading(source, heading) {
  const table = markdownTables(source.text).find((candidate) => candidate.heading === heading);
  if (!table) throw new Error(`${source.id}: missing table under ${heading}`);
  return table;
}

function settingRecord(record, heading, source, version) {
  const keyCell = record.key ?? record.keys;
  const key = keyFromCell(keyCell);
  if (!key) return null;
  const bounds = versionBounds(`${record.description ?? ""} ${record.example ?? ""}`);
  if (!activeForVersion(bounds, version)) return null;
  const parsed = parseJsonExample(record.example);
  const description = (record.description ?? "")
    .replace(/\{\/\*\s*(?:min|max)-version:\s*[^*]+\*\/\}/g, "")
    .trim();
  const scopes = /^\(Managed settings only\)/i.test(description)
    ? ["managed"]
    : /Read from user(?: settings)?, (?:the )?`--settings` flag, and managed settings only/i.test(description)
      ? ["user", "managed", "cli-settings"]
      : ["user", "project", "local", "managed", "cli-settings"];
  return {
    key,
    heading,
    bounds,
    example: parsed,
    scopes,
    evidence: evidence(source, heading, "existence-and-example")
  };
}

function schemaForRecord(record) {
  const base = record.example.parsed ? schemaFromValue(record.example.value) : {};
  return withEvidence({
    ...base,
    ...(record.bounds.minVersion ? { "x-min-version": record.bounds.minVersion } : {}),
    ...(record.bounds.maxVersion ? { "x-max-version": record.bounds.maxVersion } : {}),
    ...(record.example.parsed ? { examples: [record.example.value] } : {}),
    ...(record.scopes.length < 5 ? { "x-scopes": record.scopes } : {})
  }, record.evidence);
}

function enrichFromDescription(schema, description) {
  const result = { ...schema };
  const defaultMatch = description.match(/\*\*Default\*\*:\s*`([^`]+)`|Default:\s*(true|false|\d+)/i);
  if (defaultMatch) {
    const display = defaultMatch[1] ?? defaultMatch[2];
    try { result.default = JSON.parse(display); } catch { result.default = display; }
  }
  return result;
}

async function findBinary(root) {
  const candidates = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) candidates.push({ path, size: (await stat(path)).size });
    }
  }
  await visit(root);
  const named = candidates.filter(({ path }) => /^(claude|claude\.exe)$/i.test(basename(path)));
  const usable = named.length ? named : candidates.filter(({ size }) => size > 10_000_000);
  usable.sort((a, b) => b.size - a.size);
  if (!usable[0]) throw new Error("No Claude executable in verified platform archive");
  return usable[0];
}

function isolatedEnvironment(home) {
  return {
    HOME: home,
    CLAUDE_CONFIG_DIR: resolve(home, "config"),
    TMPDIR: resolve(home, "tmp"),
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    LANG: "C",
    LC_ALL: "C",
    TERM: "dumb",
    NO_COLOR: "1",
    CI: "1",
    DISABLE_AUTOUPDATER: "1",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    CLAUDE_CODE_DISABLE_TELEMETRY: "1"
  };
}

function parseDoctorDiagnostics(output) {
  const diagnostics = [];
  for (const line of output.split("\n")) {
    const match = /^- .* › ([^:]+): (.+)$/.exec(line);
    if (!match) continue;
    const [, path, message] = match;
    const expected = /Expected (?:an? )?([a-z]+), but received/i.exec(message)?.[1]?.toLowerCase();
    const enumDisplay = /Expected one of: (.+)$/.exec(message)?.[1];
    const enumValues = enumDisplay ? [...enumDisplay.matchAll(/"([^"]+)"/g)].map((entry) => entry[1]) : [];
    const typeMap = { boolean: "boolean", string: "string", number: "number", integer: "integer", array: "array", object: "object", record: "object" };
    diagnostics.push({ path, messageSha256: sha256(message), ...(typeMap[expected] ? { type: typeMap[expected] } : {}), ...(enumValues.length ? { type: "string", enum: enumValues } : {}) });
  }
  return diagnostics;
}

async function runtimeSettingsProbe(binaryPath, names, workspace) {
  const home = resolve(workspace, "doctor-home");
  const env = isolatedEnvironment(home);
  await Promise.all([mkdir(env.CLAUDE_CONFIG_DIR, { recursive: true }), mkdir(env.TMPDIR, { recursive: true })]);
  const sentinel = Object.fromEntries(names.map((name) => [name, null]));
  await writeFile(resolve(env.CLAUDE_CONFIG_DIR, "settings.json"), jsonText(sentinel));
  const result = await runProcess(binaryPath, ["doctor"], { cwd: home, env, timeoutMs: 20_000 });
  const output = `${result.stdout}\n${result.stderr}`;
  if (!output.includes("Invalid settings") || !output.includes("Claude Code doctor")) {
    throw new Error(`Doctor validation oracle did not produce expected diagnostics: ${output.slice(0, 500)}`);
  }
  const diagnostics = parseDoctorDiagnostics(output);
  const stableDiagnostics = [...diagnostics].sort((left, right) => left.path.localeCompare(right.path));
  return {
    probe: {
      operation: "claude doctor with null sentinels in isolated settings.json",
      stdin: "closed",
      networkSuppressionRequested: true,
      credentialsInherited: false,
      rawOutputRedistributed: false,
      configSha256: sha256(jsonText(sentinel)),
      diagnosticsSha256: sha256(jsonText(stableDiagnostics)),
      rawOutputExcludedFromDeterministicArtifacts: true,
      exitCode: result.code
    },
    diagnostics: stableDiagnostics
  };
}

async function inspectKeybindingCapabilities(binaryPath, documentedActions) {
  const namespaces = new Set(documentedActions.map((action) => action.split(":", 1)[0]));
  const candidates = new Set();
  const child = spawn("strings", ["-a", binaryPath], { stdio: ["ignore", "pipe", "pipe"] });
  let buffer = "";
  let stderr = "";
  const inspect = (text) => {
    for (const match of text.matchAll(/\b([a-z][A-Za-z0-9]*:[A-Za-z][A-Za-z0-9]*)\b/g)) {
      if (namespaces.has(match[1].split(":", 1)[0])) candidates.add(match[1]);
    }
    if (candidates.size > 2_000) child.kill("SIGKILL");
  };
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) inspect(line);
  });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  const code = await new Promise((resolvePromise, rejectPromise) => {
    child.on("error", rejectPromise);
    child.on("close", resolvePromise);
  });
  if (buffer) inspect(buffer);
  if (code !== 0 || candidates.size > 2_000) throw new Error(`Keybinding static capability extraction failed: ${stderr}`);
  return [...candidates].sort();
}

const v3Arguments = [resolve(version3Directory, "generate.mjs")];
if (requestedVersion !== "latest") v3Arguments.push("--version", requestedVersion);
if (requestedPlatformPackage) v3Arguments.push("--platform-package", requestedPlatformPackage);
const v3Result = await runProcess(process.execPath, v3Arguments, { timeoutMs: 180_000, maxOutputBytes: 32 * 1024 * 1024 });
if (v3Result.code !== 0) throw new Error(`Version 3 base generation failed:\n${v3Result.stderr}`);

const v3Manifest = await readJson(version3Directory, "output", "manifest.json");
const version = v3Manifest.claudeCodeVersion;
const inheritedEnvSchema = await readJson(version3Directory, "output", "env.schema.json");
const sourceDefinitions = {
  settingsDocsExpanded: ["https://code.claude.com/docs/en/settings.md", "settings, scopes, global config, worktree, permissions, sandbox, attribution, helpers, and plugin settings"],
  envDocsExpanded: ["https://code.claude.com/docs/en/env-vars.md", "primary configurable environment-variable reference and cross-references"],
  keybindingsDocsExpanded: ["https://code.claude.com/docs/en/keybindings.md", "contexts, actions, version bounds, keystroke syntax, unbinding, validation behavior"],
  pluginReferenceDocs: ["https://code.claude.com/docs/en/plugins-reference.md", "plugin configuration and plugin settings"],
  statuslineDocs: ["https://code.claude.com/docs/en/statusline.md", "statusLine and subagentStatusLine structures"],
  desktopDocs: ["https://code.claude.com/docs/en/desktop.md", "Desktop-only managed settings"],
  hooksDocs: ["https://code.claude.com/docs/en/hooks.md", "hook configuration structure"],
  monitoringDocs: ["https://code.claude.com/docs/en/monitoring-usage.md", "standard OpenTelemetry environment configuration"],
  autoModeConfigDocs: ["https://code.claude.com/docs/en/auto-mode-config.md", "autoMode nested rule structure"],
  voiceDictationDocs: ["https://code.claude.com/docs/en/voice-dictation.md", "voice nested settings"],
  sandboxingDocs: ["https://code.claude.com/docs/en/sandboxing.md", "sandbox behavior and nested configuration"],
  managedMcpDocs: ["https://code.claude.com/docs/en/managed-mcp.md", "managed MCP policy structures"],
  serverManagedSettingsDocs: ["https://code.claude.com/docs/en/server-managed-settings.md", "server-managed settings delivery and scope"],
  officialSettingsExamplesReadme: [`https://raw.githubusercontent.com/anthropics/claude-code/v${version}/examples/settings/README.md`, "tag-pinned official settings examples"],
  officialStrictSettingsExample: [`https://raw.githubusercontent.com/anthropics/claude-code/v${version}/examples/settings/settings-strict.json`, "tag-pinned strict settings example"],
  officialSandboxSettingsExample: [`https://raw.githubusercontent.com/anthropics/claude-code/v${version}/examples/settings/settings-bash-sandbox.json`, "tag-pinned sandbox settings example"],
  officialManagedSettingsExample: [`https://raw.githubusercontent.com/anthropics/claude-code/v${version}/examples/mdm/managed-settings.json`, "tag-pinned managed settings example"],
  officialHookValidator: [`https://raw.githubusercontent.com/anthropics/claude-code/v${version}/plugins/plugin-dev/skills/hook-development/scripts/validate-hook-schema.sh`, "tag-pinned official hook validation logic"]
};
const fetched = await Promise.all(Object.entries(sourceDefinitions).map(([id, [url, role]]) => fetchSource(id, url, role)));
const sources = Object.fromEntries(fetched.map((source) => [source.id, source]));

for (const table of markdownTables(sources.monitoringDocs.text)) {
  const firstHeader = stripMarkdown(table.header[0] ?? "").toLowerCase();
  if (!firstHeader.includes("variable")) continue;
  for (const record of tableRecords(table)) {
    const firstValue = record[Object.keys(record)[0]];
    const name = keyFromCell(firstValue);
    if (!name || !/^[A-Z][A-Z0-9_]+$/.test(name)) continue;
    inheritedEnvSchema.properties[name] = mergeSchema(inheritedEnvSchema.properties[name], withEvidence({ type: "string" }, evidence(sources.monitoringDocs, table.heading, "environment-variable-existence-and-type", "official-table")));
  }
}
for (const name of ["OTEL_EXPORTER_OTLP_PROTOCOL", "OTEL_EXPORTER_OTLP_METRICS_PROTOCOL", "OTEL_EXPORTER_OTLP_LOGS_PROTOCOL", "OTEL_EXPORTER_OTLP_TRACES_PROTOCOL"]) {
  if (inheritedEnvSchema.properties[name]) inheritedEnvSchema.properties[name].enum = ["grpc", "http/json", "http/protobuf"];
}
if (inheritedEnvSchema.properties.OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE) {
  inheritedEnvSchema.properties.OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE.enum = ["delta", "cumulative"];
}
const environmentSupplements = [
  ["OTEL_RESOURCE_ATTRIBUTES", sources.monitoringDocs, "configurable-standard"],
  ["OTEL_EXPORTER_OTLP_CERTIFICATE", sources.monitoringDocs, "configurable-standard"],
  ["OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE", sources.monitoringDocs, "configurable-standard"],
  ["OTEL_EXPORTER_OTLP_CLIENT_KEY", sources.monitoringDocs, "configurable-standard"],
  ["NODE_EXTRA_CA_CERTS", sources.monitoringDocs, "configurable-standard"],
  ["ENABLE_BETA_TRACING_DETAILED", sources.monitoringDocs, "configurable-beta"],
  ["BETA_TRACING_ENDPOINT", sources.monitoringDocs, "configurable-beta"],
  ["AWS_REGION", sources.envDocsExpanded, "provider-standard-reference"],
  ["GOOGLE_APPLICATION_CREDENTIALS", sources.envDocsExpanded, "provider-standard-reference"]
];
for (const [name, source, scope] of environmentSupplements) {
  inheritedEnvSchema.properties[name] = mergeSchema(inheritedEnvSchema.properties[name], withEvidence({ type: "string", "x-environment-scope": scope }, evidence(source, "Referenced environment variables", "existence-and-string-process-type", "official-prose-reference")));
}

const settingsSource = sources.settingsDocsExpanded;
const availableTable = tableByHeading(settingsSource, "Available settings");
const availableRecords = tableRecords(availableTable)
  .map((record) => ({ raw: record, parsed: settingRecord(record, "Available settings", settingsSource, version) }))
  .filter(({ parsed }) => parsed);

const settingsProperties = {
  $schema: { type: "string", "x-type-status": "verified-by-json-schema-convention" }
};
const facts = [];
for (const { raw, parsed } of availableRecords) {
  let schema = enrichFromDescription(schemaForRecord(parsed), raw.description ?? "");
  if (parsed.key.includes(".")) setDottedProperty(settingsProperties, parsed.key, schema);
  else settingsProperties[parsed.key] = mergeSchema(settingsProperties[parsed.key], schema);
  facts.push({
    path: parsed.key,
    surface: "settings.json",
    scopes: parsed.scopes,
    status: "documented-active",
    typeEvidence: parsed.example.parsed ? "official-example" : "pending-runtime-or-structural-evidence",
    provenance: parsed.evidence
  });
}

const sectionMappings = [
  ["Worktree settings", "worktree"],
  ["Permission settings", "permissions"],
  ["Sandbox settings", "sandbox"]
];
for (const [heading, parent] of sectionMappings) {
  for (const raw of tableRecords(tableByHeading(settingsSource, heading))) {
    const parsed = settingRecord(raw, heading, settingsSource, version);
    if (!parsed) continue;
    const path = parsed.key.startsWith(`${parent}.`) ? parsed.key : `${parent}.${parsed.key}`;
    setDottedProperty(settingsProperties, path, enrichFromDescription(schemaForRecord(parsed), raw.description ?? ""));
    facts.push({ path, surface: "settings.json", scopes: parsed.scopes, status: "documented-active", typeEvidence: parsed.example.parsed ? "official-example" : "official-prose", provenance: parsed.evidence });
  }
}

const officialExampleSources = [sources.officialStrictSettingsExample, sources.officialSandboxSettingsExample, sources.officialManagedSettingsExample];
for (const source of officialExampleSources) {
  const example = JSON.parse(source.text);
  for (const [name, value] of Object.entries(example)) {
    settingsProperties[name] = mergeSchema(settingsProperties[name], withEvidence(schemaFromValue(value), evidence(source, "root", "example-shape", "official-tagged-json-example")));
  }
}

const manualFirstPartyOverlays = {
  attribution: { type: "object", properties: { commit: { type: "string" }, pr: { type: "string" }, sessionUrl: { type: "boolean", default: true } }, additionalProperties: true },
  fileSuggestion: { type: "object", required: ["type", "command"], properties: { type: { const: "command" }, command: { type: "string", minLength: 1 } }, additionalProperties: true },
  policyHelper: { type: "object", required: ["path"], properties: { path: { type: "string", minLength: 1 }, timeoutMs: { type: "number", exclusiveMinimum: 0 }, refreshIntervalMs: { type: "number", minimum: 0 } }, additionalProperties: true },
  enabledPlugins: { type: "object", additionalProperties: { type: "boolean" } },
  extraKnownMarketplaces: { type: "object", additionalProperties: { type: "object" } },
  pluginConfigs: { type: "object", additionalProperties: { type: "object" } },
  statusLine: { type: "object", required: ["type", "command"], properties: { type: { const: "command" }, command: { type: "string", minLength: 1 }, padding: { type: "integer", minimum: 0 }, refreshInterval: { type: "number", minimum: 1 }, hideVimModeIndicator: { type: "boolean" } }, additionalProperties: true },
  subagentStatusLine: { type: "object", required: ["type", "command"], properties: { type: { const: "command" }, command: { type: "string", minLength: 1 } }, additionalProperties: true },
  includeCoAuthoredBy: { type: "boolean", deprecated: true },
  forceLoginMethod: { type: "string", enum: ["claudeai", "console", "gateway"] },
  forceLoginOrgUUID: { type: "string", minLength: 1 },
  vimInsertModeRemaps: {
    type: "object",
    propertyNames: { pattern: "^[ -~]{2}$" },
    additionalProperties: { const: "<Esc>" }
  },
  fastMode: { type: "boolean", "x-public-status": "runtime-recognized-undocumented" }
};
const overlaySources = {
  attribution: settingsSource,
  fileSuggestion: settingsSource,
  policyHelper: settingsSource,
  enabledPlugins: settingsSource,
  extraKnownMarketplaces: settingsSource,
  pluginConfigs: sources.pluginReferenceDocs,
  statusLine: sources.statuslineDocs,
  subagentStatusLine: sources.statuslineDocs,
  includeCoAuthoredBy: settingsSource,
  forceLoginMethod: settingsSource,
  forceLoginOrgUUID: settingsSource,
  vimInsertModeRemaps: settingsSource,
  fastMode: null
};
for (const [name, overlay] of Object.entries(manualFirstPartyOverlays)) {
  const source = overlaySources[name];
  settingsProperties[name] = mergeSchema(settingsProperties[name], source
    ? withEvidence(overlay, evidence(source, name, "structure", "official-prose-and-example"))
    : { ...overlay, "x-type-status": "exact-binary-doctor" });
  if (!facts.some(({ path }) => path === name)) {
    facts.push({ path: name, surface: "settings.json", scopes: ["user", "project", "local", "managed", "cli-settings"], status: name === "includeCoAuthoredBy" ? "documented-deprecated" : source ? "documented-active" : "runtime-recognized-undocumented", typeEvidence: source ? "official-prose-and-example" : "exact-binary-doctor", ...(source ? { provenance: evidence(source, name, "existence-and-structure", "official-prose-and-example") } : {}) });
  }
}

settingsProperties.env = mergeSchema(settingsProperties.env, {
  type: "object",
  properties: structuredClone(inheritedEnvSchema.properties),
  additionalProperties: { type: "string" },
  "x-type-status": "official-environment-reference",
  "x-provenance": inheritedEnvSchema["x-provenance"]
});
settingsProperties.autoMode = mergeSchema(settingsProperties.autoMode, withEvidence({
  type: "object",
  properties: {
    environment: { type: "array", items: { type: "string" } },
    allow: { type: "array", items: { type: "string" } },
    soft_deny: { type: "array", items: { type: "string" } },
    hard_deny: { type: "array", items: { type: "string" } },
    classifyAllShell: { type: "boolean", default: false }
  },
  additionalProperties: true
}, evidence(sources.autoModeConfigDocs, "Configure auto mode", "autoMode-structure", "official-description-and-examples")));
settingsProperties.voice = mergeSchema(settingsProperties.voice, withEvidence({
  type: "object",
  properties: {
    enabled: { type: "boolean" },
    mode: { type: "string", enum: ["hold", "tap"] },
    autoSubmit: { type: "boolean" }
  },
  additionalProperties: true
}, evidence(sources.voiceDictationDocs, "Configure voice", "voice-structure", "official-description")));
settingsProperties.strictPluginOnlyCustomization = withEvidence({
  anyOf: [
    { const: true },
    { type: "array", items: { type: "string" }, uniqueItems: true }
  ],
  "x-scopes": ["managed"]
}, evidence(settingsSource, "strictPluginOnlyCustomization", "union-value-shape", "official-prose-and-example"));
settingsProperties.spinnerVerbs = mergeSchema(settingsProperties.spinnerVerbs, {
  type: "object",
  properties: { mode: { enum: ["append", "replace"] }, verbs: { type: "array", items: { type: "string" } } },
  additionalProperties: true
});
settingsProperties.skillOverrides = mergeSchema(settingsProperties.skillOverrides, {
  type: "object",
  additionalProperties: { enum: ["on", "name-only", "user-invocable-only", "off"] }
});
settingsProperties.modelOverrides = mergeSchema(settingsProperties.modelOverrides, { type: "object", additionalProperties: { type: "string" } });
for (const [name, values] of Object.entries({
  askUserQuestionTimeout: ["60s", "5m", "10m", "never"],
  editorMode: ["normal", "vim"],
  effortLevel: ["low", "medium", "high", "xhigh"],
  preferredNotifChannel: ["auto", "terminal_bell", "iterm2", "iterm2_with_bell", "kitty", "ghostty", "notifications_disabled"],
  teammateMode: ["in-process", "auto", "tmux", "iterm2"],
  viewMode: ["default", "verbose", "focus"]
})) {
  settingsProperties[name] = mergeSchema(settingsProperties[name], { type: "string", enum: values });
}

setDottedProperty(settingsProperties, "permissions.defaultMode", {
  type: "string",
  enum: ["default", "acceptEdits", "plan", "auto", "dontAsk", "bypassPermissions", "manual"]
});
setDottedProperty(settingsProperties, "permissions.disableBypassPermissionsMode", { const: "disable" });
setDottedProperty(settingsProperties, "worktree.baseRef", { type: "string", enum: ["fresh", "head"] });
setDottedProperty(settingsProperties, "worktree.bgIsolation", { type: "string", enum: ["worktree", "none"] });

const hookEventTable = tableByHeading(sources.hooksDocs, "Hook lifecycle");
const hookEvents = tableRecords(hookEventTable).map((record) => keyFromCell(record.event)).filter(Boolean);
const hookCommonProperties = {
  if: { type: "string" },
  timeout: { type: "number", exclusiveMinimum: 0 },
  statusMessage: { type: "string" },
  once: { type: "boolean" }
};
const handler = (type, required, properties) => ({
  type: "object",
  required: ["type", ...required],
  properties: { type: { const: type }, ...hookCommonProperties, ...properties },
  additionalProperties: true
});
const hookHandlerSchema = {
  oneOf: [
    handler("command", ["command"], { command: { type: "string", minLength: 1 }, args: { type: "array", items: { type: "string" } }, async: { type: "boolean" }, asyncRewake: { type: "boolean" }, shell: { enum: ["bash", "powershell"] } }),
    handler("http", ["url"], { url: { type: "string", minLength: 1 }, headers: { type: "object", additionalProperties: { type: "string" } }, allowedEnvVars: { type: "array", items: { type: "string" } } }),
    handler("mcp_tool", ["server", "tool"], { server: { type: "string", minLength: 1 }, tool: { type: "string", minLength: 1 }, input: { type: "object" } }),
    handler("prompt", ["prompt"], { prompt: { type: "string", minLength: 1 }, model: { type: "string" } }),
    handler("agent", ["prompt"], { prompt: { type: "string", minLength: 1 }, model: { type: "string" } })
  ]
};
const hookMatcherSchema = {
  type: "object",
  required: ["hooks"],
  properties: {
    matcher: { type: "string" },
    hooks: { type: "array", minItems: 1, items: { $ref: "#/definitions/hookHandler" } }
  },
  additionalProperties: true
};
settingsProperties.hooks = withEvidence({
  type: "object",
  properties: Object.fromEntries(hookEvents.map((event) => [event, { type: "array", items: { $ref: "#/definitions/hookMatcher" } }])),
  additionalProperties: false
}, evidence(sources.hooksDocs, "Hook lifecycle and Hook handler fields", "event-and-handler-structure", "official-tables-and-examples"));

const platformTarballSource = v3Manifest.sources.find(({ id }) => id === "platformTarball");
if (!platformTarballSource?.requestedUrl || !platformTarballSource.sha256) throw new Error("Version 3 manifest lacks verified platform tarball source");
const workspace = await mkdtemp(resolve(tmpdir(), "claude-schema-v4-"));
let runtimeProbe;
let binaryMetadata;
let keybindingStaticCandidates;
try {
  const archiveResponse = await fetch(platformTarballSource.requestedUrl, { redirect: "follow" });
  if (!archiveResponse.ok) throw new Error(`Platform archive: ${archiveResponse.status}`);
  const archive = Buffer.from(await archiveResponse.arrayBuffer());
  if (sha256(archive) !== platformTarballSource.sha256) throw new Error("Platform archive digest differs from Version 3 verified source");
  const archivePath = resolve(workspace, "platform.tgz");
  const extractDirectory = resolve(workspace, "extracted");
  await Promise.all([writeFile(archivePath, archive), mkdir(extractDirectory, { recursive: true })]);
  const extraction = await runProcess("tar", ["-xzf", archivePath, "-C", extractDirectory], { cwd: workspace, timeoutMs: 120_000 });
  if (extraction.code !== 0) throw new Error(`tar extraction failed: ${extraction.stderr}`);
  const binary = await findBinary(extractDirectory);
  await chmod(binary.path, 0o755);
  const binaryBytes = await readFile(binary.path);
  const binarySha256 = sha256(binaryBytes);
  if (binarySha256 !== v3Manifest.release.binarySha256) throw new Error("Extracted binary differs from Version 3 verified binary");
  runtimeProbe = await runtimeSettingsProbe(binary.path, Object.keys(settingsProperties).filter((name) => name !== "$schema"), workspace);
  const currentDocumentedActions = (await readJson(version3Directory, "output", "keybinding-defaults.catalog.json")).actions.map(({ action }) => action);
  keybindingStaticCandidates = await inspectKeybindingCapabilities(binary.path, currentDocumentedActions);
  binaryMetadata = {
    source: "platformBinary",
    sha256: binarySha256,
    pathInPackage: relative(extractDirectory, binary.path),
    commandBindingPatternCorroborated: binaryBytes.includes(Buffer.from("^command:[a-zA-Z0-9:\\-_]+$")),
    commandBindingValidatorMessageCorroborated: binaryBytes.includes(Buffer.from("Command binding \""))
  };
} finally {
  await rm(workspace, { recursive: true, force: true });
}

for (const diagnostic of runtimeProbe.diagnostics) {
  if (diagnostic.path.includes(".")) continue;
  const schema = settingsProperties[diagnostic.path];
  if (!schema) continue;
  const runtimeSchema = { ...(diagnostic.type ? { type: diagnostic.type } : {}), ...(diagnostic.enum ? { enum: diagnostic.enum } : {}), "x-runtime-validation": { ...binaryMetadata, operation: "doctor-null-sentinel", diagnosticSha256: diagnostic.messageSha256 } };
  settingsProperties[diagnostic.path] = mergeSchema(schema, runtimeSchema);
  const fact = facts.find(({ path }) => path === diagnostic.path);
  if (fact) fact.runtimeCorroborated = true;
}

const settingsSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: `https://example.invalid/claude-code/${version}/settings.schema.json`,
  title: "Claude Code settings — first-party multi-source experiment",
  description: "Compatibility schema independently derived from official docs, tagged examples, the verified release binary validation oracle, and scoped first-party references. Unknown future settings remain allowed.",
  type: "object",
  properties: settingsProperties,
  definitions: {
    hookHandler: hookHandlerSchema,
    hookMatcher: hookMatcherSchema
  },
  additionalProperties: true,
  "x-claude-code-version": version,
  "x-artifact-kind": "settings-json-schema",
  "x-experiment": "first-party-multi-source-no-schemastore",
  "x-provenance": { evidence: evidence(settingsSource, "Available settings", "settings-surface") }
};

const globalProperties = {};
for (const raw of tableRecords(tableByHeading(settingsSource, "Global config settings"))) {
  const parsed = settingRecord(raw, "Global config settings", settingsSource, version);
  if (!parsed) continue;
  globalProperties[parsed.key] = enrichFromDescription(schemaForRecord(parsed), raw.description ?? "");
}
const globalConfigSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: `https://example.invalid/claude-code/${version}/global-config.schema.json`,
  title: "Claude Code global config (~/.claude.json)",
  type: "object",
  properties: globalProperties,
  additionalProperties: true,
  "x-claude-code-version": version,
  "x-artifact-kind": "global-config-json-schema",
  "x-surface-path": "~/.claude.json"
};
if (globalConfigSchema.properties.workflowSizeGuideline) {
  globalConfigSchema.properties.workflowSizeGuideline.enum = ["unrestricted", "small", "medium", "large"];
}

const desktopManagedSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: `https://example.invalid/claude-code/${version}/desktop-managed-settings.schema.json`,
  title: "Claude Desktop managed settings",
  type: "object",
  properties: {
    managedMcpServers: withEvidence({ type: "object", additionalProperties: true }, evidence(sources.desktopDocs, "Managed settings", "existence-and-type", "official-prose")),
    sshHostAllowlist: withEvidence({ type: "array", items: { type: "string" } }, evidence(sources.desktopDocs, "Managed settings", "existence-and-type", "official-prose"))
  },
  additionalProperties: true,
  "x-claude-code-version": version,
  "x-artifact-kind": "desktop-managed-settings-json-schema",
  "x-surface": "Claude Desktop policy, not Claude Code settings.json"
};

const v3Keybindings = await readJson(version3Directory, "output", "keybindings.schema.json");
const v3Defaults = await readJson(version3Directory, "output", "keybinding-defaults.catalog.json");
const activeActions = [...new Set(v3Defaults.actions.map(({ action }) => action))].sort();
const commandBinding = { type: "string", pattern: "^command:[a-zA-Z0-9:_-]+$", "x-status": binaryMetadata.commandBindingPatternCorroborated ? "exact-release-binary-validator-corroborated" : "unverified-compatibility-capability", "x-binary": binaryMetadata };
const keybindingsSchema = structuredClone(v3Keybindings);
keybindingsSchema.title = "Claude Code keybindings — first-party and compatibility-capability experiment";
keybindingsSchema["x-experiment"] = "first-party-multi-source-no-schemastore";
keybindingsSchema["x-validation-limitations"] = ["The current official docs do not document command: bindings; the narrowly patterned compatibility form is accepted but annotated as unverified for this release.", "The keystroke grammar checks token structure without guessing the exhaustive terminal key vocabulary."];
const bindingValue = keybindingsSchema.properties.bindings.items.properties.bindings.additionalProperties;
bindingValue.anyOf = [{ type: "string", enum: activeActions }, commandBinding, { type: "null" }];
keybindingsSchema.properties.bindings.items.properties.bindings.propertyNames = {
  type: "string",
  pattern: "^[^\\s+]+(?:\\+[^\\s+]+)*(?: [^\\s+]+(?:\\+[^\\s+]+)*)*$"
};
const keybindingsRuntimeCompatSchema = structuredClone(keybindingsSchema);
keybindingsRuntimeCompatSchema.$id = `https://example.invalid/claude-code/${version}/keybindings.runtime-compat.schema.json`;
keybindingsRuntimeCompatSchema.title = "Claude Code keybindings — exact parser compatibility";
keybindingsRuntimeCompatSchema.properties.bindings.items.properties.bindings.additionalProperties = {
  anyOf: [{ type: "string" }, { type: "null" }]
};
keybindingsRuntimeCompatSchema["x-artifact-kind"] = "keybindings-runtime-compat-json-schema";
keybindingsRuntimeCompatSchema["x-runtime-semantics"] = "The exact release parser accepts string actions and emits debug/UI validation warnings for malformed command bindings, unknown contexts, duplicates, reserved keys, and parse issues. Use keybindings.schema.json when current documented-action validation is desired.";

const retiredActions = [];
for (const table of markdownTables(sources.keybindingsDocsExpanded.text).filter(({ header }) => stripMarkdown(header[0]).toLowerCase() === "action")) {
  for (const raw of tableRecords(table)) {
    const action = keyFromCell(raw.action);
    const bounds = versionBounds(raw.description ?? "");
    if (action && !activeForVersion(bounds, version)) retiredActions.push({ action, status: "retired-for-release", ...bounds, source: "keybindingsDocsExpanded" });
  }
}
if (/max-version:\s*2\.1\.204[\s\S]{0,300}`doctor:fix`/.test(sources.keybindingsDocsExpanded.text)) {
  retiredActions.push({ action: "doctor:fix", status: "retired-for-release", maxVersion: "2.1.204", source: "keybindingsDocsExpanded" });
}

const legacyCandidates = {
  schemaVersion: 1,
  artifactKind: "legacy-and-unverified-candidate-catalog",
  claudeCodeVersion: version,
  policy: "These are accounted-for compatibility candidates, not generated public settings. Promotion requires direct current first-party evidence.",
  settings: [
    { name: "skipDangerousModePermissionPrompt", status: "documented-at-nested-path", replacementPath: "permissions.skipDangerousModePermissionPrompt", source: "settingsDocsExpanded" },
    { name: "managedMcpServers", status: "different-product-surface", artifact: "desktop-managed-settings.schema.json", source: "desktopDocs" },
    { name: "sshHostAllowlist", status: "different-product-surface", artifact: "desktop-managed-settings.schema.json", source: "desktopDocs" },
    { name: "maxSkillDescriptionChars", status: "unverified-legacy-or-renamed", possibleReplacement: "skillListingMaxDescChars" },
    { name: "skippedMarketplaces", status: "unverified-legacy" },
    { name: "skippedPlugins", status: "unverified-legacy" },
    { name: "leftArrowOpensAgents", status: "unverified-legacy" }
  ],
  paths: [
    { path: "permissions.disableAutoMode", status: "legacy-nested-alias", replacementPath: "disableAutoMode" },
    { path: "sandbox.ignoreViolations", status: "unverified-legacy" },
    { path: "sandbox.ripgrep", status: "unverified-legacy" },
    { path: "sandbox.ripgrep.command", status: "unverified-legacy" },
    { path: "sandbox.ripgrep.args", status: "unverified-legacy" },
    { path: "sandbox.enabledPlatforms", status: "unverified-legacy" }
  ],
  keybindingActions: retiredActions,
  commandBinding
};

const settingsFactsCatalog = {
  schemaVersion: 1,
  artifactKind: "settings-fact-and-scope-catalog",
  claudeCodeVersion: version,
  surfaces: {
    "settings.json": ["user", "project", "local", "managed", "cli-settings"],
    "~/.claude.json": ["global-config"],
    "desktop-managed-settings": ["desktop-policy"]
  },
  facts: facts.sort((a, b) => a.path.localeCompare(b.path)),
  runtimeValidation: { binary: binaryMetadata, ...runtimeProbe.probe, diagnosticCount: runtimeProbe.diagnostics.length }
};

const keybindingCapabilitiesCatalog = {
  schemaVersion: 1,
  artifactKind: "keybinding-runtime-capability-catalog",
  claudeCodeVersion: version,
  binary: binaryMetadata,
  policy: "Documented actions are public. Other exact-binary tokens in documented action namespaces are runtime candidates and require behavioral or first-party documentation evidence before promotion.",
  commandBinding,
  actions: keybindingStaticCandidates.map((action) => ({
    action,
    status: activeActions.includes(action) ? "documented-active" : "exact-binary-token-candidate"
  }))
};

const environmentCapabilitiesCatalog = {
  schemaVersion: 1,
  artifactKind: "environment-capability-and-scope-catalog",
  claudeCodeVersion: version,
  configurableVariables: Object.keys(inheritedEnvSchema.properties).sort(),
  supplements: environmentSupplements.map(([name, source, scope]) => ({ name, scope, source: source.id })),
  providedToHooks: [{ name: "CLAUDE_PROJECT_DIR", scope: "hook-runtime-provided", source: "hooksDocs" }],
  retired: [{ name: "CLAUDE_CODE_OPUS_4_6_FAST_MODE_OVERRIDE", maxVersion: "2.1.159", source: "envDocsExpanded" }],
  unverifiedLegacy: [{ name: "CLOUD_ML_REGION", status: "no-current-first-party-evidence" }]
};

const inheritedFiles = ["env.schema.json", "flags.catalog.json", "keybinding-defaults.catalog.json", "cli.catalog.json", "binary-candidates.catalog.json", "changelog-hints.catalog.json", "changelog-review.schema.json"];
const artifactPayloads = {
  "settings.schema.json": settingsSchema,
  "global-config.schema.json": globalConfigSchema,
  "desktop-managed-settings.schema.json": desktopManagedSchema,
  "keybindings.schema.json": keybindingsSchema,
  "keybindings.runtime-compat.schema.json": keybindingsRuntimeCompatSchema,
  "settings-facts.catalog.json": settingsFactsCatalog,
  "legacy-candidates.catalog.json": legacyCandidates,
  "keybinding-capabilities.catalog.json": keybindingCapabilitiesCatalog,
  "environment-capabilities.catalog.json": environmentCapabilitiesCatalog,
  "env.schema.json": inheritedEnvSchema
};
for (const file of inheritedFiles.filter((file) => file !== "env.schema.json")) artifactPayloads[file] = await readJson(version3Directory, "output", file);

const addedSources = fetched.map(({ text, ...metadata }) => metadata);
const manifest = {
  schemaVersion: 1,
  experimentVersion: 4,
  sourcePolicy: "current-official-docs-tagged-official-github-examples-verified-platform-binary-validation-and-v3-cli-probes-no-schemastore",
  artifactKind: "claude-code-surface-manifest",
  claudeCodeVersion: version,
  release: v3Manifest.release,
  sources: [...v3Manifest.sources, ...addedSources],
  artifacts: Object.fromEntries(Object.entries(artifactPayloads).map(([file, payload]) => [file, { artifactKind: payload["x-artifact-kind"] ?? payload.artifactKind ?? "json-schema", sha256: sha256(jsonText(payload)) }])),
  counts: {
    ...v3Manifest.counts,
    settingsSchemaProperties: Object.keys(settingsProperties).length,
    untypedSettingsProperties: Object.values(settingsProperties).filter((schema) => !isConstrained(schema)).length,
    typedSettingsProperties: Object.values(settingsProperties).filter(isConstrained).length,
    settingsFacts: facts.length,
    runtimeSettingsDiagnostics: runtimeProbe.diagnostics.length,
    environmentSchemaProperties: Object.keys(inheritedEnvSchema.properties).length,
    globalConfigProperties: Object.keys(globalProperties).length,
    desktopManagedProperties: Object.keys(desktopManagedSchema.properties).length,
    legacyCandidatesAccounted: legacyCandidates.settings.length,
    retiredKeybindingActions: retiredActions.length,
    runtimeKeybindingActionCandidates: keybindingStaticCandidates.length
  },
  drift: {
    ...v3Manifest.drift,
    dottedSettingsRequiringStructuralResolution: [],
    validationLimitations: {
      settings: [
        "Compatibility objects remain open when first-party evidence does not prove a closed set.",
        "Exact-binary doctor diagnostics independently cover top-level validation; nested constraints come from official tables, examples, and specialized pages.",
        "Legacy and binary-only candidates are cataloged rather than published as current settings."
      ],
      keybindings: [
        "keybindings.schema.json validates current documented actions; exact-binary-only actions remain candidates.",
        "keybindings.runtime-compat.schema.json models the parser's warning-tolerant string action behavior.",
        "Keystroke validation checks documented structural syntax without claiming an exhaustive terminal key vocabulary."
      ]
    },
    untypedTopLevelSettings: Object.entries(settingsProperties).filter(([name, schema]) => name !== "$schema" && !isConstrained(schema)).map(([name]) => name),
    runtimeAcceptedNullOrUnreported: Object.keys(settingsProperties).filter((name) => name !== "$schema" && !runtimeProbe.diagnostics.some(({ path }) => path === name)),
    legacyOrDifferentSurfaceCandidates: legacyCandidates.settings.map(({ name, status }) => ({ name, status }))
  },
  safety: {
    ...v3Manifest.safety,
    doctorValidationProbeExecuted: true,
    doctorRawOutputRedistributed: false,
    doctorProbe: runtimeProbe.probe,
    schemaStoreUsedAsGenerationSource: false
  }
};

await mkdir(outputDirectory, { recursive: true });
for (const [file, payload] of Object.entries({ ...artifactPayloads, "manifest.json": manifest })) {
  await writeFile(resolve(outputDirectory, file), jsonText(payload));
}
console.log(jsonText({ version, outputDirectory, counts: manifest.counts, drift: { untypedTopLevelSettings: manifest.drift.untypedTopLevelSettings.length, runtimeAcceptedNullOrUnreported: manifest.drift.runtimeAcceptedNullOrUnreported.length, legacyOrDifferentSurfaceCandidates: manifest.drift.legacyOrDifferentSurfaceCandidates.length } }));
