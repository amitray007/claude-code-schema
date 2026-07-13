import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, "../..");
const version2Directory = resolve(here, "../version-2");
const outputDirectory = resolve(here, "output");
const argv = process.argv.slice(2);

function argumentValue(name) {
  const index = argv.indexOf(name);
  if (index === -1) return null;
  if (!argv[index + 1] || argv[index + 1].startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return argv[index + 1];
}

const requestedVersion = argumentValue("--version") ?? "latest";
const requestedPlatformPackage = argumentValue("--platform-package");
const knownArguments = new Set(["--version", "--platform-package"]);
for (let index = 0; index < argv.length; index += 1) {
  if (!knownArguments.has(argv[index])) {
    throw new Error(`Unknown argument: ${argv[index]}`);
  }
  index += 1;
}

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;
const readJson = async (...parts) =>
  JSON.parse(await readFile(resolve(...parts), "utf8"));

async function runProcess(command, args, options = {}) {
  const {
    cwd = repositoryRoot,
    env = process.env,
    timeoutMs = 30_000,
    maxOutputBytes = 4 * 1024 * 1024
  } = options;

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let timedOut = false;
    let outputExceeded = false;

    const append = (current, chunk) => {
      const next = Buffer.concat([current, chunk]);
      if (next.length > maxOutputBytes) {
        outputExceeded = true;
        child.kill("SIGKILL");
        return next.subarray(0, maxOutputBytes);
      }
      return next;
    };
    child.stdout.on("data", (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = append(stderr, chunk);
    });
    child.on("error", rejectPromise);

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolvePromise({
        code,
        signal,
        timedOut,
        outputExceeded,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8")
      });
    });
  });
}

