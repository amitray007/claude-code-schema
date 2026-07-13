import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outputDirectory = resolve(here, "output");

const args = process.argv.slice(2);
const versionArgument = args.indexOf("--version");
if (versionArgument !== -1 && !args[versionArgument + 1]) {
  throw new Error("--version requires a value");
}

const requestedVersion =
  versionArgument === -1 ? "latest" : args[versionArgument + 1];

const sourceDefinitions = {
  npmRelease: {
    url: `https://registry.npmjs.org/@anthropic-ai/claude-code/${requestedVersion}`,
    role: "release identity and platform matrix"
  },
  npmLatest: {
    url: "https://registry.npmjs.org/@anthropic-ai/claude-code/latest",
    role: "guard that mutable docs are paired with the current release"
  },
  settingsDocs: {
    url: "https://code.claude.com/docs/en/settings.md",
    role: "public settings existence and prose"
  },
  envDocs: {
    url: "https://code.claude.com/docs/en/env-vars.md",
    role: "public environment-variable existence and prose"
  },
  cliDocs: {
    url: "https://code.claude.com/docs/en/cli-reference.md",
    role: "public top-level flags and prose"
  },
  keybindingsDocs: {
    url: "https://code.claude.com/docs/en/keybindings.md",
    role: "public actions, contexts, and default shortcuts"
  },
  docsIndex: {
    url: "https://code.claude.com/docs/llms.txt",
    role: "documentation route discovery"
  },
  settingsSchemaStore: {
    url: "https://json.schemastore.org/claude-code-settings.json",
    role: "settings types and constraints"
  },
  keybindingsSchemaStore: {
    url: "https://www.schemastore.org/claude-code-keybindings.json",
    role: "keybindings types and constraints"
  }
};

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function fetchSource(id, definition) {
  const response = await fetch(definition.url, {
    headers: { "user-agent": "claude-schema-store-experiment/0.0.0" },
    redirect: "follow"
  });
  if (!response.ok) {
    throw new Error(`${id}: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  if (!text.trim()) throw new Error(`${id}: source was empty`);
  return {
    id,
    requestedUrl: definition.url,
    resolvedUrl: response.url,
    role: definition.role,
    sha256: sha256(text),
    bytes: Buffer.byteLength(text),
    text
  };
}

function stripMarkdown(value) {
  return value
    .replace(/\{\/\*\s*(?:min|max)-version:\s*[^*]+\*\/\}/g, "")
    .replace(/^`|`$/g, "")
    .trim();
}

function splitMarkdownRow(line) {
  const cells = [];
  let current = "";
  let escaped = false;
  let codeDelimiter = 0;

  for (let index = 1; index < line.length - 1; index += 1) {
    const character = line[index];
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      current += character;
      escaped = true;
      continue;
    }
    if (character === "`") {
      let run = 1;
      while (line[index + run] === "`") run += 1;
      current += "`".repeat(run);
      if (codeDelimiter === 0) codeDelimiter = run;
      else if (codeDelimiter === run) codeDelimiter = 0;
      index += run - 1;
      continue;
    }
    if (character === "|" && codeDelimiter === 0) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  cells.push(current.trim());
  return cells;
}

function isSeparatorRow(cells) {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function markdownTables(markdown, startHeading, endHeading) {
  const start = markdown.indexOf(startHeading);
  const end = markdown.indexOf(endHeading, start + startHeading.length);
  if (start === -1 || end === -1) {
    throw new Error(`Could not bound section ${startHeading}`);
  }

  const lines = markdown.slice(start, end).split("\n");
  const tables = [];
  let currentHeading = startHeading.replace(/^#+\s*/, "");

  for (let index = 0; index < lines.length; index += 1) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(lines[index]);
    if (heading) currentHeading = stripMarkdown(heading[2]);
    if (!lines[index].startsWith("|")) continue;

    const header = splitMarkdownRow(lines[index]);
    const separator = lines[index + 1]?.startsWith("|")
      ? splitMarkdownRow(lines[index + 1])
      : [];
    if (!separator.length || !isSeparatorRow(separator)) continue;

    const rows = [];
    index += 2;
    while (index < lines.length && lines[index].startsWith("|")) {
      const cells = splitMarkdownRow(lines[index]);
      if (cells.length === header.length) rows.push(cells);
      index += 1;
    }
    index -= 1;
    tables.push({ heading: currentHeading, header, rows });
  }
  return tables;
}

const versionMarkerPattern =
  /\{\/\*\s*(min|max)-version:\s*([0-9]+(?:\.[0-9]+)*)\s*\*\/\}/g;

function versionEvidence(text) {
  return {
    versionMarkers: [...text.matchAll(versionMarkerPattern)].map((match) => ({
      kind: match[1],
      version: match[2],
      characterOffset: match.index
    }))
  };
}

function rowVersionBounds(text) {
  const leading = new RegExp(`^\\s*${versionMarkerPattern.source}`).exec(text);
  if (!leading) return {};
  return { [`${leading[1]}Version`]: leading[2] };
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

function isActiveForVersion(record, version) {
  if (record.minVersion && compareVersions(version, record.minVersion) < 0) return false;
  if (record.maxVersion && compareVersions(version, record.maxVersion) > 0) return false;
  return true;
}

function firstTable(tables, firstHeader) {
  const table = tables.find(
    ({ header }) => stripMarkdown(header[0]).toLowerCase() === firstHeader
  );
  if (!table) throw new Error(`No table beginning with ${firstHeader}`);
  return table;
}

function recordsFromTable(table) {
  const headers = table.header.map((header) => stripMarkdown(header).toLowerCase());
  return table.rows.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index]]))
  );
}

