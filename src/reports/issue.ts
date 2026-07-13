import type {
  JsonObject,
  SurfaceManifest,
  ValidationReport,
} from "../domain/types.js";

function count(value: unknown): string {
  return typeof value === "number" ? String(value) : "unknown";
}

export function releaseIssueMarkdown(
  manifest: SurfaceManifest,
  validation: ValidationReport,
  semanticDiff?: JsonObject,
  workflowUrl?: string,
): string {
  const version = manifest.claudeCodeVersion;
  const sources = manifest.sources
    .map(
      (source) =>
        `| \`${source.id}\` | ${source.requestedUrl ? `[source](${source.requestedUrl})` : "n/a"} | \`${source.sha256 ?? "n/a"}\` |`,
    )
    .join("\n");
  return `<!-- claude-code-schema-release:${version} -->
# Claude Code ${version} schema review

## Status

- [x] Release detected
- [x] Candidate generated
- [x] Automated validation passed
- [ ] Source and semantic drift reviewed
- [ ] Candidate PR approved
- [ ] Published

${workflowUrl ? `Workflow: ${workflowUrl}\n` : ""}
## Summary

| Metric | Count |
| --- | ---: |
| Published artifacts | ${count(manifest.counts.publishedArtifacts)} |
| Typed settings | ${count(manifest.counts.typedSettingsProperties)} |
| Environment properties | ${count(manifest.counts.environmentSchemaProperties)} |
| Probed CLI commands | ${count(manifest.counts.probedCommands)} |
| Runtime settings diagnostics | ${count(manifest.counts.runtimeSettingsDiagnostics)} |
| Validation checks | ${count(validation.counts.checks)} |

## Sources

| Source | URL | SHA-256 |
| --- | --- | --- |
${sources}

## Semantic diff

\`\`\`json
${JSON.stringify(semanticDiff ?? { status: "first-published-version" }, null, 2)}
\`\`\`

## Local reproduction

\`\`\`bash
npm ci --ignore-scripts
npm run schema:generate -- --version ${version} --output generated/${version}
npm run schema:validate -- --directory generated/${version}
\`\`\`

## Review checklist

- [ ] Every new public setting has first-party evidence.
- [ ] Removed or relocated paths are explicitly accounted for.
- [ ] CLI and doctor probes stayed inside the bounded allowlist.
- [ ] No binary, raw string dump, credential, or unrestricted log is published.
- [ ] Combined envelope and each individual schema validate.
- [ ] Manifest digests match the reviewed files.
`;
}
