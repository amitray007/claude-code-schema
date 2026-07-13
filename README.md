# claude-code-schema

A machine-readable, versioned description of selected **Claude Code configuration
interfaces**: validation schemas for `settings.json` and `keybindings.json`, an
environment-map schema, and catalogs for CLI flags and default keybindings.

It is purpose-built for Claude Code and **auto-maintained**: keyed on the actual npm
release, grounded in first-party sources, and independently checked against the
integrity-verified release binary. SchemaStore is a benchmark, not a generation
dependency.

> **Status:** audited design + working experiment. The production generator is not
> built, but [`experiments/`](experiments/) contains versioned, real-source proofs
> that emit artifacts and validate representative examples.

## Why this exists

The existing community schema ([SchemaStore's `claude-code-settings.json`](https://json.schemastore.org/claude-code-settings.json))
is useful but periodically updated and validation-oriented (settings plus a separate
keybindings schema). Claude Code changes rapidly, and its environment variables,
CLI flags, and documented keybinding defaults need different representations and
source policies. This project automates that broader collection while making source
drift visible.

## What it produces

Granular artifacts plus a manifest, so consumers can take exactly what they need:

- `settings.schema.json` — validates `settings.json`
- `global-config.schema.json` — validates the distinct `~/.claude.json` surface
- `desktop-managed-settings.schema.json` — validates Desktop-only policy fields
- `env.schema.json` — validates a declared JSON projection of an environment map
- `keybindings.schema.json` — validates `keybindings.json`
- `flags.catalog.json` — scoped CLI option metadata
- `keybinding-defaults.catalog.json` — documented actions and defaults
- `manifest.json` — versioned index, source digests, artifact digests, counts, and drift

Each is tagged to the exact Claude Code version it was generated from.

## Try the experiment

```bash
npm install --ignore-scripts
npm run experiment:1
npm run experiment:1:check
npm run experiment:2
npm run experiment:2:check
npm run experiment:3
npm run experiment:3:check
npm run experiment:4
npm run experiment:4:check
npm run experiment:4:benchmark-v1
```

- **Version 1** combines official docs with SchemaStore's structured validators.
- **Version 2** removes SchemaStore entirely to measure the resulting loss of type
  and structural validation.
- **Version 3** keeps the independent version 2 base and adds an integrity-verified
  platform package, safe recursive CLI help probing, static candidates, and
  matching-release changelog hints with an AI/human review contract.
- **Version 4** adds expanded official configuration sources, tag-pinned Anthropic
  examples, scoped schemas, nested reconstruction, and the exact binary's isolated
  `doctor` validator. Version 1 is read only by the development parity benchmark.

See [`experiments/README.md`](experiments/README.md) for the comparison.

## Knowledge base

The `docs/` folder is a **knowledge base**, not a linear spec — each entry is
self-contained, cross-linked, and independently maintainable. Start with the
overview, then jump to whatever you need.

| Entry | What it covers |
| --- | --- |
| [`docs/overview.md`](docs/overview.md) | What this is, the problem it solves, goals & non-goals |
| [`docs/sources.md`](docs/sources.md) | Every source: what data, how extracted, exact URL/command, worked example |
| [`docs/pipeline.md`](docs/pipeline.md) | How sources combine: trigger → extract → reconcile → emit |
| [`docs/schema-format.md`](docs/schema-format.md) | The output contract: validators, catalogs, and manifest |
| [`docs/extraction-notes.md`](docs/extraction-notes.md) | Real probe findings (v2.1.207) + hard safety constraints |
| [`docs/audits/audit-2026-07-13.md`](docs/audits/audit-2026-07-13.md) | Live-source accuracy audit, corrections, and experiment results |
| [`docs/audits/version-4-parity-audit-2026-07-13.md`](docs/audits/version-4-parity-audit-2026-07-13.md) | First-party V4 parity result, deep path accounting, and deliberate legacy exclusions |
| [`docs/decisions.md`](docs/decisions.md) | Decision log — what was chosen and why (including the landscape survey, D-9) |
| [`docs/open-questions.md`](docs/open-questions.md) | Unresolved items still needing a call |

**The gap this fills** (from the landscape survey, [`docs/decisions.md`](docs/decisions.md) → D-9):
existing schemas are either *machine-readable but narrow* (SchemaStore: settings +
keybindings only; env unenumerated; no flags) or *broad but not machine-readable*
(prose guides). **Nobody** provides an auto-generated, versioned schema covering env
vars + CLI flags. This project owns those axes and now independently reconstructs
settings and keybindings from current first-party evidence. SchemaStore remains a
useful regression benchmark for capabilities that must be preserved, redirected,
or explicitly rejected as stale.

## Contributing

Contributions are welcome — design feedback counts as much as code while the
generator is still pre-implementation. See [`CONTRIBUTING.md`](CONTRIBUTING.md)
and the [`docs/`](docs/) knowledge base to get oriented.

## License

[MIT](LICENSE) © 2026 Amit Ray.

## Related

Originated as an upstream dependency for [Orpheus](https://github.com/amitray007/orpheus)'s
settings system, but designed to be **consumable by anyone** wrapping or configuring
Claude Code.
