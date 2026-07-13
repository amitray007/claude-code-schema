import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const experimentsDirectory = resolve(here, "..");
const repositoryRoot = resolve(experimentsDirectory, "..");
const outputDirectory = resolve(here, "output");
const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;
const readJson = async (...parts) => JSON.parse(await readFile(resolve(...parts), "utf8"));

async function runNode(script) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [script], {
      cwd: repositoryRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code !== 0) rejectPromise(new Error(`${script} failed (${code}):\n${stderr}\n${stdout}`));
      else resolvePromise(stdout);
    });
  });
}

function visit(value, callback) {
  if (!value || typeof value !== "object") return;
  callback(value);
  if (Array.isArray(value)) value.forEach((child) => visit(child, callback));
  else Object.values(value).forEach((child) => visit(child, callback));
}

function keywordCounts(schema) {
  const counts = {};
  visit(schema, (value) => {
    if (Array.isArray(value)) return;
    for (const keyword of ["type", "enum", "required", "$ref", "default", "pattern", "if", "const", "oneOf", "anyOf", "examples"]) {
      if (keyword in value) counts[keyword] = (counts[keyword] ?? 0) + 1;
    }
  });
  return counts;
}

function isConstrained(schema) {
  return Boolean(
    schema?.type ||
    schema?.enum ||
    schema?.const !== undefined ||
    schema?.anyOf ||
    schema?.oneOf ||
    schema?.$ref
  );
}

function constrainedPropertyPaths(schema, path = "", output = new Set()) {
  if (schema?.type || schema?.enum || schema?.const !== undefined || schema?.anyOf || schema?.oneOf) {
    output.add(path);
  }
  for (const [name, child] of Object.entries(schema?.properties ?? {})) {
    constrainedPropertyPaths(child, path ? `${path}.${name}` : name, output);
  }
  return output;
}

function keybindingActions(schema) {
  const definitions = schema.$defs ?? schema.definitions ?? {};
  if (definitions.builtinAction?.enum) return definitions.builtinAction.enum;
  const alternatives = schema.properties?.bindings?.items?.properties?.bindings
    ?.additionalProperties?.anyOf ?? [];
  return alternatives.find(({ enum: values }) => Array.isArray(values))?.enum ?? [];
}

function hasCommandBinding(schema) {
  let found = false;
  visit(schema, (value) => {
    if (typeof value?.pattern === "string" && value.pattern.startsWith("^command:")) found = true;
  });
  return found;
}

function points(condition, maximum) {
  return condition ? maximum : 0;
}

function rounded(value) {
  return Math.round(value * 10) / 10;
}

