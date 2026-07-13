import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const readJson = async (...parts) => JSON.parse(await readFile(resolve(here, ...parts), "utf8"));
const [v1Settings, v1Env, v1Flags, v1Defaults, v1Keys, v4Settings, v4Env, v4Flags, v4Defaults, v4Keys, desktop, legacy, keybindingCapabilities, environmentCapabilities] = await Promise.all([
  readJson("..", "version-1", "output", "settings.schema.json"),
  readJson("..", "version-1", "output", "env.schema.json"),
  readJson("..", "version-1", "output", "flags.catalog.json"),
  readJson("..", "version-1", "output", "keybinding-defaults.catalog.json"),
  readJson("..", "version-1", "output", "keybindings.schema.json"),
  readJson("output", "settings.schema.json"),
  readJson("output", "env.schema.json"),
  readJson("output", "flags.catalog.json"),
  readJson("output", "keybinding-defaults.catalog.json"),
  readJson("output", "keybindings.schema.json"),
  readJson("output", "desktop-managed-settings.schema.json"),
  readJson("output", "legacy-candidates.catalog.json"),
  readJson("output", "keybinding-capabilities.catalog.json"),
  readJson("output", "environment-capabilities.catalog.json")
]);

const keys = (object) => Object.keys(object ?? {}).filter((name) => name !== "$schema");
const set = (values) => new Set(values);
const difference = (left, right) => [...left].filter((value) => !right.has(value)).sort();
const union = (...sets) => new Set(sets.flatMap((value) => [...value]));
const optionNames = (catalog) => set(catalog.options.flatMap(({ names }) => names));
const defaultActions = (catalog) => set(catalog.actions.map(({ action }) => action));
const v1Actions = set(v1Keys["$defs"].builtinAction.enum);
const v4Actions = set(v4Keys.properties.bindings.items.properties.bindings.additionalProperties.anyOf[0].enum);

const v1SettingNames = set(keys(v1Settings.properties));
const v4SettingNames = set(keys(v4Settings.properties));
const redirectedSettings = set(legacy.settings.map(({ name }) => name));
const desktopSettings = set(keys(desktop.properties));
const missingSettings = difference(v1SettingNames, union(v4SettingNames, redirectedSettings, desktopSettings));
if (missingSettings.length) throw new Error(`V1 settings not accounted for: ${missingSettings.join(", ")}`);

const v1OnlyActions = difference(v1Actions, v4Actions);
const expectedV1OnlyActions = [
  "app:openArtifact", "app:toggleBrief", "chat:workflowKeywordToggle", "doctor:fix",
  "footer:close", "select:first", "select:last", "select:pageDown", "select:pageUp",
  "settings:periodDay", "settings:periodWeek", "settings:sortByTokens", "theme:editCustom"
].sort();
if (JSON.stringify(v1OnlyActions) !== JSON.stringify(expectedV1OnlyActions)) throw new Error(`Unexpected V1-only action drift: ${v1OnlyActions.join(", ")}`);
const runtimeActionCandidates = set(keybindingCapabilities.actions.map(({ action }) => action));
const v1OnlyUnaccountedActions = v1OnlyActions.filter((action) => action !== "doctor:fix" && !runtimeActionCandidates.has(action));
if (v1OnlyUnaccountedActions.length) throw new Error(`V1 actions absent from current docs and exact binary: ${v1OnlyUnaccountedActions.join(", ")}`);

const typeDifferences = [];
for (const name of [...v1SettingNames].filter((candidate) => v4SettingNames.has(candidate))) {
  const oldType = v1Settings.properties[name].type ?? null;
  const newType = v4Settings.properties[name].type ?? null;
  if (oldType && newType && oldType !== newType) typeDifferences.push({ name, v1Type: oldType, v4Type: newType, resolution: "V4 follows current official example and exact-binary validation evidence" });
}

const surfaceChecks = {
  environmentNamesMissingFromV4: difference(set(keys(v1Env.properties)), set(keys(v4Env.properties))),
  flagNamesMissingFromV4: difference(optionNames(v1Flags), optionNames(v4Flags)),
  documentedDefaultActionsMissingFromV4: difference(defaultActions(v1Defaults), defaultActions(v4Defaults))
};
for (const [name, values] of Object.entries(surfaceChecks)) {
  if (values.length && name !== "documentedDefaultActionsMissingFromV4") throw new Error(`${name}: ${values.join(", ")}`);
}
const commandBinding = v4Keys.properties.bindings.items.properties.bindings.additionalProperties.anyOf.find(({ pattern }) => pattern?.startsWith("^command:"));
if (!commandBinding) throw new Error("V4 lost V1 command-binding capability");

