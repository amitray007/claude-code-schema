import { generatorVersion } from "../config.js";
import type { JsonObject, JsonValue } from "../domain/types.js";
import { cloneJson } from "../shared/json.js";

function object(
  artifacts: Record<string, JsonObject>,
  file: string,
): JsonObject {
  return artifacts[file] ?? {};
}

function value(
  payload: JsonObject,
  key: string,
  fallback: JsonValue,
): JsonValue {
  return cloneJson((payload[key] ?? fallback) as JsonValue);
}

function metadata(
  artifactKind: string,
  version: string,
  surface: JsonObject,
): JsonObject {
  return {
    schemaVersion: 1,
    artifactKind,
    claudeCodeVersion: version,
    surface,
    "x-generator-version": generatorVersion,
  };
}

function binaryEvidence(binary: JsonObject): JsonObject {
  return {
    platformPackage: binary.platformPackage,
    binarySha256: binary.binarySha256,
    policy: binary.policy,
  };
}

export function structureArtifacts(
  source: Record<string, JsonObject>,
  version: string,
  targetPrefix: string,
): Record<string, JsonObject> {
  const binary = object(source, "binary-candidates.catalog.json");
  const flags = object(source, "flags.catalog.json");
  const cli = object(source, "cli.catalog.json");
  const settingsFacts = object(source, "settings-facts.catalog.json");
  const environment = object(source, "environment-capabilities.catalog.json");
  const keybindingCapabilities = object(
    source,
    "keybinding-capabilities.catalog.json",
  );
  const keybindingDefaults = object(source, "keybinding-defaults.catalog.json");
  const changelog = object(source, "changelog-hints.catalog.json");
  const legacy = object(source, "legacy-candidates.catalog.json");

  const artifacts: Record<string, JsonObject> = {};
  const schemaRenames: Record<string, string> = {
    "settings.schema.json": "settings.schema.json",
    "global-config.schema.json": "global-config.schema.json",
    "desktop-managed-settings.schema.json":
      "desktop-managed-settings.schema.json",
    "env.schema.json": "environment.schema.json",
    "keybindings.schema.json": "keybindings.schema.json",
    "keybindings.runtime-compat.schema.json": "keybindings.compat.schema.json",
  };
  for (const [sourceFile, targetFile] of Object.entries(schemaRenames)) {
    const schema = source[sourceFile];
    if (!schema) continue;
    const renamed = cloneJson(schema);
    renamed.$id = `${targetPrefix}${targetFile}`;
    artifacts[targetFile] = renamed;
  }

  artifacts["settings.catalog.json"] = {
    ...metadata("settings-surface-catalog", version, {
      product: "Claude Code CLI",
      interface: "configuration",
      consumedBy: ["claude-code-cli"],
      locations: [
        { scope: "user", path: "~/.claude/settings.json" },
        { scope: "project", path: ".claude/settings.json" },
        { scope: "local", path: ".claude/settings.local.json" },
        { scope: "command-line", input: "--settings <file-or-json>" },
        { scope: "managed", input: "administrator-managed settings source" },
      ],
    }),
    facts: value(settingsFacts, "facts", []),
    scopes: value(settingsFacts, "surfaces", {}),
    runtimeValidation: value(settingsFacts, "runtimeValidation", []),
    binaryEvidence: binaryEvidence(binary),
    binaryCorroborated: value(binary, "corroboratedDocumentedSettings", []),
    legacyCandidates: value(legacy, "settings", []),
  };

  artifacts["environment.catalog.json"] = {
    ...metadata("environment-surface-catalog", version, {
      product: "Claude Code CLI",
      interface: "process-environment",
      consumedBy: ["claude-code-process"],
      usage:
        "Set string-valued variables in the environment that launches the claude process. This catalog is not a configuration file.",
    }),
    configurableVariables: value(environment, "configurableVariables", []),
    providedToHooks: value(environment, "providedToHooks", []),
    supplements: value(environment, "supplements", []),
    retired: value(environment, "retired", []),
    unverifiedLegacy: value(environment, "unverifiedLegacy", []),
    binaryEvidence: binaryEvidence(binary),
    staticBinaryCandidates: value(binary, "environmentVariables", []),
  };

  artifacts["cli.catalog.json"] = {
    ...cloneJson(cli),
    ...metadata("cli-surface-catalog", version, {
      product: "Claude Code CLI",
      interface: "command-line",
      consumedBy: ["claude-code-cli"],
      usage:
        "Pass command paths, arguments, and options as argv when invoking the claude executable.",
    }),
    documentedCommandPath: value(flags, "commandPath", []),
    documentedOptionScope: value(flags, "scope", ""),
    documentedOptions: value(flags, "options", []),
    staticCandidatePolicy: value(binary, "policy", ""),
    staticBinaryCandidates: value(binary, "cliOptions", []),
    unclassifiedStaticCandidateCount: value(
      binary,
      "unclassifiedCliOptionStringCandidateCount",
      0,
    ),
  };

  artifacts["keybindings.catalog.json"] = {
    ...metadata("keybindings-surface-catalog", version, {
      product: "Claude Code CLI terminal UI",
      interface: "keybindings",
      consumedBy: ["claude-code-terminal-ui"],
      locations: [{ scope: "user", path: "~/.claude/keybindings.json" }],
    }),
    actions: value(keybindingCapabilities, "actions", []),
    defaults: value(keybindingDefaults, "actions", []),
    commandBinding: value(keybindingCapabilities, "commandBinding", {}),
    binary: value(keybindingCapabilities, "binary", {}),
    policy: value(keybindingCapabilities, "policy", ""),
    binaryCorroborated: value(
      binary,
      "corroboratedDocumentedKeybindingActions",
      [],
    ),
    legacyCandidates: value(legacy, "keybindingActions", []),
  };

  artifacts["review.catalog.json"] = {
    ...metadata("release-review-catalog", version, {
      product: "Claude Code",
      interface: "release-review-evidence",
      consumedBy: ["schema-maintainers"],
      usage:
        "Review evidence only. These records are not accepted configuration keys and do not mutate schemas automatically.",
    }),
    releaseHints: value(changelog, "entries", []),
    releaseHintSource: value(changelog, "source", {}),
    releaseHintPolicy: value(changelog, "policy", ""),
    rawProseRedistributed: value(changelog, "rawProseRedistributed", false),
    legacyPaths: value(legacy, "paths", []),
    legacyCommandBinding: value(legacy, "commandBinding", {}),
    legacyPolicy: value(legacy, "policy", ""),
  };

  return artifacts;
}