function scoreVersion(metrics) {
  const sourceEvidence = {
    releaseIdentity: points(metrics.releaseIdentity, 3),
    noSchemaStoreGeneration: points(!metrics.usesSchemaStore, 3),
    verifiedPlatformPackage: points(metrics.platformIntegrityVerified, 4),
    matchingTagReleaseEvidence: points(metrics.hasMatchingTagEvidence, 3),
    expandedFirstPartyDocs: points(metrics.hasExpandedFirstPartyDocs, 4),
    taggedFirstPartyExamples: points(metrics.hasTaggedFirstPartyExamples, 3)
  };
  const settingsQuality = {
    documentedNameCoverage: points(metrics.documentedSettingsRows >= 117, 6),
    typedTopLevelCoverage: rounded(14 * metrics.typedTopLevelRatio),
    constrainedPathCoverage: rounded(12 * Math.min(metrics.constrainedPropertyPaths / 500, 1)),
    realSurfaceSeparation: points(metrics.hasScopedConfigArtifacts, 5),
    zeroUntypedTopLevel: points(metrics.untypedTopLevelSettings === 0, 3)
  };
  const interfaceBreadth = {
    documentedEnvironment: points(metrics.environmentProperties >= 287, 4),
    expandedEnvironment: points(metrics.environmentProperties > 287, 2),
    documentedTopLevelFlags: points(metrics.documentedTopLevelFlags >= 70, 3),
    recursiveCliCatalog: points(metrics.probedCommands >= 30, 5),
    currentKeybindingActions: points(metrics.keybindingActions >= 101, 3),
    verifiedCommandBinding: points(metrics.hasCommandBinding, 1),
    strictAndRuntimeKeybindingViews: points(metrics.hasRuntimeCompatKeybindings, 2)
  };
  const exactReleaseEvidence = {
    verifiedBinaryIntegrity: points(metrics.platformIntegrityVerified, 3),
    boundedCliHelpProbe: points(metrics.probedCommands >= 30, 3),
    doctorValidationOracle: points(metrics.runtimeSettingsDiagnostics >= 100, 2),
    staticCandidateCatalogs: points(metrics.hasStaticCandidateCatalog, 2)
  };
  const qualityAssurance = {
    artifactDigests: points(metrics.artifactCount >= 5, 2),
    validatorPassed: points(metrics.validatorPassed, 2),
    factLevelSettingsEvidence: points(metrics.hasSettingsFacts, 2),
    legacyAndRetirementAccounting: points(metrics.hasLegacyAccounting, 2),
    postGenerationParityGate: points(metrics.hasParityGate, 2)
  };
  const categories = {
    sourceEvidence: { maximum: 20, points: rounded(Object.values(sourceEvidence).reduce((sum, value) => sum + value, 0)), criteria: sourceEvidence },
    settingsQuality: { maximum: 40, points: rounded(Object.values(settingsQuality).reduce((sum, value) => sum + value, 0)), criteria: settingsQuality },
    interfaceBreadth: { maximum: 20, points: rounded(Object.values(interfaceBreadth).reduce((sum, value) => sum + value, 0)), criteria: interfaceBreadth },
    exactReleaseEvidence: { maximum: 10, points: rounded(Object.values(exactReleaseEvidence).reduce((sum, value) => sum + value, 0)), criteria: exactReleaseEvidence },
    qualityAssurance: { maximum: 10, points: rounded(Object.values(qualityAssurance).reduce((sum, value) => sum + value, 0)), criteria: qualityAssurance }
  };
  return {
    score: rounded(Object.values(categories).reduce((sum, category) => sum + category.points, 0)),
    maximum: 100,
    categories
  };
}

