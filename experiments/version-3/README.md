# Experiment version 3 — independent package inspection and CLI probing

This experiment keeps version 2's npm and official-documentation baseline and adds
three independent release-pinned channels without using SchemaStore:

1. the exact host platform npm package, verified against `dist.integrity` before it
   is unpacked;
2. static strings plus tightly bounded `--version` and recursively discovered
   `--help` probes against the extracted binary; and
3. the changelog and GitHub release metadata at the matching `v<version>` tag.

The platform archive and binary exist only in a temporary directory and are deleted
after generation. The output contains distilled identifiers, hashes, parse results,
and candidate classifications—not the binary, raw strings, raw help, or release-note
prose.

## Run

```bash
npm install --ignore-scripts
npm run experiment:3
npm run experiment:3:check
```

By default, the generator selects the optional package matching the current host.
An exact package from the release's declared platform matrix can be selected with:

```bash
node experiments/version-3/generate.mjs \
  --platform-package @anthropic-ai/claude-code-darwin-arm64
```

The selected package must match the exact Claude Code version.

## Probe safety boundary

The binary is executed, but only for:

- `claude --version`;
- `claude --help`; and
- `claude <command-path> --help`, where every path was parsed from a successful
  parent help response.

Each invocation runs with stdin closed, a temporary `HOME` and config directory, no
inherited credential variables, network/telemetry/update suppression variables, a
10-second timeout, a three-command depth limit, and an 80-command total limit. The
experiment never sends a prompt, authenticates, updates, installs, or invokes an
operational command without `--help`.

## Files and folders

| Path | Purpose |
| --- | --- |
| `generate.mjs` | Regenerates the version 2 base, verifies and inspects the platform package, performs safe probes, parses release hints, and emits version 3 |
| `validate.mjs` | Compiles schemas, validates examples and digests, audits every probe path, enforces count floors, and checks that no binary/raw dump was emitted |
| `examples/` | Handwritten settings, environment, keybindings, and AI-review smoke fixtures |
| `output/settings.schema.json` | Docs-derived partial settings schema with static identifier corroboration; value types remain unverified |
| `output/env.schema.json` | Docs-derived environment-map schema with binary corroboration |
| `output/keybindings.schema.json` | Docs-derived partial keybindings schema with corroborated action observations |
| `output/flags.catalog.json` | Documented top-level options annotated with matching CLI help observations |
| `output/keybinding-defaults.catalog.json` | Official documented keybinding defaults inherited from version 2 |
| `output/cli.catalog.json` | Parsed command tree, positional arguments, aliases, option names, value arity, variadic state, choices, and displayed defaults from safe help probes |
| `output/binary-candidates.catalog.json` | Static environment/CLI candidates and documented identifier corroboration; binary-only values remain non-public candidates |
| `output/changelog-hints.catalog.json` | Matching-release bullet hashes, source lines, typed identifier hints, and AI/human review reasons |
| `output/changelog-review.schema.json` | Contract for advisory AI or human release-note classification |
| `output/manifest.json` | Complete source/artifact hashes, integrity result, counts, drift, platform identity, and safety assertions |

## What version 3 improves—and what it does not

Version 3 provides much stronger CLI coverage than documentation alone: it observes
subcommands and parses argument/option structure directly from the exact released
binary. It also discovers undocumented environment and option candidates and makes
release-note interpretation an explicit review stage.

Static token presence still cannot prove that a setting is public or determine its
JSON value type, nested structure, or constraints. Consequently, the independent
settings schema remains deliberately partial. AI changelog classification is
advisory: it may prioritize deterministic extraction work, but it cannot directly
publish or mutate an artifact.