function keyFromCell(cell) {
  const match = /^`([^`]+)`/.exec(cell.trim());
  return match?.[1] ?? null;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sourceExtension(...ids) {
  return {
    evidence: ids.map((id) => ({ source: id, sourceSha256: sources[id].sha256 }))
  };
}

const fetchedSources = await Promise.all(
  Object.entries(sourceDefinitions).map(([id, definition]) =>
    fetchSource(id, definition)
  )
);
const sources = Object.fromEntries(fetchedSources.map((source) => [source.id, source]));

const npmMetadata = JSON.parse(sources.npmRelease.text);
const latestNpmMetadata = JSON.parse(sources.npmLatest.text);
const version = npmMetadata.version;
if (requestedVersion !== "latest" && version !== requestedVersion) {
  throw new Error(`Registry returned ${version}, expected ${requestedVersion}`);
}
if (!npmMetadata.optionalDependencies || !npmMetadata.dist?.integrity) {
  throw new Error("npm metadata is missing platform packages or dist integrity");
}
if (version !== latestNpmMetadata.version) {
  throw new Error(
    `Official docs are mutable and currently describe latest=${latestNpmMetadata.version}; refusing to label them as historical ${version}. Use archived source bytes for historical regeneration.`
  );
}
for (const route of ["settings.md", "env-vars.md", "cli-reference.md", "keybindings.md"]) {
  if (!sources.docsIndex.text.includes(route)) {
    throw new Error(`Documentation index no longer advertises ${route}`);
  }
}

const settingsTables = markdownTables(
  sources.settingsDocs.text,
  "### Available settings",
  "### Global config settings"
);
const allSettingsRecords = recordsFromTable(firstTable(settingsTables, "key"))
  .map((record) => ({
    key: keyFromCell(record.key),
    ...rowVersionBounds(record.description),
    ...versionEvidence(record.description)
  }))
  .filter((record) => record.key);
const settingsRecords = allSettingsRecords.filter((record) =>
  isActiveForVersion(record, version)
);

const envTables = markdownTables(
  sources.envDocs.text,
  "## Variables",
  "## See also"
);
const allEnvRecords = recordsFromTable(firstTable(envTables, "variable"))
  .map((record) => ({
    name: keyFromCell(record.variable),
    ...rowVersionBounds(record.purpose),
    ...versionEvidence(record.purpose)
  }))
  .filter((record) => record.name);
const envRecords = allEnvRecords.filter((record) => isActiveForVersion(record, version));

const flagTables = markdownTables(
  sources.cliDocs.text,
  "## CLI flags",
  "### System prompt flags"
);
const allFlagRecords = recordsFromTable(firstTable(flagTables, "flag"))
  .map((record) => {
    const documentedSpellings = [...record.flag.matchAll(/`([^`]+)`/g)].map(
      (match) => match[1]
    );
    const names = documentedSpellings.flatMap(
      (spelling) => spelling.match(/--?[A-Za-z][A-Za-z0-9-]*/g) ?? []
    );
    return {
      names,
      documentedSpellings,
      valueArity: "not-specified-by-doc-table",
      documentationUrl: "https://code.claude.com/docs/en/cli-reference#cli-flags",
      ...rowVersionBounds(record.description),
      ...versionEvidence(record.description),
      provenance: sourceExtension("cliDocs")
    };
  })
  .filter((record) => record.names.length);
