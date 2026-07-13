# Experiment version 1 — official docs + SchemaStore

This is a deliberately small proof of the corrected collection and output model.
It fetches current first-party Claude Code documentation plus the two JSON Schemas
that those docs link to, pins the result to an actual npm version, records SHA-256
digests for every input, and emits representative artifacts.

It does **not** execute the Claude Code binary. It also does not download the
platform binary: static binary analysis is useful for discovering undocumented
candidates, but it is not needed to produce the public experiment.

The generated catalogs intentionally retain identifiers, defaults, version markers,
source links, and content digests without copying the official docs' full prose.
SchemaStore schema content is retained under its upstream Apache-2.0 license; a
production repository must include the required license/attribution notices.

## Run

```bash
npm install --ignore-scripts
npm run experiment:1
npm run experiment:1:check
```

The checked-in output was produced for `2.1.207`. `--version` is accepted only when
it still equals npm `latest`, because the official docs are mutable and cannot be
honestly relabeled as an older release. Historical regeneration needs archived
source bytes. Output is written to [`output/`](output/).

## Output

| Artifact | Meaning |
| --- | --- |
| `settings.schema.json` | A permissive settings validator based on SchemaStore, augmented with current documented keys that SchemaStore has not typed yet |
| `env.schema.json` | A schema for a JSON representation of an environment map; documented variables are properties and all values are strings |
| `keybindings.schema.json` | The dedicated keybindings validator linked by the official docs |
| `flags.catalog.json` | Public top-level flag metadata from the official CLI reference; intentionally a catalog, not a JSON Schema |
| `keybinding-defaults.catalog.json` | Official action/default tables; intentionally separate from the user keybindings validator |
| `manifest.json` | Version, source URLs and digests, artifact roles, counts, and source-drift observations |

The examples in [`examples/`](examples/) are validated by
`npm run experiment:1:check`.

## Why this shape

JSON Schema validates JSON instances. Claude Code's `settings.json` and
`keybindings.json` are JSON instances, so schemas fit them directly. CLI flags are
tokens scoped to commands and subcommands, so a catalog is the honest model. An
environment can be projected into a JSON string map for validation, but that
representation is explicitly declared. The manifest indexes these heterogeneous
artifacts without pretending that Claude Code consumes one combined JSON document.