async function fetchText(id, url, role, headers = {}) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "claude-schema-independent-probe-experiment/0.0.0",
      ...headers
    }
  });
  if (!response.ok) {
    throw new Error(`${id}: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  if (!text.trim()) throw new Error(`${id}: source was empty`);
  return {
    text,
    metadata: {
      id,
      requestedUrl: url,
      resolvedUrl: response.url,
      role,
      sha256: sha256(text),
      bytes: Buffer.byteLength(text)
    }
  };
}

function isolatedEnvironment(home) {
  return {
    HOME: home,
    CLAUDE_CONFIG_DIR: resolve(home, "claude-config"),
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

function sectionLines(text, heading) {
  const lines = text.replace(/\r/g, "").split("\n");
  const start = lines.findIndex((line) => line.trim() === `${heading}:`);
  if (start === -1) return [];
  const result = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^[A-Z][A-Za-z ]+:$/.test(lines[index].trim())) break;
    result.push(lines[index]);
  }
  return result;
}

function parseOptions(helpText) {
  const entries = [];
  let current = null;
  const flush = () => {
    if (!current) return;
    const names = [...current.spec.matchAll(/(?:^|[\s,|])(-{1,2}[A-Za-z][A-Za-z0-9-]*)/g)]
      .map((match) => match[1]);
    if (!names.length) {
      current = null;
      return;
    }
    const valueNotation = current.spec.match(/(<[^>]+>|\[[^\]]+\])/)?.[1] ?? null;
    const choicesText = current.description.match(/\(choices:\s*([^)]+)\)/)?.[1];
    const choices = choicesText
      ? [...choicesText.matchAll(/["']([^"']+)["']/g)].map((match) => match[1])
      : [];
    entries.push({
      names,
      valueNotation,
      valueArity: valueNotation?.startsWith("<")
        ? "required"
        : valueNotation?.startsWith("[")
          ? "optional"
          : "none",
      variadic: Boolean(valueNotation?.includes("...")),
      negated: names.some((name) => name.startsWith("--no-")),
      repeatable: /\brepeatable\b/i.test(current.description),
      ...(choices.length ? { choices } : {}),
      ...(current.description.match(/\(default:\s*([^)]+)\)/)?.[1]
        ? { defaultDisplay: current.description.match(/\(default:\s*([^)]+)\)/)[1] }
        : {})
    });
    current = null;
  };

  for (const line of sectionLines(helpText, "Options")) {
    if (/^  -/.test(line)) {
      flush();
      const parts = line.trim().split(/\s{2,}/, 2);
      current = { spec: parts[0], description: parts[1] ?? "" };
    } else if (current && line.trim()) {
      current.description += ` ${line.trim()}`;
    }
  }
  flush();
  return entries;
}

function parseCommands(helpText, parentPath) {
  const commands = [];
  for (const line of sectionLines(helpText, "Commands")) {
    if (!/^  \S/.test(line)) continue;
    const spec = line.trim().split(/\s{2,}/, 1)[0];
    const token = spec.split(/\s+/, 1)[0];
    const aliases = token.split("|").filter((name) => /^[a-z][a-z0-9-]*$/i.test(name));
    if (!aliases.length) continue;
    if (aliases[0] === "help") continue;
    commands.push({
      name: aliases[0],
      aliases: aliases.slice(1),
      commandPath: [...parentPath, aliases[0]],
      argumentNotation: spec.slice(token.length).trim() || null
    });
  }
  return commands;
}

function parseUsage(helpText) {
  return helpText.match(/^Usage:\s*(.+)$/m)?.[1]?.trim() ?? null;
}

function parseArguments(helpText, usage) {
  const argumentsList = [];
  const addArgument = (notation) => {
    const name = notation
      .replace(/^</, "")
      .replace(/^\[/, "")
      .replace(/>$/, "")
      .replace(/\]$/, "")
      .replace(/\.\.\.$/, "");
    if (["options", "command"].includes(name)) return;
    if (argumentsList.some((entry) => entry.name === name)) return;
    argumentsList.push({
      name,
      notation,
      valueArity: notation.startsWith("<") ? "required" : "optional",
      variadic: notation.includes("...")
    });
  };

  for (const line of sectionLines(helpText, "Arguments")) {
    if (!/^  \S/.test(line)) continue;
    const notation = line.trim().split(/\s{2,}/, 1)[0];
    const name = notation
      .replace(/^</, "")
      .replace(/^\[/, "")
      .replace(/>$/, "")
      .replace(/\]$/, "")
      .replace(/\.\.\.$/, "");
    const usageNotation = [
      `<${name}>`,
      `<${name}...>`,
      `[${name}]`,
      `[${name}...]`
    ].find((candidate) => usage?.includes(candidate));
    addArgument(usageNotation ?? `[${name}]`);
  }
  for (const match of usage?.matchAll(/(<[^>]+>|\[[^\]]+\])/g) ?? []) {
    addArgument(match[1]);
  }
  return argumentsList;
}

async function probeCli(binaryPath, home) {
  const probeEnv = isolatedEnvironment(home);
  await mkdir(probeEnv.TMPDIR, { recursive: true });
  const versionProbe = await runProcess(binaryPath, ["--version"], {
    cwd: home,
    env: probeEnv,
    timeoutMs: 10_000
  });
  if (versionProbe.code !== 0 || versionProbe.timedOut || versionProbe.outputExceeded) {
    throw new Error(`Safe --version probe failed: ${versionProbe.stderr}`);
  }

  const queue = [[]];
  const seen = new Set();
  const commands = [];
  const maxCommandDepth = 3;
  const maxCommands = 80;

  while (queue.length) {
    const commandPath = queue.shift();
    const identity = commandPath.join("\u0000");
    if (seen.has(identity)) continue;
    seen.add(identity);
    if (seen.size > maxCommands) {
      throw new Error(`CLI probe exceeded the ${maxCommands}-command safety limit`);
    }

    const probeArgs = [...commandPath, "--help"];
    const result = await runProcess(binaryPath, probeArgs, {
      cwd: home,
      env: probeEnv,
      timeoutMs: 10_000
    });
    const combined = `${result.stdout}\n${result.stderr}`.trim();
    const parsedChildren = result.code === 0 && !result.timedOut
      ? parseCommands(combined, commandPath)
      : [];
    const usage = parseUsage(combined);
    const record = {
      commandPath: ["claude", ...commandPath],
      invocation: ["claude", ...probeArgs],
      exitCode: result.code,
      signal: result.signal,
      timedOut: result.timedOut,
      outputExceeded: result.outputExceeded,
      helpSha256: sha256(combined),
      helpBytes: Buffer.byteLength(combined),
      usage,
      arguments: parseArguments(combined, usage),
      options: parseOptions(combined),
      childCommands: parsedChildren
    };
    commands.push(record);

    if (
      result.code === 0 &&
      !result.timedOut &&
      !result.outputExceeded &&
      commandPath.length < maxCommandDepth
    ) {
      for (const child of parsedChildren) queue.push(child.commandPath);
    }
  }

  return {
    versionOutput: versionProbe.stdout.trim() || versionProbe.stderr.trim(),
    versionProbeSha256: sha256(`${versionProbe.stdout}\n${versionProbe.stderr}`),
    commands
  };
}

async function findLargestBinary(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push({ path, size: (await stat(path)).size });
    }
  }
  await visit(root);
  const named = files.filter(({ path }) => /^(claude|claude\.exe)$/i.test(basename(path)));
  const candidates = named.length ? named : files.filter(({ size }) => size > 10_000_000);
  candidates.sort((left, right) => right.size - left.size);
  if (!candidates[0]) throw new Error("No Claude binary found in the platform package");
  return candidates[0];
}

function tokenRegex(tokens) {
  const escaped = [...tokens]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!escaped.length) return null;
  return new RegExp(
    `(?:^|[^A-Za-z0-9_])(${escaped.join("|")})(?=$|[^A-Za-z0-9_])`,
    "g"
  );
}

async function inspectStaticStrings(binaryPath, known) {
  const environmentCandidates = new Set();
  const flagCandidates = new Set();
  const corroboratedSettings = new Set();
  const corroboratedActions = new Set();
  const settingPattern = tokenRegex(known.settings);
  const actionPattern = tokenRegex(known.actions);
  const child = spawn("strings", ["-a", binaryPath], {
    stdio: ["ignore", "pipe", "pipe"]
  });
  let buffer = "";
  let stderr = "";

  const inspectLine = (line) => {
    for (const match of line.matchAll(/\b(?:CLAUDE_CODE|ANTHROPIC)_[A-Z][A-Z0-9_]{2,}\b/g)) {
      environmentCandidates.add(match[0]);
    }
    for (const match of line.matchAll(/(?<![A-Za-z0-9])-{1,2}[a-z][a-z0-9-]{0,63}\b/g)) {
      flagCandidates.add(match[0]);
    }
    if (settingPattern) {
      for (const match of line.matchAll(settingPattern)) corroboratedSettings.add(match[1]);
    }
    if (actionPattern) {
      for (const match of line.matchAll(actionPattern)) corroboratedActions.add(match[1]);
    }
    if (environmentCandidates.size > 5_000 || flagCandidates.size > 5_000) {
      child.kill("SIGKILL");
    }
  };

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) inspectLine(line);
    if (buffer.length > 1024 * 1024) buffer = buffer.slice(-1024 * 1024);
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  const exitCode = await new Promise((resolvePromise, rejectPromise) => {
    child.on("error", rejectPromise);
    child.on("close", resolvePromise);
  });
  if (buffer) inspectLine(buffer);
  if (exitCode !== 0) throw new Error(`strings exited ${exitCode}: ${stderr}`);
  if (environmentCandidates.size > 5_000 || flagCandidates.size > 5_000) {
    throw new Error("Static candidate extraction exceeded its safety limit");
  }

  return {
    environmentCandidates: [...environmentCandidates].sort(),
    flagCandidates: [...flagCandidates].sort(),
    corroboratedSettings: [...corroboratedSettings].sort(),
    corroboratedActions: [...corroboratedActions].sort()
  };
}

function extractReleaseSection(changelog, version) {
  const heading = `## ${version}`;
  const start = changelog.indexOf(heading);
  if (start === -1) throw new Error(`Changelog has no ${heading} section`);
  const end = changelog.indexOf("\n## ", start + heading.length);
  const section = changelog.slice(start, end === -1 ? undefined : end);
  const sectionStartLine = changelog.slice(0, start).split("\n").length;
  return { section, sectionStartLine };
}

function releaseBullets(section, sectionStartLine) {
  const bullets = [];
  for (const [offset, line] of section.split("\n").entries()) {
    if (/^- /.test(line)) {
      bullets.push({ text: line.slice(2), line: sectionStartLine + offset });
    } else if (bullets.length && /^\s{2,}\S/.test(line)) {
      bullets.at(-1).text += ` ${line.trim()}`;
    }
  }
  return bullets;
}

function classifyChangelog(changelog, version, known) {
  const { section, sectionStartLine } = extractReleaseSection(changelog, version);
  return releaseBullets(section, sectionStartLine).map(({ text, line }) => {
    const codeTokens = [...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]);
    const facts = [];
    const ambiguousTokens = [];
    const addFact = (kind, identifier, confidence) => {
      if (!facts.some((fact) => fact.kind === kind && fact.identifier === identifier)) {
        facts.push({ kind, identifier, confidence });
      }
    };

    for (const token of codeTokens) {
      const envNames = token.match(/\b(?:CLAUDE_CODE|ANTHROPIC)_[A-Z][A-Z0-9_]{2,}\b/g) ?? [];
      const optionNames = token.match(/(?<![A-Za-z0-9])-{1,2}[a-z][a-z0-9-]*\b/g) ?? [];
      for (const name of envNames) addFact("environment-variable", name, "high");
      for (const name of optionNames) {
        addFact("cli-option", name, known.probedOptions.has(name) ? "high" : "medium");
      }
      if (known.settings.has(token)) addFact("setting", token, "high");
      else if (known.actions.has(token)) addFact("keybinding-action", token, "high");
      else if (/^\/[a-z][a-z0-9-]*$/i.test(token)) addFact("slash-command", token, "medium");
      else if (/^(?:~\/|\.\/|\/|\.)/.test(token)) addFact("path-or-config-key", token, "medium");
      else if (!envNames.length && !optionNames.length) ambiguousTokens.push(token);
    }

    const start = text.trimStart();
    const changeKind = /^Fixed\b/i.test(start)
      ? "fixed"
      : /^Added\b|^Introduced\b|^New\b/i.test(start)
        ? "added"
        : /^Removed\b/i.test(start)
          ? "removed"
          : /^Deprecated\b/i.test(start)
            ? "deprecated"
            : "changed";
    const reviewReasons = [];
    if (facts.some(({ kind }) => [
      "setting",
      "environment-variable",
      "cli-option",
      "keybinding-action"
    ].includes(kind))) {
      reviewReasons.push("possible-schema-or-catalog-impact");
    }
    if (ambiguousTokens.length) reviewReasons.push("ambiguous-code-token");
    if (!facts.length) reviewReasons.push("no-typed-identifier-extracted");
    return {
      sourceLine: line,
      bulletSha256: sha256(text),
      changeKind,
      facts,
      ambiguousCodeTokens: [...new Set(ambiguousTokens)],
      needsReview: true,
      reviewReasons
    };
  });
}

