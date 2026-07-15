import type {
  JsonObject,
  SurfaceManifest,
  ValidationReport,
} from "../domain/types.js";

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function markdownList(values: string[]): string {
  return values.length > 0
    ? values.map((value) => `- \`${value}\``).join("\n")
    : "_None._";
}

function label(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

function tableText(value: unknown): string {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
}

function countChanges(semanticDiff: JsonObject): string {
  const counts = object(semanticDiff.counts);
  const from = object(counts.from);
  const to = object(counts.to);
  const rows = [...new Set([...Object.keys(from), ...Object.keys(to)])]
    .sort()
    .flatMap((name) => {
      const previous = from[name];
      const current = to[name];
      if (typeof previous !== "number" || typeof current !== "number")
        return [];
      if (previous === current) return [];
      const delta = current - previous;
      return [
        `| ${label(name)} | ${previous} | ${current} | ${delta >= 0 ? "+" : ""}${delta} |`,
      ];
    });
  return rows.length > 0
    ? [
        "| Metric | Previous | Current | Change |",
        "| --- | ---: | ---: | ---: |",
        ...rows,
      ].join("\n")
    : "No numeric manifest counts changed.";
}

function sourceLimitations(manifest: SurfaceManifest): string {
  const historical = object(
    object(manifest.drift).historicalDocumentationSnapshot,
  );
  if (typeof historical.limitation === "string") {
    return [
      `- **Historical documentation warning:** ${historical.limitation}`,
      `- Requested version: \`${historical.requestedVersion ?? manifest.claudeCodeVersion}\``,
      `- Documentation version context: \`${historical.documentationVersionContext ?? "unknown"}\``,
      `- Policy: \`${historical.policy ?? "unknown"}\``,
      "- Exact source URLs and digests are recorded in `manifest.json`.",
    ].join("\n");
  }
  return [
    "- Mutable documentation matched the requested npm `latest` version when the candidate was generated.",
    "- Exact source URLs, digests, validation limitations, and probe policy are recorded in `manifest.json`.",
  ].join("\n");
}

function artifactTable(catalog: JsonObject): string {
  const artifacts = Array.isArray(catalog.artifacts) ? catalog.artifacts : [];
  const rows = artifacts.flatMap((entry) => {
    const artifact = object(entry);
    if (typeof artifact.file !== "string") return [];
    return [
      `| \`${artifact.file}\` | ${tableText(artifact.validates ?? artifact.describes ?? artifact.role)} |`,
    ];
  });
  return [
    "| File | Contains |",
    "| --- | --- |",
    ...rows,
    "| `SHA256SUMS` | SHA-256 checksum for every JSON file |",
  ].join("\n");
}

export function releaseNotesMarkdown(
  manifest: SurfaceManifest,
  validation: ValidationReport,
  catalog: JsonObject,
  semanticDiff: JsonObject,
): string {
  const version = manifest.claudeCodeVersion;
  const settingsPaths = object(semanticDiff.settingsPaths);
  const artifacts = object(semanticDiff.artifacts);
  const changelog = manifest.sources.find(
    (source) => source.id === "matchingTagChangelog",
  )?.requestedUrl;
  const upstreamChangelog =
    changelog ??
    `https://github.com/anthropics/claude-code/blob/v${version}/CHANGELOG.md`;
  const validationCounts = object(validation.counts);
  const checks =
    typeof validationCounts.checks === "number"
      ? String(validationCounts.checks)
      : String(validation.checks.length);
  return `# Claude Code schema v${version}

Generated from first-party evidence and the integrity-verified Claude Code \`${version}\` release. All ${checks} automated validation checks passed.

- Upstream changelog: [Claude Code v${version} changelog](${upstreamChangelog})
- Source policy: ${manifest.sourcePolicy}

## Semantic changes from v${semanticDiff.fromVersion ?? "unknown"}

### Settings paths added

${markdownList(strings(settingsPaths.added))}

### Settings paths removed

${markdownList(strings(settingsPaths.removed))}

### Release assets added

${markdownList(strings(artifacts.added))}

### Release assets removed

${markdownList(strings(artifacts.removed))}

## Count changes

${countChanges(semanticDiff)}

## Source limitations

${sourceLimitations(manifest)}

## Files

${artifactTable(catalog)}
`;
}