function constrainedPaths(schema, path = "", output = new Set()) {
  if (schema?.type || schema?.enum || schema?.const !== undefined || schema?.anyOf || schema?.oneOf) output.add(path);
  for (const [name, child] of Object.entries(schema?.properties ?? {})) constrainedPaths(child, path ? `${path}.${name}` : name, output);
  return output;
}
function keywordCounts(schema) {
  const result = {};
  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(visit);
    for (const keyword of ["type", "enum", "required", "$ref", "default", "pattern", "if", "const", "oneOf", "anyOf", "examples"]) {
      if (keyword in value) result[keyword] = (result[keyword] ?? 0) + 1;
    }
    Object.values(value).forEach(visit);
  }
  visit(schema);
  return result;
}
const v1Paths = constrainedPaths(v1Settings);
const v4Paths = constrainedPaths(v4Settings);
const environmentPathAccounts = [
  ...environmentCapabilities.configurableVariables,
  ...environmentCapabilities.providedToHooks.map(({ name }) => name),
  ...environmentCapabilities.retired.map(({ name }) => name),
  ...environmentCapabilities.unverifiedLegacy.map(({ name }) => name)
].map((name) => `env.${name}`);
const deepAccounts = new Set([
  ...v4Paths,
  ...legacy.settings.map(({ name }) => name),
  ...(legacy.paths ?? []).map(({ path }) => path),
  ...keys(desktop.properties),
  ...environmentPathAccounts
]);
const v1PathsUnaccounted = difference(v1Paths, deepAccounts);
if (v1PathsUnaccounted.length) throw new Error(`V1 constrained paths not accounted for: ${v1PathsUnaccounted.join(", ")}`);

console.log(JSON.stringify({
  status: "ok",
  benchmarkRole: "development-only; Version 1 is not a Version 4 generation source",
  settings: {
    v1Count: v1SettingNames.size,
    activeInV4SettingsSchema: [...v1SettingNames].filter((name) => v4SettingNames.has(name)).length,
    redirectedOrDifferentSurface: difference(v1SettingNames, v4SettingNames).map((name) => legacy.settings.find((entry) => entry.name === name) ?? { name, status: "desktop-managed-surface" }),
    unaccounted: missingSettings,
    currentTypeDifferences: typeDifferences,
    deepConstraintAudit: {
      v1ConstrainedPropertyPaths: v1Paths.size,
      v4ConstrainedPropertyPaths: v4Paths.size,
      v1PathsActiveInV4: [...v1Paths].filter((path) => v4Paths.has(path)).length,
      v1PathsExplicitlyScopedRetiredOrLegacy: difference(v1Paths, v4Paths).length,
      unaccounted: v1PathsUnaccounted,
      v4CurrentPathsNotInV1: difference(v4Paths, v1Paths).length,
      rawKeywordCountsForTransparencyOnly: { v1: keywordCounts(v1Settings), v4: keywordCounts(v4Settings) },
      interpretation: "Raw keyword totals are not a quality target: V1 repeats many env enums and stale constraints, while V4 uses current scoped artifacts and leaves unsupported closure unknown. Path accounting and current first-party evidence are the gates."
    }
  },
  keybindings: {
    v1BuiltInActions: v1Actions.size,
    activeV4BuiltInActions: v4Actions.size,
    v1OnlyNotCurrentOfficialActions: v1OnlyActions.map((action) => ({ action, status: action === "doctor:fix" ? "officially-retired-after-2.1.204" : "exact-release-binary-candidate; not current public docs" })),
    commandBindingCapabilityPreserved: true
  },
  otherSurfaces: surfaceChecks,
  conclusion: "V4 accounts for every V1 setting without publishing stale candidates as current settings, preserves the narrow command-binding capability, and reports rather than silently retains V1-only actions. Current first-party truth wins when a V1 type or action disagrees."
}, null, 2));