function changelogReviewSchema(version) {
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: `https://example.invalid/claude-code/${version}/changelog-review.schema.json`,
    title: "Claude Code changelog AI or human review",
    type: "object",
    required: ["claudeCodeVersion", "reviews"],
    properties: {
      claudeCodeVersion: { const: version },
      reviewer: { type: "string" },
      reviews: {
        type: "array",
        items: {
          type: "object",
          required: ["bulletSha256", "classification", "confidence"],
          properties: {
            bulletSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
            classification: {
              enum: [
                "schema-change",
                "catalog-change",
                "behavior-change",
                "bug-fix-only",
                "documentation-only",
                "irrelevant",
                "uncertain"
              ]
            },
            confidence: { enum: ["low", "medium", "high"] },
            identifiers: {
              type: "array",
              items: {
                type: "object",
                required: ["kind", "identifier"],
                properties: {
                  kind: {
                    enum: [
                      "setting",
                      "environment-variable",
                      "cli-option",
                      "keybinding-action",
                      "slash-command",
                      "path-or-config-key",
                      "other"
                    ]
                  },
                  identifier: { type: "string" }
                },
                additionalProperties: false
              }
            },
            rationale: { type: "string", maxLength: 500 }
          },
          additionalProperties: false
        }
      }
    },
    additionalProperties: false,
    "x-review-policy": "AI output is advisory and must never mutate published artifacts without deterministic source evidence and validation gates."
  };
}