const flagRecords = allFlagRecords.filter((record) => isActiveForVersion(record, version));

const keybindingTables = markdownTables(
  sources.keybindingsDocs.text,
  "## Available actions",
  "## Keystroke syntax"
).filter(
  ({ header }) => stripMarkdown(header[0]).toLowerCase() === "action"
);
const allKeybindingDefaults = keybindingTables.flatMap((table) =>
  recordsFromTable(table).map((record) => ({
    action: keyFromCell(record.action),
    section: table.heading,
    defaultDisplay: stripMarkdown(record.default),
    documentationUrl: "https://code.claude.com/docs/en/keybindings#available-actions",
    ...rowVersionBounds(record.description),
    ...versionEvidence(record.description),
    provenance: sourceExtension("keybindingsDocs")
  }))
).filter((record) => record.action);
const keybindingDefaults = allKeybindingDefaults.filter((record) =>
  isActiveForVersion(record, version)
);

const settingsSchema = clone(JSON.parse(sources.settingsSchemaStore.text));
settingsSchema["x-upstream-id"] = settingsSchema.$id;
settingsSchema.$id = `https://example.invalid/claude-code/${version}/settings.schema.json`;
settingsSchema["x-claude-code-version"] = version;
settingsSchema["x-artifact-kind"] = "settings-json-schema";
settingsSchema["x-provenance"] = sourceExtension(
  "settingsSchemaStore",
  "settingsDocs"
);

const unresolvedDottedSettings = [];
const addedUntypedSettings = [];
for (const record of settingsRecords) {
  if (record.key.includes(".")) {
    unresolvedDottedSettings.push(record.key);
    continue;
  }
  if (!settingsSchema.properties[record.key]) {
    settingsSchema.properties[record.key] = {
      "x-type-status": "unverified-docs-only",
      "x-docs-url": "https://code.claude.com/docs/en/settings#available-settings",
      "x-provenance": sourceExtension("settingsDocs"),
      ...(record.minVersion ? { "x-min-version": record.minVersion } : {}),
      ...(record.maxVersion ? { "x-max-version": record.maxVersion } : {})
    };
    addedUntypedSettings.push(record.key);
  }
}

const envSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: `https://example.invalid/claude-code/${version}/env.schema.json`,
  title: "Claude Code documented environment",
  description:
    "A JSON projection of environment variables. Environment values are strings; arbitrary non-Claude variables remain allowed.",
  type: "object",
  properties: Object.fromEntries(
    envRecords.map((record) => [
      record.name,
      {
        type: "string",
        "x-docs-url": "https://code.claude.com/docs/en/env-vars#variables",
        "x-provenance": sourceExtension("envDocs"),
        ...(record.minVersion ? { "x-min-version": record.minVersion } : {}),
        ...(record.maxVersion ? { "x-max-version": record.maxVersion } : {}),
        ...(record.versionMarkers.length
          ? { "x-version-markers": record.versionMarkers }
          : {})
      }
    ])
  ),
  additionalProperties: { type: "string" },
  "x-claude-code-version": version,
  "x-artifact-kind": "environment-object-json-schema",
  "x-representation": "JSON object projection of process environment",
  "x-provenance": sourceExtension("envDocs")
};

