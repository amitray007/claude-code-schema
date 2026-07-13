# Claude Schema Store

A machine-readable, versioned schema of **Claude Code's configuration surface** —
its settings.json keys, environment variables, CLI flags, and keybindings —
regenerated automatically on every `@anthropic-ai/claude-code` release.

Think of it as a [SchemaStore](https://www.schemastore.org/)-style artifact, but
purpose-built for Claude Code and **auto-maintained**: keyed on the actual npm
release, cross-checking the shipped binary against the official docs, so it stays
current without a human noticing each release.

> **Status:** design / pre-implementation. This repository currently contains the
> knowledge base (`docs/`) capturing the design, sources, and decisions. The
> generator itself is not built yet.

## Why this exists

The existing community schema ([SchemaStore's `claude-code-settings.json`](https://json.schemastore.org/claude-code-settings.json))
is manually maintained by a single contributor, lags the binary by ~12 patch
releases, and sometimes rejects valid config. Claude Code ships new settings and
flags roughly daily. Keeping up by hand does not scale — so this project makes
keeping up a **robot's job**.

## What it produces

Both granular and combined, so consumers can take exactly what they need:

- `settings.schema.json` — settings.json keys
- `env.schema.json` — environment variables
- `flags.schema.json` — CLI flags + enums
- `keybindings.schema.json` — default keybindings
- `claude-code.schema.json` — combined index referencing all of the above

Each is tagged to the exact Claude Code version it was generated from.

## Knowledge base

The `docs/` folder is a **knowledge base**, not a linear spec — each entry is
self-contained, cross-linked, and independently maintainable. Start with the
overview, then jump to whatever you need.

| Entry | What it covers |
| --- | --- |
| [`docs/overview.md`](docs/overview.md) | What this is, the problem it solves, goals & non-goals |
| [`docs/sources.md`](docs/sources.md) | Every source: what data, how extracted, exact URL/command, worked example |
| [`docs/pipeline.md`](docs/pipeline.md) | How sources combine: trigger → extract → reconcile → emit |
| [`docs/schema-format.md`](docs/schema-format.md) | The output contract: per-category files + combined index |
| [`docs/extraction-notes.md`](docs/extraction-notes.md) | Real probe findings (v2.1.207) + hard safety constraints |
| [`docs/decisions.md`](docs/decisions.md) | Decision log — what was chosen and why (incl. the landscape survey, D-9) |
| [`docs/open-questions.md`](docs/open-questions.md) | Unresolved items still needing a call |

**The gap this fills** (from the landscape survey, [`docs/decisions.md`](docs/decisions.md) → D-9):
existing schemas are either *machine-readable but narrow* (SchemaStore: settings +
keybindings only; env unenumerated; no flags) or *broad but not machine-readable*
(prose guides). **Nobody** provides an auto-generated, versioned schema covering env
vars + CLI flags. This project owns those axes + the automation, and **adopts**
SchemaStore for settings + keybindings rather than duplicating them.

## License

Intended to be open-source. License TBD (see [`docs/open-questions.md`](docs/open-questions.md)).

## Related

Originated as an upstream dependency for [Orpheus](https://github.com/amitray007/orpheus)'s
settings system, but designed to be **consumable by anyone** wrapping or configuring
Claude Code.