export function releaseCatalog(
  version: string,
  targetPrefix: string,
): JsonObject {
  const releaseBaseUrl = targetPrefix.replace(/\/$/, "");
  const downloadUrl = (file: string): string => `${releaseBaseUrl}/${file}`;
  return {
    schemaVersion: 1,
    artifactKind: "claude-code-release-catalog",
    claudeCodeVersion: version,
    releaseBaseUrl,
    startHere: {
      settingsJson: {
        file: "settings.schema.json",
        downloadUrl: downloadUrl("settings.schema.json"),
        purpose:
          "Reference and validate keys that Claude Code accepts in settings.json.",
        usedAt: [
          "~/.claude/settings.json",
          ".claude/settings.json",
          ".claude/settings.local.json",
          "--settings <file-or-json>",
          "managed settings sources",
        ],
        example: {
          $schema: downloadUrl("settings.schema.json"),
          includeCoAuthoredBy: false,
          env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" },
        },
        supportingEvidence: "settings.catalog.json",
      },
      environmentVariables: {
        file: "environment.schema.json",
        downloadUrl: downloadUrl("environment.schema.json"),
        purpose:
          "Reference Claude Code environment-variable names and validate a JSON environment map.",
        actualUsage:
          "Set variables in the shell, process runner, container, or CI environment that launches claude.",
        jsonRepresentation:
          "A tooling-only object whose keys and values represent process environment strings; Claude Code does not read environment.schema.json or an environment JSON file.",
        example: {
          ANTHROPIC_BASE_URL: "https://api.example.test",
          CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
        },
        supportingEvidence: "environment.catalog.json",
      },
    },
    audiences: {
      configurationUsers: [
        "settings.schema.json",
        "environment.schema.json",
        "global-config.schema.json",
        "keybindings.schema.json",
      ],
      cliReferenceUsers: ["cli.catalog.json"],
      specializedTooling: [
        "desktop-managed-settings.schema.json",
        "keybindings.compat.schema.json",
        "claude-code.schema.json",
      ],
      maintainersAndAuditors: [
        "settings.catalog.json",
        "environment.catalog.json",
        "keybindings.catalog.json",
        "review.catalog.json",
        "manifest.json",
        "validation-report.json",
      ],
    },
    productScope: {
      primary: "Claude Code CLI",
      includes: [
        "Claude Code CLI configuration files",
        "Claude Code process environment variables",
        "claude executable commands and options",
        "Claude Code terminal UI keybindings",
        "Claude Desktop administrator-managed policy as an explicitly separate surface",
      ],
      excludes: [
        "Anthropic API request and response schemas",
        "Claude web application settings",
        "arbitrary Claude Desktop preferences",
      ],
    },
    groups: {
      configurationSchemas: [
        "settings.schema.json",
        "global-config.schema.json",
        "desktop-managed-settings.schema.json",
        "environment.schema.json",
        "keybindings.schema.json",
        "keybindings.compat.schema.json",
        "claude-code.schema.json",
      ],
      domainCatalogs: [
        "settings.catalog.json",
        "environment.catalog.json",
        "cli.catalog.json",
        "keybindings.catalog.json",
      ],
      auditAndReview: [
        "review.catalog.json",
        "manifest.json",
        "validation-report.json",
      ],
    },
    artifacts: [
      {
        file: "catalog.json",
        role: "release-entry-point",
        describes:
          "product scope, artifact groups, consumers, and usage locations",
      },
      {
        file: "settings.schema.json",
        role: "validator",
        validates: "Claude Code settings object",
        usedAt: [
          "~/.claude/settings.json",
          ".claude/settings.json",
          ".claude/settings.local.json",
          "--settings <file-or-json>",
          "managed settings sources",
        ],
      },
      {
        file: "global-config.schema.json",
        role: "validator",
        validates: "Claude Code global preferences",
        usedAt: ["~/.claude.json"],
      },
      {
        file: "desktop-managed-settings.schema.json",
        role: "validator",
        validates: "Claude Desktop administrator-managed policy",
        usedAt: ["enterprise-managed Claude Desktop policy source"],
      },
      {
        file: "environment.schema.json",
        role: "validator",
        validates: "JSON projection of a Claude Code process environment",
        usedAt: ["environment passed to the claude process"],
        note: "Claude Code does not read this JSON file; tooling uses it to validate an environment map.",
      },
      {
        file: "keybindings.schema.json",
        role: "validator",
        validates: "documented Claude Code terminal UI keybindings",
        usedAt: ["~/.claude/keybindings.json"],
      },
      {
        file: "keybindings.compat.schema.json",
        role: "compatibility-validator",
        validates:
          "parser-compatible keybindings including warning-only action strings",
        usedAt: ["~/.claude/keybindings.json"],
      },
      {
        file: "claude-code.schema.json",
        role: "tooling-envelope-validator",
        validates:
          "one synthetic object containing all five configuration surfaces",
        usedAt: ["schema tooling and integration tests only"],
        note: "Claude Code does not consume this aggregate object.",
      },
      {
        file: "settings.catalog.json",
        role: "domain-catalog",
        describes:
          "settings paths, scopes, evidence, and runtime corroboration",
      },
      {
        file: "environment.catalog.json",
        role: "domain-catalog",
        describes:
          "documented environment capabilities and separated binary candidates",
      },
      {
        file: "cli.catalog.json",
        role: "domain-catalog",
        describes:
          "documented flags, probed command tree, arguments, and separated binary candidates",
      },
      {
        file: "keybindings.catalog.json",
        role: "domain-catalog",
        describes: "actions, defaults, runtime capabilities, and evidence",
      },
      {
        file: "review.catalog.json",
        role: "maintainer-review",
        describes: "changelog hints and unresolved legacy candidates",
      },
      {
        file: "manifest.json",
        role: "release-index",
        describes:
          "source URLs, source digests, artifact digests, counts, drift, and safety policy",
      },
      {
        file: "validation-report.json",
        role: "validation-evidence",
        describes: "deterministic checks run against this artifact set",
      },
    ],
    "x-generator-version": generatorVersion,
  };
}
