# Implementation handoff

> **Entry type:** Handoff brief
> **Status:** Production pipeline implemented and live-tested
> **Read first:** [`audit-2026-07-13.md`](audits/audit-2026-07-13.md) →
> [`sources.md`](sources.md) → [`pipeline.md`](pipeline.md) →
> [`schema-format.md`](schema-format.md) → [`decisions.md`](decisions.md)

## What exists now

The repository contains the production TypeScript CLI under [`../src/`](../src/),
the CI and release workflows under [`../.github/workflows/`](../.github/workflows/),
reviewed 2.1.210 artifacts under [`../output/`](../output/), and the corrected
design and versioned Node/Ajv experiments in
[`../experiments/`](../experiments/). Version 1 combines official docs with
SchemaStore; version 2 deliberately excludes it to expose lost constraints; version
3 adds verified package inspection and bounded CLI probing; version 4 replaces the
partial settings result with expanded first-party sources, tagged Anthropic
examples, scoped artifacts, nested reconstruction, and exact-binary doctor
validation. SchemaStore is now only a historical post-generation development
benchmark and is not read by production generation.

Run the production path with:

```bash
npm ci --ignore-scripts
npm run schema:generate -- --version 2.1.207 --output .work/candidate
npm run schema:validate -- --directory .work/candidate
npm run schema:diff -- --from output --to .work/candidate
npm run test:coverage
```

Daily discovery, exact-version analysis, issue reporting, reviewed PR preparation,
GitHub Release creation and per-file attestations are implemented as
workflows. Repository settings and the protected production environment still need
to be enabled by a maintainer as described in
[`ci-release-operations.md`](ci-release-operations.md).

## Non-negotiable constraints

1. **Bound every binary operation.** Only use `--version`, help paths parsed from
   prior help output, and isolated `doctor` validation fixtures. Never prompt,
   authenticate, update, install, or probe guessed operational commands.
2. **Verify package integrity.** Derive platform packages from the wrapper and check
   `dist.integrity` before inspection.
3. **Docs define public status.** Binary-only identifiers are candidates, not public
   facts and not automatically internal.
4. **Do not use SchemaStore as a generation source.** Use it only after generation
   as a capability benchmark; resolve gaps through current first-party evidence.
5. **Preserve scope.** CLI options are keyed by command path; dotted setting paths
   are structurally resolved rather than emitted as literal top-level names.
6. **Use the correct artifact kind.** JSON Schema for real JSON instances; catalogs
   for CLI/default behavior; manifest for the combined index.
7. **Record fact-level evidence and content digests.** One `x-source` string is not
   enough when existence, type, and prose come from different sources.
8. **Never replace last-good after a failed or unexplained run.** Generate in staging
   and publish atomically only after every gate passes.
9. **Never commit or redistribute binaries or raw strings.** Distilled candidates and
   diffs only.

## Implemented production units

| #   | Unit                                                                  | Acceptance check                                     |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------- |
| 1   | Tested Markdown extraction and schema inference modules               | parser and merge unit tests                          |
| 2   | Exact source/run evidence inherited from V4 and normalized manifests  | source URLs, byte counts, and digests preserved      |
| 3   | Scoped settings, global, Desktop, environment, and keybinding schemas | all schemas compile and behavioral checks pass       |
| 4   | Bounded CLI and doctor extraction                                     | exact 2.1.207 live run completed without credentials |
| 5   | Binary candidate and changelog-hint catalogs                          | candidates remain outside public schemas             |
| 6   | Semantic settings-path diff and deterministic issue report            | integration and CLI tests                            |
| 7   | Atomic candidate generation and publication staging                   | tamper and determinism tests                         |
| 8   | Scheduled discovery, review issue, release PR, and GitHub Release     | actionlint-clean workflow definitions                |

## Recommended layout

```text
/src/                    production fetch, parse, facts, reconcile, emit, validate
/test/fixtures/sources/  pinned upstream response fixtures
/test/fixtures/valid/    official/tagged/curated positive cases
/test/fixtures/invalid/  negative and mutation cases
/output/                 current reviewed artifact set
/runs/ or external CAS   exact source/run evidence if repository size permits
/experiments/version-N/  retained, isolated proofs and examples
/docs/audits/            dated accuracy and source audits
/docs/                   design and decisions
```

## Maintainer setup still needed

- enable the required branch checks;
- create the protected `production` environment and reviewer rule;
- enable repository auto-merge with zero required approving reviews; and
- allow the preparation and automatic latest-release workflows to open pull requests
  and request squash auto-merge.

## Task list

- [x] Add CI that automatically creates an immutable GitHub Release for a newly
      discovered npm `latest` version. Preserve exact source evidence, make retries
      idempotent, and fail closed rather than regenerating historical versions from
      mutable documentation.

## Definition of done for v1

- An exact npm release produces the full corrected artifact set from staged,
  digest-recorded first-party sources using only the documented bounded probes.
- Positive and negative fixtures, mutations, semantic diffs, and manifest checks are
  green.
- A forced parse, integrity, or drift failure proves last-good is untouched.
- Published version lookup uses tag/ref plus manifest digest.
- Binary-only discoveries appear only in a candidate report.
- Documentation describes built behavior rather than planned behavior.