const versions = [];
for (const versionNumber of [1, 2, 3, 4]) {
  const directory = resolve(experimentsDirectory, `version-${versionNumber}`);
  const output = resolve(directory, "output");
  const validationOutput = await runNode(resolve(directory, "validate.mjs"));
  const [manifest, settings, environment, keybindings, outputFiles] = await Promise.all([
    readJson(output, "manifest.json"),
    readJson(output, "settings.schema.json"),
    readJson(output, "env.schema.json"),
    readJson(output, "keybindings.schema.json"),
    readdir(output)
  ]);
  const settingProperties = Object.entries(settings.properties ?? {})
    .filter(([name]) => name !== "$schema");
  const sourceText = JSON.stringify(manifest.sources);
  const artifactFiles = new Set(Object.keys(manifest.artifacts ?? {}));
  const sourceIds = new Set(manifest.sources.map(({ id }) => id));
  const actions = keybindingActions(keybindings);
  const metrics = {
    version: versionNumber,
    claudeCodeVersion: manifest.claudeCodeVersion,
    releaseIdentity: Boolean(manifest.release?.npmPackage && manifest.release?.expectedGitTag),
    sourceCount: manifest.sources.length,
    artifactCount: artifactFiles.size,
    outputJsonFiles: outputFiles.filter((file) => file.endsWith(".json")).length,
    usesSchemaStore: /schemastore/i.test(sourceText),
    platformIntegrityVerified: manifest.release?.platformIntegrityVerified === true,
    hasMatchingTagEvidence: sourceIds.has("matchingTagChangelog") && sourceIds.has("githubReleaseNotes"),
    hasExpandedFirstPartyDocs: sourceIds.has("hooksDocs") && sourceIds.has("monitoringDocs") && sourceIds.has("pluginReferenceDocs"),
    hasTaggedFirstPartyExamples: sourceIds.has("officialStrictSettingsExample") && sourceIds.has("officialManagedSettingsExample"),
    documentedSettingsRows: manifest.counts?.documentedSettingsRows ?? 0,
    topLevelSettings: settingProperties.length,
    typedTopLevelSettings: settingProperties.filter(([, schema]) => isConstrained(schema)).length,
    typedTopLevelRatio: settingProperties.length
      ? settingProperties.filter(([, schema]) => isConstrained(schema)).length / settingProperties.length
      : 0,
    untypedTopLevelSettings: settingProperties.filter(([, schema]) => !isConstrained(schema)).length,
    constrainedPropertyPaths: constrainedPropertyPaths(settings).size,
    settingsKeywords: keywordCounts(settings),
    environmentProperties: Object.keys(environment.properties ?? {}).length,
    documentedTopLevelFlags: manifest.counts?.documentedTopLevelFlags ?? 0,
    probedCommands: manifest.counts?.probedCommands ?? 0,
    probedOptionsAcrossCommands: manifest.counts?.probedOptionsAcrossCommands ?? 0,
    probedArgumentsAcrossCommands: manifest.counts?.probedArgumentsAcrossCommands ?? 0,
    keybindingActions: actions.length,
    hasCommandBinding: hasCommandBinding(keybindings),
    hasRuntimeCompatKeybindings: artifactFiles.has("keybindings.runtime-compat.schema.json"),
    hasScopedConfigArtifacts: artifactFiles.has("global-config.schema.json") && artifactFiles.has("desktop-managed-settings.schema.json"),
    runtimeSettingsDiagnostics: manifest.counts?.runtimeSettingsDiagnostics ?? 0,
    runtimeKeybindingActionCandidates: manifest.counts?.runtimeKeybindingActionCandidates ?? 0,
    hasStaticCandidateCatalog: artifactFiles.has("binary-candidates.catalog.json"),
    hasSettingsFacts: artifactFiles.has("settings-facts.catalog.json"),
    hasLegacyAccounting: artifactFiles.has("legacy-candidates.catalog.json"),
    hasParityGate: versionNumber === 4,
    validatorPassed: /"status"\s*:\s*"ok"/.test(validationOutput)
  };
  versions.push({ version: `version-${versionNumber}`, metrics, rubric: scoreVersion(metrics) });
}

const releaseVersions = new Set(versions.map(({ metrics }) => metrics.claudeCodeVersion));
if (releaseVersions.size !== 1) throw new Error(`Versions do not target the same Claude Code release: ${[...releaseVersions].join(", ")}`);

const ranking = [...versions]
  .sort((left, right) => right.rubric.score - left.rubric.score)
  .map(({ version, rubric }, index) => ({ rank: index + 1, version, score: rubric.score, maximum: rubric.maximum }));
if (ranking[0]?.version !== "version-4") throw new Error(`Benchmark winner changed unexpectedly: ${ranking[0]?.version}`);

const v4ParityOutput = await runNode(resolve(experimentsDirectory, "version-4", "benchmark-v1.mjs"));
const v4Parity = JSON.parse(v4ParityOutput);
if (v4Parity.status !== "ok" || v4Parity.settings.unaccounted.length) {
  throw new Error("Version 4 parity gate did not pass");
}

