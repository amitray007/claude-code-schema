# Experiment version 2 — official docs only

This experiment asks: **what can the project produce without using SchemaStore at
all?**

It fetches only:

- exact and latest `@anthropic-ai/claude-code` npm metadata;
- official settings, environment, CLI, and keybindings Markdown; and
- the official `llms.txt` documentation index.

It does not fetch SchemaStore and does not execute or download the Claude Code
binary.

## Run

```bash
npm install --ignore-scripts
npm run experiment:2
npm run experiment:2:check
```

## Output

| Artifact | Docs-only behavior |
| --- | --- |
| `settings.schema.json` | Enumerates documented top-level setting names, but intentionally does not validate their value types or nested structure |
| `env.schema.json` | Validates the documented environment names as string-valued properties |
| `keybindings.schema.json` | Reconstructs the documented top-level file shape, contexts, and action enum; keystroke syntax and command-binding object structure remain permissive |
| `flags.catalog.json` | Enumerates documented active top-level flags without guessing arity |
| `keybinding-defaults.catalog.json` | Captures documented action/default rows |
| `manifest.json` | Records npm identity, official-doc source digests, artifact hashes, counts, and explicit validation limitations |

## What this proves

Official docs are enough to produce useful public-name catalogs and a meaningful
environment schema. They are not enough to recreate the rich settings constraints
or complete keybindings grammar supplied by SchemaStore without guessing from prose
and examples.

The accepted settings type mutation in `validate.mjs` is intentional: it
demonstrates the exact validation capability lost when SchemaStore is removed.

The files under [`examples/`](examples/) are handwritten smoke fixtures. The files
under [`output/`](output/) are generated and should not be edited manually.