const version2Result = await runProcess(
  process.execPath,
  [resolve(version2Directory, "generate.mjs"), ...(requestedVersion === "latest" ? [] : ["--version", requestedVersion])],
  { timeoutMs: 120_000, maxOutputBytes: 16 * 1024 * 1024 }
);
if (version2Result.code !== 0 || version2Result.timedOut) {
  throw new Error(`Version 2 base generation failed:\n${version2Result.stderr}`);
}

const baseFiles = [
  "settings.schema.json",
  "env.schema.json",
  "keybindings.schema.json",
  "flags.catalog.json",
  "keybinding-defaults.catalog.json"
];
const basePayloads = Object.fromEntries(
  await Promise.all(
    baseFiles.map(async (file) => [file, await readJson(version2Directory, "output", file)])
  )
);
const baseManifest = await readJson(version2Directory, "output", "manifest.json");
const version = baseManifest.claudeCodeVersion;

const hostSuffix = `${process.platform}-${process.arch}`;
const platformPackages = baseManifest.release.platformPackages;
const derivedPlatformPackage = Object.keys(platformPackages).find((name) =>
  name.endsWith(hostSuffix)
);
const platformPackage = requestedPlatformPackage ?? derivedPlatformPackage;
if (!platformPackage || platformPackages[platformPackage] !== version) {
  throw new Error(
    `No exact ${version} platform package selected for ${hostSuffix}: ${platformPackage ?? "none"}`
  );
}

