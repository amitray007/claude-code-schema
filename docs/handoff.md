# Implementation handoff

> **Entry type:** Handoff brief
> **Status:** Audited design; real-source experiment is working
> **Read first:** [`audit-2026-07-13.md`](audits/audit-2026-07-13.md) →
> [`sources.md`](sources.md) → [`pipeline.md`](pipeline.md) →
> [`schema-format.md`](schema-format.md) → [`decisions.md`](decisions.md)

## What exists now

The repository contains the corrected design and versioned Node/Ajv experiments in
[`../experiments/`](../experiments/). Version 1 combines official docs with
SchemaStore; version 2 deliberately excludes it to expose lost constraints; version
3 adds verified package inspection and bounded CLI probing; version 4 replaces the
partial settings result with expanded first-party sources, tagged Anthropic
examples, scoped artifacts, nested reconstruction, and exact-binary doctor
validation. SchemaStore is now only a post-generation development benchmark.

Run the experiment with:

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

The production scheduler, durable snapshots, complete fact model, binary candidate
extractor, semantic diff engine, and publication workflow are not built.

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

## Suggested production build order

| # | Unit | Acceptance check |
| --- | --- | --- |
| 1 | Extract the experiment's fetch/parser code into tested modules and fixture all current source shapes | offline fixture run reproduces the checked-in manifest counts and drift |
| 2 | Add content-addressed source snapshots/run records | every artifact fact resolves to an exact source digest and parser version |
| 3 | Define the normalized fact/evidence model | existence, type, prose, default, enum, version, and status retain independent evidence |
| 4 | Complete settings path reconciliation | nested/dotted docs paths resolve; different configuration surfaces stay separate |
| 5 | Harden bounded CLI/doctor extraction | command path, aliases, arity, choices, and settings diagnostics remain safe and reproducible |
| 6 | Add binary candidate reports | linux-x64 per release; OS representatives on stable/weekly; public artifacts unchanged by unclassified candidates |
| 7 | Build semantic source/artifact diffing | detects drops, growth, narrowing, enum removals, status changes, and mutable-source changes |
| 8 | Expand first-party positive/negative fixtures and mutations | deliberately invalid settings/keybindings fail while official examples pass |
| 9 | Implement staging + atomic publication + tag/manifest index | forced failure leaves `latest/` and published tag untouched |
| 10 | Add scheduled orchestration and diagnostics PR/issue flow | exact npm version triggers once; absent Git tag waits; unexplained drift requests review |

## Recommended layout

```text
/src/                    production fetch, parse, facts, reconcile, emit, validate
/test/fixtures/sources/  pinned upstream response fixtures
/test/fixtures/valid/    official/tagged/curated positive cases
/test/fixtures/invalid/  negative and mutation cases
/latest/                 published artifact set
/runs/ or external CAS   exact source/run evidence if repository size permits
/experiments/version-N/  retained, isolated proofs and examples
/docs/audits/            dated accuracy and source audits
/docs/                   design and decisions
```

## Decisions still needed

- public name and license;
- concrete upstream PR policy for settings/keybindings fixes;
- the exact Orpheus consumption contract; and
- whether source snapshots live in git, release assets, or an external
  content-addressed store.

## Definition of done for v1

- An exact npm release produces the full corrected artifact set from staged,
  digest-recorded first-party sources using only the documented bounded probes.
- Positive and negative fixtures, mutations, semantic diffs, and manifest checks are
  green.
- A forced parse, integrity, or drift failure proves last-good is untouched.
- Published version lookup uses tag/ref plus manifest digest.
- Binary-only discoveries appear only in a candidate report.
- Documentation describes built behavior rather than planned behavior.
