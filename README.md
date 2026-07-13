# claude-code-schema

A machine-readable, versioned description of selected **Claude Code configuration
interfaces**: validation schemas for `settings.json` and `keybindings.json`, an
environment-map schema, and catalogs for CLI flags and default keybindings.

It is purpose-built for Claude Code and **auto-maintained**: keyed on the actual npm
release, grounded in first-party sources, and independently checked against the
integrity-verified release binary. SchemaStore is a benchmark, not a generation
dependency.

> **Status:** production generator, validation suite, release discovery, review
> workflow, and publication staging are implemented. [`experiments/`](experiments/)
> retains the four source-strategy proofs that established the production design.

## Which file should I use?

For ordinary Claude Code configuration, there are two primary references:

| You want                                          | Use                       |
| ------------------------------------------------- | ------------------------- |
| `settings.json` keys, types, and nested structure | `settings.schema.json`    |
| Claude Code environment-variable names            | `environment.schema.json` |

The similarly named `*.catalog.json` files preserve source and runtime evidence;
they are not the primary configuration references. See the
[`consumer quick start`](docs/quick-start.md) for direct release URLs, actual usage
locations, and validated examples. `settings.schema.json` also references
`environment.schema.json` from its real `env` property, avoiding duplicate variable
definitions.

## Why this exists

The existing community schema ([SchemaStore's `claude-code-settings.json`](https://json.schemastore.org/claude-code-settings.json))
is useful but periodically updated and validation-oriented (settings plus a separate
keybindings schema). Claude Code changes rapidly, and its environment variables,
CLI flags, and documented keybinding defaults need different representations and
source policies. This project automates that broader collection while making source
drift visible.

## What it produces

The release is organized by purpose. Start with `catalog.json`: it states which
product/interface every artifact describes, where that interface is used, and
whether the file is a validator, data catalog, or audit record.

- Configuration schemas validate `settings.json`, `~/.claude.json`, Desktop-managed
  policy, a JSON projection of the process environment, and terminal UI
  `keybindings.json`. `claude-code.schema.json` composes those five surfaces for
  tooling; Claude Code does not consume that synthetic object.
- Domain catalogs combine related facts into `settings.catalog.json`,
  `environment.catalog.json`, `cli.catalog.json`, and `keybindings.catalog.json`.
  The CLI catalog contains documented flags, the probed command tree and arguments,
  and clearly separated static candidates.
- `review.catalog.json`, `manifest.json`, and `validation-report.json` contain
  maintainer review evidence, exact source/artifact digests, and validation results.

Each is tagged to the exact Claude Code version it was generated from.

## Generate and verify

```bash
npm ci --ignore-scripts
npm run schema:generate -- --version 2.1.207 --output .work/candidate
npm run schema:validate -- --directory .work/candidate
npm run schema:diff -- --from output --to .work/candidate
npm run test:coverage
```

Generation uses only first-party evidence and the integrity-verified package for the
requested Claude Code version. It writes to a staging directory, validates the full
candidate, and atomically replaces the requested output only after every check
passes. Use `--source experiments/version-4/output` with `schema:generate` for a
fully offline reproduction of the frozen 2.1.207 reference.

The generated [`output/catalog.json`](output/catalog.json) is the machine-readable
entry point. [`output/claude-code.schema.json`](output/claude-code.schema.json)
combines settings, global configuration, Desktop policy, environment, and
keybindings under explicit property names. A validated instance is available at
[`examples/combined.json`](examples/combined.json).

Immutable versions are separate assets on GitHub Releases. For example:

```text
https://github.com/amitray007/claude-code-schema/releases/download/v2.1.207/settings.schema.json
```

The repository does not duplicate release history in version directories or a
static website.

## Historical experiments

- **Version 1** combines official docs with SchemaStore's structured validators.
- **Version 2** removes SchemaStore entirely to measure the resulting loss of type
  and structural validation.
- **Version 3** keeps the independent version 2 base and adds an integrity-verified
  platform package, safe recursive CLI help probing, static candidates, and
  matching-release changelog hints with a deterministic/human review contract.
- **Version 4** adds expanded official configuration sources, tag-pinned Anthropic
  examples, scoped schemas, nested reconstruction, and the exact binary's isolated
  `doctor` validator. Version 1 is read only by the development parity benchmark.

See [`experiments/README.md`](experiments/README.md) for the comparison.

## Knowledge base

The `docs/` folder is a **knowledge base**, not a linear spec — each entry is
self-contained, cross-linked, and independently maintainable. Start with the
overview, then jump to whatever you need.

| Entry                                                                                                  | What it covers                                                                       |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| [`docs/quick-start.md`](docs/quick-start.md)                                                           | Which file to use for settings and environment variables                             |
| [`docs/overview.md`](docs/overview.md)                                                                 | What this is, the problem it solves, goals & non-goals                               |
| [`docs/sources.md`](docs/sources.md)                                                                   | Every source: what data, how extracted, exact URL/command, worked example            |
| [`docs/pipeline.md`](docs/pipeline.md)                                                                 | How sources combine: trigger → extract → reconcile → emit                            |
| [`docs/schema-format.md`](docs/schema-format.md)                                                       | The output contract: validators, catalogs, and manifest                              |
| [`docs/production-architecture.md`](docs/production-architecture.md)                                   | Implemented modules, combined schema, and atomic output                              |
| [`docs/ci-release-operations.md`](docs/ci-release-operations.md)                                       | CI, release issues, manual approval, and publication runbook                         |
| [`docs/hosting.md`](docs/hosting.md)                                                                   | GitHub Release asset URLs and download contract                                      |
| [`docs/extraction-notes.md`](docs/extraction-notes.md)                                                 | Real probe findings (v2.1.207) + hard safety constraints                             |
| [`docs/audits/audit-2026-07-13.md`](docs/audits/audit-2026-07-13.md)                                   | Live-source accuracy audit, corrections, and experiment results                      |
| [`docs/audits/version-4-parity-audit-2026-07-13.md`](docs/audits/version-4-parity-audit-2026-07-13.md) | First-party V4 parity result, deep path accounting, and deliberate legacy exclusions |
| [`docs/decisions.md`](docs/decisions.md)                                                               | Decision log — what was chosen and why (including the landscape survey, D-9)         |
| [`docs/open-questions.md`](docs/open-questions.md)                                                     | Unresolved items still needing a call                                                |

**The gap this fills** (from the landscape survey, [`docs/decisions.md`](docs/decisions.md) → D-9):
existing schemas are either _machine-readable but narrow_ (SchemaStore: settings +
keybindings only; env unenumerated; no flags) or _broad but not machine-readable_
(prose guides). **Nobody** provides an auto-generated, versioned schema covering env
vars + CLI flags. This project owns those axes and now independently reconstructs
settings and keybindings from current first-party evidence. SchemaStore remains a
useful regression benchmark for capabilities that must be preserved, redirected,
or explicitly rejected as stale.

## Contributing

Contributions are welcome. Every schema change must include evidence and tests; see
[`CONTRIBUTING.md`](CONTRIBUTING.md) and the [`docs/`](docs/) knowledge base.

## License

[MIT](LICENSE) © 2026 Amit Ray.

## Related

Originated as an upstream dependency for [Orpheus](https://github.com/amitray007/orpheus)'s
settings system, but designed to be **consumable by anyone** wrapping or configuring
Claude Code.
