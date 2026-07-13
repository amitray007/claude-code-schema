# Version 4 first-party parity audit — 2026-07-13

> **Release:** Claude Code 2.1.207 (`darwin-arm64` exact platform package)
> **Question:** Can Version 4 preserve or improve every useful Version 1 capability
> without using SchemaStore as a generation source?

## Verdict

Yes, at the capability and constrained-property-path level. Version 4 accounts for
every Version 1 setting and constrained path, retains all official environment,
flag, and default-shortcut identities, independently verifies the command-binding
grammar, and separates current public actions from runtime-only candidates and
retired actions.

This does not mean every SchemaStore keyword was copied. Copying raw keyword counts
would retain stale fields and over-narrow several current interfaces. Current
first-party evidence and real configuration scope take precedence.

## Measured parity

| Dimension | Version 1 | Version 4 result |
| --- | ---: | --- |
| top-level settings benchmarked | 131 | 124 active in `settings.json`; 7 moved, different-surface, renamed, or unverified legacy; 0 unaccounted |
| constrained property paths | 532 | 544 current V4 paths; 516 V1 paths active; 16 explicitly scoped/retired/legacy; 0 unaccounted; 28 current paths V1 lacks |
| typed top-level V4 settings | n/a | 125 of 125, including current first-party-only fields |
| independently reported runtime setting diagnostics | n/a | 111 exact-binary doctor diagnostics |
| environment properties | 287 in the V1 public env artifact | 313 after current env + monitoring/provider supplements; no V1 public env identity missing |
| documented top-level flags | 70 | no V1 identity missing; V3's 39-command recursive help catalog retained |
| V1 built-in keybinding actions | 114 | 101 current documented actions; 12 exact-binary candidates; `doctor:fix` officially retired after 2.1.204 |
| command binding | SchemaStore regex | same grammar independently present in the exact binary, with validator-message corroboration |

The only common top-level type disagreement is `cleanupPeriodDays`: V1 says
`integer`; the current binary validator reports the broader JSON `number` type, so
V4 follows the release validator rather than preserving an unsupported narrowing.

## Why the 16 non-active V1 paths are not silently published

- `skipDangerousModePermissionPrompt` is currently documented at
  `permissions.skipDangerousModePermissionPrompt`, not as a top-level setting.
- `managedMcpServers` and `sshHostAllowlist` belong to Claude Desktop policy, now
  represented in `desktop-managed-settings.schema.json`.
- `permissions.disableAutoMode` is a legacy nested form; the current setting is the
  top-level `disableAutoMode`.
- `sandbox.ignoreViolations`, `sandbox.ripgrep.*`, and
  `sandbox.enabledPlatforms` lack current first-party evidence and remain legacy
  candidates rather than active constraints.
- `maxSkillDescriptionChars` appears replaced by the documented
  `skillListingMaxDescChars`; `skippedMarketplaces`, `skippedPlugins`, and
  `leftArrowOpensAgents` remain unverified legacy candidates.
- environment differences are classified as configurable, provider-standard,
  hook-provided (`CLAUDE_PROJECT_DIR`), explicitly retired, or unverified legacy
  rather than flattened into one settings env list.

## Improvements over Version 1

Version 4 adds current nested fields that V1 does not model, including sandbox
credential injection/masking fields, `sandbox.network.tlsTerminate`, current
auto-mode and voice structure, status-line refresh controls, policy-helper refresh,
and newer documented settings. It also adds:

- separate schemas for `settings.json`, `~/.claude.json`, and Desktop policy;
- current five-variant hook handler validation and current event coverage;
- both a current-public keybindings schema and an exact-parser compatibility schema;
- fact-level scope/status/evidence records;
- exact package integrity, recursive CLI help, static candidates, doctor validation,
  matching changelog hints, and advisory review contracts; and
- a post-generation V1 parity gate that cannot influence generation.

## Raw keyword counts are diagnostic, not the quality target

Version 1 has more repeated `enum`, `required`, and raw `type` keywords because it
inlines many environment toggles and repeats conditional branches. Version 4 has
more constrained current property paths and far more official examples, while
avoiding stale enum/action promotion and unsupported object closure. The parity gate
therefore checks identities, constrained paths, scopes, current evidence, positive
and negative fixtures, and semantic capability—not textual schema size.

## Remaining uncertainty

- Mutable official Markdown is content-addressed but not historically immutable.
- A static binary action token proves presence, not that the action is public or
  reachable in every UI context.
- Official examples prove observed shapes, not exhaustive closed objects.
- Legacy candidates without current first-party evidence are deliberately not
  validated as active settings.

These uncertainties are surfaced in catalogs and manifest drift instead of being
hidden behind an estimated “accuracy percentage.”

## Reproduce

```bash
npm run experiment:4
npm run experiment:4:check
npm run experiment:4:benchmark-v1
```

The first command never reads Version 1. The third command is the only step that
reads the SchemaStore-backed experiment.