const keybindingsSchema = clone(JSON.parse(sources.keybindingsSchemaStore.text));
keybindingsSchema["x-upstream-id"] = keybindingsSchema.$id;
keybindingsSchema.$id = `https://example.invalid/claude-code/${version}/keybindings.schema.json`;
keybindingsSchema["x-claude-code-version"] = version;
keybindingsSchema["x-artifact-kind"] = "keybindings-json-schema";
keybindingsSchema["x-provenance"] = sourceExtension(
  "keybindingsSchemaStore",
  "keybindingsDocs"
);

const schemaStoreActions = new Set(
  keybindingsSchema.$defs?.builtinAction?.enum ?? []
);
const documentedActions = new Set(keybindingDefaults.map(({ action }) => action));
const documentedActionsMissingFromSchema = [...documentedActions].filter(
  (action) => !schemaStoreActions.has(action)
);
const schemaActionsMissingFromDocs = [...schemaStoreActions].filter(
  (action) => !documentedActions.has(action)
);

const flagsCatalog = {
  schemaVersion: 1,
  artifactKind: "cli-option-catalog",
  claudeCodeVersion: version,
  commandPath: ["claude"],
  scope: "documented top-level flags",
  options: flagRecords
};

const keybindingDefaultsCatalog = {
  schemaVersion: 1,
  artifactKind: "keybinding-defaults-catalog",
  claudeCodeVersion: version,
  actions: keybindingDefaults
};

const artifactPayloads = {
  "settings.schema.json": settingsSchema,
  "env.schema.json": envSchema,
  "keybindings.schema.json": keybindingsSchema,
  "flags.catalog.json": flagsCatalog,
  "keybinding-defaults.catalog.json": keybindingDefaultsCatalog
};

const manifest = {
  schemaVersion: 1,
  experimentVersion: 1,
  sourcePolicy: "official-docs-plus-schemastore",
  artifactKind: "claude-code-surface-manifest",
  claudeCodeVersion: version,
  release: {
    npmPackage: npmMetadata.name,
    npmIntegrity: npmMetadata.dist.integrity,
    npmTarball: npmMetadata.dist.tarball,
    platformPackages: npmMetadata.optionalDependencies,
    expectedGitTag: `v${version}`
  },
  sources: fetchedSources.map(({ text, ...metadata }) => metadata),
  artifacts: Object.fromEntries(
    Object.entries(artifactPayloads).map(([file, payload]) => [
      file,
      {
        artifactKind:
          payload["x-artifact-kind"] ?? payload.artifactKind,
        sha256: sha256(`${JSON.stringify(payload, null, 2)}\n`)
      }
    ])
  ),
  counts: {
    documentedSettingsRows: settingsRecords.length,
    settingsSchemaProperties: Object.keys(settingsSchema.properties ?? {}).length,
    documentedEnvironmentVariables: envRecords.length,
    documentedTopLevelFlags: flagRecords.length,
    documentedKeybindingActions: keybindingDefaults.length,
    keybindingSchemaActions: schemaStoreActions.size
  },
  drift: {
    docsOnlyUntypedTopLevelSettings: addedUntypedSettings,
    dottedSettingsRequiringStructuralResolution: unresolvedDottedSettings,
    documentedActionsMissingFromSchema: documentedActionsMissingFromSchema,
    schemaActionsMissingFromCurrentDocs: schemaActionsMissingFromDocs,
    rowsExcludedByVersion: {
      settings: allSettingsRecords.length - settingsRecords.length,
      environment: allEnvRecords.length - envRecords.length,
      flags: allFlagRecords.length - flagRecords.length,
      keybindingDefaults: allKeybindingDefaults.length - keybindingDefaults.length
    }
  }
};

await mkdir(outputDirectory, { recursive: true });
for (const [file, payload] of Object.entries({
  ...artifactPayloads,
  "manifest.json": manifest
})) {
  await writeFile(
    resolve(outputDirectory, file),
    `${JSON.stringify(payload, null, 2)}\n`
  );
}

console.log(
  JSON.stringify(
    {
      version,
      outputDirectory,
      counts: manifest.counts,
      drift: Object.fromEntries(
        Object.entries(manifest.drift).map(([key, values]) => [
          key,
          Array.isArray(values) ? values.length : values
        ])
      )
    },
    null,
    2
  )
);
