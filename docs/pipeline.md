# Pipeline

> **Entry type:** Design
> **Status:** Corrected by the 2026-07-13 audit
> **Related:** [`sources.md`](sources.md) · [`schema-format.md`](schema-format.md) ·
> [`audit-2026-07-13.md`](audits/audit-2026-07-13.md)

The pipeline publishes public, versioned artifacts while keeping static binary
discoveries separate and making source drift explicit.

## Flow

```text
npm exact version changes
        |
        v
resolve wrapper metadata + verify matching Git tag when available
        |
        v
fetch expanded official docs + tagged examples + tagged changelog
record requested/resolved URLs, bytes, and source digests
        |
        +--------------------------------------+
        | verify exact platform integrity      |
        | static candidates + bounded --help   |
        | isolated doctor validation oracle    |
        | never prompt, authenticate, or update|
        +--------------------------------------+
        |
        v
parse bounded sections -> normalized fact model -> reconcile per fact
        |
        v
emit schemas + catalogs + manifest into a staging directory
        |
        v
meta-schema / fixtures / mutations / semantic diff / digest gates
        |
   green|                         |red or unexplained drift
        v                         v
publish atomically          keep last-good; retain diagnostics;
tag release + digest        open review issue/PR
```

## Trigger and release identity

Poll npm for `latest` or react to a package event, but resolve and store the exact
version endpoint before work begins. Verify wrapper/platform version agreement and
package integrity. The matching Anthropic Git tag/release is corroboration and pins
the changelog; if it is temporarily absent, wait/retry rather than reading `main` as
if it were versioned.

## Extract

Fetch independent sources concurrently. Every source fetch returns a record with
source ID, role, requested URL, resolved URL, byte count, SHA-256, and raw bytes.
Production must archive the exact mutable docs bytes or a content-addressed snapshot
if historical reproducibility is promised.

The docs parser selects the expected heading range and required table headers.
`llms.txt` provides route discovery. Parse failures, ambiguous duplicate sections,
and zero/implausible counts are hard failures.

Static binary discovery emits only candidate/diff facts. Bounded execution is
limited to `--version`, recursively discovered `--help` paths, and isolated
`doctor` validation against generated invalid settings. Every operation has closed
stdin, a temporary home, traffic/update/telemetry suppression, timeouts, and no
inherited credential variables.

## Normalize before reconciling

Use an internal fact model rather than merging source JSON directly. At minimum a
fact records:

- artifact kind and identity (`setting path`, `env name`, `command path + option`,
  or `context + action`);
- fact kind (`existence`, `type`, `description`, `default`, `enum`, `version bound`,
  `status`);
- normalized value and raw evidence pointer;
- source ID/digest and parser version; and
- confidence/status based on source policy.

This prevents one scalar `x-source` from erasing which source established which
part of a record.

## Reconciliation

| Fact                                        | Rule                                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| public setting/env/flag/action existence    | official docs establish public status                                                                                    |
| settings type constraints                   | infer from official examples/tables, then corroborate top-level types/enums with exact-binary doctor diagnostics         |
| specialized nested structure                | use the owning official page; never infer a closed object from one example                                               |
| global/Desktop fields                       | emit separate scoped artifacts instead of flattening them into `settings.json`                                           |
| keybindings                                 | current docs define public contexts/actions; binary evidence may preserve undocumented candidates without promoting them |
| descriptions/default display/version bounds | docs supply the public value                                                                                             |
| flag arity/default/choices/path             | accept only a scoped Commander/static fact or explicit docs fact                                                         |
| binary-only identifier                      | retain as `undocumented-candidate`; do not publish into the public artifact                                              |
| old benchmark vs current evidence mismatch  | classify as active, moved, different-surface, retired, or unverified legacy; current first-party truth wins              |
| changelog identifier                        | hint only unless artifact kind + change verb are unambiguous                                                             |

Do not label a binary-only env var `internal`: that is a classification not proven by
absence from docs. Do not flatten subcommand options by name.

## Validation gate

All required checks pass before atomic publication:

1. **Source integrity:** exact versions match; npm integrity verifies; required
   sources have recorded digests.
2. **Parser structure:** expected sections/tables exist once; routes still appear in
   `llms.txt`; fields and counts are plausible.
3. **Schema correctness:** every draft-07 schema compiles in isolation and all
   internal `$ref` values resolve without sibling registration.
4. **Positive and negative fixtures:** official/tagged examples and curated
   invalid/mutation cases behave as expected.
5. **Catalog invariants:** unique identities within scope, aliases normalized,
   command paths retained, and required provenance present.
6. **Semantic diff:** both unexpected drops and growth, type narrowing, enum removal,
   status changes, and source-digest changes are evaluated against the last-good run.
7. **Cross-source assertions:** every documented setting/action appears in the
   compatible validator or an explicit unresolved-drift list.
8. **Manifest verification:** source and artifact digests, counts, format versions,
   and release identity agree with emitted bytes.
9. **Development parity:** after generation, compare against Version 1 so every old
   capability is active, redirected, explicitly retired, or retained as a candidate.
   The benchmark never feeds the generator.

Count floors remain a useful tripwire but are not an acceptance proof. A
positive-only real-config corpus is supplemental because permissive unknown-property
handling can make it pass even when the catalog is incomplete.

## Publication and versioning

- Generate into a staging directory and atomically replace `output/` only after all
  gates pass.
- Tag the publishing repository with `vX.Y.Z` and upload every JSON file as a
  separate, checksummed and attested GitHub Release asset.
- Use immutable `releases/download/vX.Y.Z/<file>` URLs as schema identities. Do not
  maintain duplicate version directories or a static-site copy.
- If the exact same Claude Code version is observed with different mutable-doc
  digests, retain it as a new observation and require review before replacing the
  published artifact.
- Never commit tarballs, binaries, or raw string dumps.

## Failure modes

| Failure                               | Behavior                                                              |
| ------------------------------------- | --------------------------------------------------------------------- |
| docs structure changed                | block publication; keep last-good; save bounded diagnostics           |
| specialized official page unavailable | retry; do not silently erase nested constraints                       |
| Git tag temporarily absent            | wait/retry; do not substitute `main`                                  |
| binary extraction collapsed           | public docs-backed artifacts may continue; mark discovery unavailable |
| unexplained source drift              | emit candidate PR/issue, not auto-merge                               |
| validation regression                 | keep last-good and attach semantic diff                               |

## Pivot readiness

Monitor official docs index, settings/keybindings pages, and tagged release notes for
an explicitly linked official machine-readable schema. Do not execute guessed CLI
switches. An announced artifact is added to the fact-source policy and compared
before it becomes authoritative; the manifest and fact model make that a source
change rather than a complete rewrite.