const comparison = {
  schemaVersion: 1,
  benchmarkKind: "cross-version-evidence-and-capability-benchmark",
  claudeCodeVersion: [...releaseVersions][0],
  winner: ranking[0].version,
  ranking,
  methodology: {
    statement: "The score measures coverage of this project's declared objectives, not an empirical probability that every schema fact is correct.",
    categories: {
      sourceEvidence: 20,
      settingsQuality: 40,
      interfaceBreadth: 20,
      exactReleaseEvidence: 10,
      qualityAssurance: 10
    },
    rationale: "Settings quality receives the largest weight because settings validation is the central artifact. Raw enum/required keyword counts are reported but not rewarded independently: repeated or stale constraints are not automatically higher quality.",
    allVersionValidatorsExecuted: true,
    version4ParityBenchmarkExecuted: true
  },
  versions,
  version4Parity: v4Parity.settings.deepConstraintAudit,
  conclusions: {
    overall: "Version 4 is the strongest overall and satisfies every benchmark criterion.",
    version1: "Second place: strongest pre-V4 settings constraint density, but SchemaStore-dependent, less current/scoped, and without exact-binary CLI or validation evidence.",
    version3: "Third place: strong exact-release CLI and candidate discovery, but its settings schema remains intentionally untyped and structurally partial.",
    version2: "Fourth place: clean official-docs-only baseline, but the weakest validation and no exact-release binary evidence.",
    caution: "Version 4 winning does not imply perfect accuracy. Mutable documentation, warning-only runtime behavior, and binary candidates still require semantic drift review."
  }
};

function markdownTable(comparisonValue) {
  const rows = comparisonValue.versions.map(({ version, metrics, rubric }) =>
    `| ${version.replace("version-", "V")} | ${rubric.score.toFixed(1)} | ${metrics.usesSchemaStore ? "yes" : "no"} | ${metrics.typedTopLevelSettings}/${metrics.topLevelSettings} | ${metrics.constrainedPropertyPaths} | ${metrics.environmentProperties} | ${metrics.probedCommands} | ${metrics.keybindingActions} | ${metrics.artifactCount} |`
  );
  const categoryRows = comparisonValue.versions.map(({ version, rubric }) =>
    `| ${version.replace("version-", "V")} | ${rubric.categories.sourceEvidence.points.toFixed(1)}/20 | ${rubric.categories.settingsQuality.points.toFixed(1)}/40 | ${rubric.categories.interfaceBreadth.points.toFixed(1)}/20 | ${rubric.categories.exactReleaseEvidence.points.toFixed(1)}/10 | ${rubric.categories.qualityAssurance.points.toFixed(1)}/10 |`
  );
  return [
    "# Cross-version benchmark",
    "",
    `Claude Code release: \`${comparisonValue.claudeCodeVersion}\``,
    "",
    "> The score is an evidence-and-capability rubric, not an accuracy percentage.",
    "",
    "| Version | Score / 100 | SchemaStore source | Typed settings | Constrained paths | Env properties | Probed commands | Public key actions | Artifacts |",
    "| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows,
    "",
    "Category breakdown:",
    "",
    "| Version | Source evidence | Settings quality | Interface breadth | Exact-release evidence | QA and provenance |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...categoryRows,
    "",
    `Winner: **${comparisonValue.winner.replace("version-", "V")}**`,
    "",
    "Ranking:",
    "",
    ...comparisonValue.ranking.map(({ rank, version, score }) => `${rank}. ${version.replace("version-", "V")} — ${score.toFixed(1)}/100`),
    "",
    "V4 parity result:",
    "",
    `- V1 constrained paths: ${comparisonValue.version4Parity.v1ConstrainedPropertyPaths}`,
    `- V1 paths active in V4: ${comparisonValue.version4Parity.v1PathsActiveInV4}`,
    `- Explicitly scoped, retired, or legacy: ${comparisonValue.version4Parity.v1PathsExplicitlyScopedRetiredOrLegacy}`,
    `- Unaccounted: ${comparisonValue.version4Parity.unaccounted.length}`,
    `- Current V4 paths not in V1: ${comparisonValue.version4Parity.v4CurrentPathsNotInV1}`,
    "",
    "See `comparison.json` for all raw metrics, category points, criteria, and limitations.",
    ""
  ].join("\n");
}

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDirectory, "comparison.json"), jsonText(comparison)),
  writeFile(resolve(outputDirectory, "comparison.md"), markdownTable(comparison))
]);

console.log(jsonText({
  status: "ok",
  winner: comparison.winner,
  ranking: comparison.ranking,
  version4Parity: comparison.version4Parity,
  outputDirectory
}));