const platformMetadataUrl =
  `https://registry.npmjs.org/${encodeURIComponent(platformPackage)}/${version}`;
const changelogUrl =
  `https://raw.githubusercontent.com/anthropics/claude-code/v${version}/CHANGELOG.md`;
const releaseNotesUrl =
  `https://api.github.com/repos/anthropics/claude-code/releases/tags/v${version}`;
const [platformMetadataSource, changelogSource, releaseNotesSource] = await Promise.all([
  fetchText("platformPackageMetadata", platformMetadataUrl, "exact platform tarball identity and integrity"),
  fetchText("matchingTagChangelog", changelogUrl, "release-scoped change hints"),
  fetchText("githubReleaseNotes", releaseNotesUrl, "matching GitHub release metadata and notes", {
    accept: "application/vnd.github+json"
  })
]);
const platformMetadata = JSON.parse(platformMetadataSource.text);
const releaseNotes = JSON.parse(releaseNotesSource.text);
if (platformMetadata.version !== version || platformMetadata.name !== platformPackage) {
  throw new Error("Platform package metadata does not match the selected release");
}
if (!platformMetadata.dist?.tarball || !platformMetadata.dist?.integrity) {
  throw new Error("Platform package metadata lacks tarball integrity");
}

const workspace = await mkdtemp(resolve(tmpdir(), "claude-schema-v3-"));
try {
  const archiveResponse = await fetch(platformMetadata.dist.tarball, {
    redirect: "follow",
    headers: { "user-agent": "claude-schema-independent-probe-experiment/0.0.0" }
  });
  if (!archiveResponse.ok) {
    throw new Error(`Platform tarball: ${archiveResponse.status} ${archiveResponse.statusText}`);
  }
  const archive = Buffer.from(await archiveResponse.arrayBuffer());
  const [integrityAlgorithm, expectedIntegrity] = platformMetadata.dist.integrity.split("-", 2);
  const actualIntegrity = createHash(integrityAlgorithm).update(archive).digest("base64");
  if (actualIntegrity !== expectedIntegrity) {
    throw new Error("Platform tarball failed npm integrity verification");
  }

  const archivePath = resolve(workspace, "platform.tgz");
  const extractDirectory = resolve(workspace, "extracted");
  const probeHome = resolve(workspace, "probe-home");
  await Promise.all([
    writeFile(archivePath, archive),
    mkdir(extractDirectory, { recursive: true }),
    mkdir(probeHome, { recursive: true })
  ]);
  const tarResult = await runProcess("tar", ["-xzf", archivePath, "-C", extractDirectory], {
    cwd: workspace,
    timeoutMs: 120_000
  });
  if (tarResult.code !== 0) throw new Error(`tar extraction failed: ${tarResult.stderr}`);

  const binary = await findLargestBinary(extractDirectory);
  await chmod(binary.path, 0o755);
  const binaryBytes = await readFile(binary.path);
  const binarySha256 = sha256(binaryBytes);
  const [cliProbe, staticInspection] = await Promise.all([
    probeCli(binary.path, probeHome),
    inspectStaticStrings(binary.path, {
      settings: new Set(Object.keys(basePayloads["settings.schema.json"].properties).filter((name) => name !== "$schema")),
      actions: new Set(basePayloads["keybinding-defaults.catalog.json"].actions.map(({ action }) => action))
    })
  ]);
  if (!cliProbe.versionOutput.includes(version)) {
    throw new Error(`Binary reported ${cliProbe.versionOutput}, expected ${version}`);
  }

  const probedOptions = new Set(
    cliProbe.commands.flatMap(({ options }) => options.flatMap(({ names }) => names))
  );
  const documentedSettings = new Set(
    Object.keys(basePayloads["settings.schema.json"].properties).filter((name) => name !== "$schema")
  );
  const documentedEnvironment = new Set(
    Object.keys(basePayloads["env.schema.json"].properties)
  );
  const documentedActions = new Set(
    basePayloads["keybinding-defaults.catalog.json"].actions.map(({ action }) => action)
  );
  const documentedFlags = new Set(
    basePayloads["flags.catalog.json"].options.flatMap(({ names }) => names)
  );

  const changelogEntries = classifyChangelog(
    changelogSource.text,
    version,
    { settings: documentedSettings, actions: documentedActions, probedOptions }
  );
  const rootProbe = cliProbe.commands.find(({ commandPath }) => commandPath.length === 1);
  const rootProbedFlags = new Set(
    rootProbe?.options.flatMap(({ names }) => names) ?? []
  );

  const settingsSchema = structuredClone(basePayloads["settings.schema.json"]);
  settingsSchema.title = "Claude Code documented settings — independent-source experiment";
  settingsSchema["x-experiment"] = "official-docs-plus-verified-binary-probe";
  for (const name of staticInspection.corroboratedSettings) {
    if (settingsSchema.properties[name]) {
      settingsSchema.properties[name]["x-binary-corroboration"] = {
        source: "platformBinary",
        binarySha256,
        meaning: "identifier appears in static strings; type and public status are not inferred"
      };
    }
  }

  const envSchema = structuredClone(basePayloads["env.schema.json"]);
  for (const name of staticInspection.environmentCandidates) {
    if (envSchema.properties[name]) {
      envSchema.properties[name]["x-binary-corroboration"] = {
        source: "platformBinary",
        binarySha256
      };
    }
  }

  const keybindingsSchema = structuredClone(basePayloads["keybindings.schema.json"]);
  keybindingsSchema.title = "Claude Code keybindings — independent-source experiment";
  keybindingsSchema["x-experiment"] = "official-docs-plus-verified-binary-probe";
  keybindingsSchema["x-binary-corroborated-actions"] = staticInspection.corroboratedActions;

  const flagsCatalog = structuredClone(basePayloads["flags.catalog.json"]);
  flagsCatalog.options = flagsCatalog.options.map((option) => ({
    ...option,
    probeMatches: cliProbe.commands.flatMap((command) => {
      const names = command.options
        .flatMap((entry) => entry.names)
        .filter((name) => option.names.includes(name));
      return names.length ? [{ commandPath: command.commandPath, names }] : [];
    })
  }));

  const cliCatalog = {
    schemaVersion: 1,
    artifactKind: "cli-command-option-catalog",
    claudeCodeVersion: version,
    platformPackage,
    binarySha256,
    probePolicy: {
      allowedOperations: ["--version", "--help", "<parsed-command-path> --help"],
      commandPathsMustComeFromPriorHelpOutput: true,
      stdin: "closed",
      isolatedHome: true,
      inheritedCredentialEnvironment: false,
      timeoutMsPerInvocation: 10_000,
      maximumCommandDepth: 3,
      maximumCommands: 80,
      rawHelpRedistributed: false
    },
    versionOutput: cliProbe.versionOutput,
    commands: cliProbe.commands
  };

  const binaryCandidatesCatalog = {
    schemaVersion: 1,
    artifactKind: "static-binary-candidate-catalog",
    claudeCodeVersion: version,
    platformPackage,
    binarySha256,
    policy: "Static strings prove token presence only. Binary-only values are candidates, not public API.",
    environmentVariables: staticInspection.environmentCandidates.map((name) => ({
      name,
      documented: documentedEnvironment.has(name)
    })),
    cliOptions: staticInspection.flagCandidates
      .filter((name) => documentedFlags.has(name) || probedOptions.has(name))
      .map((name) => ({
        name,
        documentedTopLevel: documentedFlags.has(name),
        exposedByHelpProbe: probedOptions.has(name)
      })),
    unclassifiedCliOptionStringCandidateCount:
      staticInspection.flagCandidates.filter(
        (name) => !documentedFlags.has(name) && !probedOptions.has(name)
      ).length,
    corroboratedDocumentedSettings: staticInspection.corroboratedSettings,
    corroboratedDocumentedKeybindingActions: staticInspection.corroboratedActions
  };

  const changelogHintsCatalog = {
    schemaVersion: 1,
    artifactKind: "release-change-hint-catalog",
    claudeCodeVersion: version,
    source: {
      changelog: "matchingTagChangelog",
      githubReleaseNotes: "githubReleaseNotes",
      publishedAt: releaseNotes.published_at ?? null
    },
    policy: "Hints never mutate schemas or catalogs automatically. Deterministic evidence and validation are required; ambiguous entries enter AI or human review.",
    rawProseRedistributed: false,
    entries: changelogEntries
  };
  const reviewSchema = changelogReviewSchema(version);

  const artifactPayloads = {
    "settings.schema.json": settingsSchema,
    "env.schema.json": envSchema,
    "keybindings.schema.json": keybindingsSchema,
    "flags.catalog.json": flagsCatalog,
    "keybinding-defaults.catalog.json": basePayloads["keybinding-defaults.catalog.json"],
    "cli.catalog.json": cliCatalog,
    "binary-candidates.catalog.json": binaryCandidatesCatalog,
    "changelog-hints.catalog.json": changelogHintsCatalog,
    "changelog-review.schema.json": reviewSchema
  };

  const addedSources = [
    platformMetadataSource.metadata,
    {
      id: "platformTarball",
      requestedUrl: platformMetadata.dist.tarball,
      resolvedUrl: archiveResponse.url,
      role: "integrity-verified package used for static inspection and safe probing",
      sha256: sha256(archive),
      bytes: archive.length,
      npmIntegrity: platformMetadata.dist.integrity,
      integrityVerified: true
    },
    {
      id: "platformBinary",
      role: "extracted executable used only for static strings and bounded help/version probes",
      extractedFrom: "platformTarball",
      pathInPackage: relative(extractDirectory, binary.path),
      sha256: binarySha256,
      bytes: binary.size,
      executedOperations: ["--version", "--help", "parsed command paths with --help"]
    },
    changelogSource.metadata,
    releaseNotesSource.metadata
  ];

  const manifest = {
    schemaVersion: 1,
    experimentVersion: 3,
    sourcePolicy: "official-docs-plus-verified-package-static-analysis-safe-cli-probing-and-matching-release-notes-no-schemastore",
    artifactKind: "claude-code-surface-manifest",
    claudeCodeVersion: version,
    release: {
      ...baseManifest.release,
      selectedPlatformPackage: platformPackage,
      platformNpmIntegrity: platformMetadata.dist.integrity,
      platformIntegrityVerified: true,
      binarySha256
    },
    sources: [...baseManifest.sources, ...addedSources],
    artifacts: Object.fromEntries(
      Object.entries(artifactPayloads).map(([file, payload]) => [
        file,
        {
          artifactKind: payload["x-artifact-kind"] ?? payload.artifactKind ?? "json-schema",
          sha256: sha256(jsonText(payload))
        }
      ])
    ),
    counts: {
      ...baseManifest.counts,
      probedCommands: cliProbe.commands.length,
      probedOptionsAcrossCommands: cliProbe.commands.reduce(
        (total, command) => total + command.options.length,
        0
      ),
      probedArgumentsAcrossCommands: cliProbe.commands.reduce(
        (total, command) => total + command.arguments.length,
        0
      ),
      uniqueProbedOptionNames: probedOptions.size,
      staticEnvironmentCandidates: staticInspection.environmentCandidates.length,
      staticCliOptionStringCandidates: staticInspection.flagCandidates.length,
      retainedStaticCliOptionCandidates: binaryCandidatesCatalog.cliOptions.length,
      binaryCorroboratedDocumentedSettings: staticInspection.corroboratedSettings.length,
      binaryCorroboratedDocumentedKeybindingActions: staticInspection.corroboratedActions.length,
      changelogBullets: changelogEntries.length,
      changelogEntriesNeedingReview: changelogEntries.filter(({ needsReview }) => needsReview).length
    },
    drift: {
      ...baseManifest.drift,
      documentedTopLevelFlagsMissingFromRootHelp: [...documentedFlags]
        .filter((name) => !rootProbedFlags.has(name))
        .sort(),
      rootHelpOptionsMissingFromDocumentedTopLevelTable: (rootProbe?.options ?? [])
        .filter(({ names }) => !names.some((name) => documentedFlags.has(name)))
        .flatMap(({ names }) => names)
        .sort(),
      binaryOnlyEnvironmentCandidates: staticInspection.environmentCandidates
        .filter((name) => !documentedEnvironment.has(name)),
      changelogReviewQueue: changelogEntries
        .filter(({ needsReview }) => needsReview)
        .map(({ bulletSha256, sourceLine }) => ({ bulletSha256, sourceLine }))
    },
    safety: {
      binaryExecuted: true,
      binaryRedistributed: false,
      rawStringsRedistributed: false,
      rawHelpRedistributed: false,
      rawChangelogProseRedistributed: false,
      probePolicy: cliCatalog.probePolicy
    }
  };

  await mkdir(outputDirectory, { recursive: true });
  for (const [file, payload] of Object.entries({
    ...artifactPayloads,
    "manifest.json": manifest
  })) {
    await writeFile(resolve(outputDirectory, file), jsonText(payload));
  }

  console.log(
    jsonText({
      version,
      platformPackage,
      outputDirectory,
      counts: manifest.counts,
      drift: {
        documentedTopLevelFlagsMissingFromRootHelp:
          manifest.drift.documentedTopLevelFlagsMissingFromRootHelp.length,
        rootHelpOptionsMissingFromDocumentedTopLevelTable:
          manifest.drift.rootHelpOptionsMissingFromDocumentedTopLevelTable.length,
        binaryOnlyEnvironmentCandidates:
          manifest.drift.binaryOnlyEnvironmentCandidates.length,
        changelogReviewQueue: manifest.drift.changelogReviewQueue.length
      }
    })
  );
} finally {
  await rm(workspace, { recursive: true, force: true });
}
