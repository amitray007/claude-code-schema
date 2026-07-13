# Production architecture

The production generator is a deterministic TypeScript CLI under [`src/`](../src/).
AI is not part of collection, reconciliation, validation, review, or publication.

## Current extraction boundary

Version 4 remains the verified extraction reference. A live production run copies
the Version 2–4 engines to an ephemeral directory, runs them there, reads their JSON
outputs, and deletes the workspace. This prevents arbitrary-version generation from
rewriting the historical experiments.

Production code owns:

- command-line contracts and paths;
- release discovery;
- stable hosted schema identifiers;
- artifact normalization and digests;
- the combined tooling-envelope schema;
- schema compilation and behavioral checks;
- deterministic formatting;
- semantic diffs and issue reports; and
- publication staging.

The next internal refactor can move acquisition and probing from the temporary V4
adapter into `src/` module by module. Its acceptance gate is byte-equivalent output
for a frozen source set plus a successful live run. The adapter is intentionally
isolated in `src/pipeline/engine.ts` so that transition does not affect consumers.

## Modules

| Directory          | Responsibility                                                    |
| ------------------ | ----------------------------------------------------------------- |
| `src/artifacts/`   | Normalize emitted files and build the combined schema             |
| `src/diff/`        | Produce reviewable semantic changes between releases              |
| `src/discovery/`   | Read the npm release history                                      |
| `src/domain/`      | Shared manifest, artifact, and report contracts                   |
| `src/extract/`     | Tested source parsers being promoted from V4                      |
| `src/pipeline/`    | Run the verified engine and atomically emit a candidate           |
| `src/publication/` | Atomically stage reviewed bytes into repository `output/`         |
| `src/reports/`     | Render deterministic release-review issue bodies                  |
| `src/schema/`      | Infer and merge JSON Schema fragments                             |
| `src/validation/`  | Compile schemas, verify digests, and run positive/negative checks |

## Combined schema

`catalog.json` is the release entry point. It separates configuration schemas,
domain catalogs, and audit/review artifacts and records the real consumer/location
of every surface. The four domain catalogs consolidate the fragmented experiment
outputs without mixing documented facts with binary-only candidates.

`claude-code.schema.json` validates an explicit object with five required members:

- `settings`;
- `globalConfig`;
- `desktopManagedSettings`;
- `environment`; and
- `keybindings`.

It is a tooling envelope, not a file read by Claude Code. Relative `$ref` values
point to the individual schemas in the same release directory. See
[`examples/combined.json`](../examples/combined.json).

## Atomic output

Generation writes into a staging directory, validates the complete candidate, and
only then swaps it into the requested destination. A failed candidate never
replaces the last successful directory. JSON is always emitted with two-space
indentation and a final newline, and every declared artifact is content-hashed in
the manifest. Publication atomically replaces one tracked `output/` directory.
Immutable versions exist only as separate GitHub Release assets; no site or
per-version directory is generated.
