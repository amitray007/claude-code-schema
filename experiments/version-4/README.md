# Experiment version 4 — first-party, scoped, and independently typed

Version 4 keeps Version 3's exact-package inspection, recursive safe CLI help
probing, environment discovery, and release-note review. It replaces the partial
settings result with a first-party multi-source pipeline that does not use
SchemaStore as a generation input.

It combines current official configuration docs, release-tagged examples from
Anthropic's GitHub repository, the integrity-verified platform package, and an
isolated `claude doctor` validation probe.

## Run

```bash
npm install --ignore-scripts
npm run experiment:4
npm run experiment:4:check
npm run experiment:4:benchmark-v1
```

The benchmark reads Version 1 only after generation. It is a development parity
gate, not an input to any Version 4 artifact.

## Files and folders

| Path | Purpose |
| --- | --- |
| `generate.mjs` | Regenerates V3, reads expanded first-party sources, reconstructs paths and types, runs the exact-binary validation oracle, and emits V4 |
| `lib/` | Markdown parsing, JSON-example inference, schema merging, and dotted-path construction helpers |
| `validate.mjs` | Compiles schemas, validates positive/negative fixtures, and checks sources, provenance, floors, safety, and digests |
| `benchmark-v1.mjs` | Development-only capability comparison against V1; never writes V4 output |
| `examples/` | Handwritten smoke-test instances for each real configuration surface |
| `output/settings.schema.json` | Typed compatibility schema for `settings.json`, including nested permissions, worktree, sandbox, hooks, plugins, and status lines |
| `output/global-config.schema.json` | Separate schema for `~/.claude.json` keys that are invalid in `settings.json` |
| `output/desktop-managed-settings.schema.json` | Separate Desktop policy surface for Desktop-only managed fields |
| `output/keybindings.schema.json` | Current contexts/actions, null unbinding, structural keystroke validation, and an annotated command-binding compatibility form |
| `output/keybindings.runtime-compat.schema.json` | Exact parser-compatible action value shape for tools that prefer warnings over the public-action allowlist |
| `output/settings-facts.catalog.json` | Fact-level path, scope, status, evidence, and runtime-corroboration records |
| `output/legacy-candidates.catalog.json` | Moved, different-surface, legacy, and unverified candidates that must not masquerade as current settings |
| `output/keybinding-capabilities.catalog.json` | Current documented actions, exact-binary action-token candidates, and command-binding validator evidence |
| `output/environment-capabilities.catalog.json` | Configurable, provider-standard, hook-provided, retired, and unverified environment names by scope |
| `output/env.schema.json`, `flags.catalog.json`, `cli.catalog.json` | V3 environment and CLI coverage inherited unchanged |
| `output/binary-candidates.catalog.json` | V3 static binary candidates and corroboration |
| `output/changelog-hints.catalog.json`, `changelog-review.schema.json` | V3 release review queue and review contract |
| `output/manifest.json` | Source/artifact digests, release identity, coverage, drift, and safety assertions |

## Safety and interpretation

The doctor probe runs the exact verified release binary with stdin closed, an
isolated home/config directory, no inherited credentials, and update/telemetry
suppression. Only diagnostic hashes and derived types are retained.

Official examples prove shapes, not every possible constraint. Compatibility
objects therefore remain open unless first-party evidence makes a closed set
explicit. Unknown and stale candidates stay in catalogs instead of being published
as active schema properties.
