# Overview

> **Entry type:** Orientation
> **Status:** Production pipeline implemented and live-tested
> **Related:** [`sources.md`](sources.md) · [`pipeline.md`](pipeline.md) · [`decisions.md`](decisions.md)

## What this is

**claude-code-schema** is a self-hosted generator for a machine-readable,
versioned description of selected Claude Code configuration interfaces:
`settings.json`, environment variables, CLI flags, and keybindings. It does not
claim to cover every Claude Code product interface, but it does cover hooks and
policy helpers where they are embedded in settings, plus distinct global and
Desktop-managed configuration surfaces.

It is keyed on an actual npm release, uses official docs as the public-interface
authority, derives validation from expanded first-party pages and tagged examples,
uses the exact verified binary for bounded help/doctor validation and candidate
discovery, and records source and artifact digests so every run is auditable.

## The problem it solves

A landscape survey (see [`decisions.md`](decisions.md) → D-9) found a durable gap:

- **Machine-readable but narrow.** [SchemaStore](https://www.schemastore.org/)
  maintains settings and keybindings JSON Schemas, but it does not provide an
  enumerated environment catalog or scoped CLI option catalog.
- **Broad but not machine-readable.** Community guides enumerate many environment
  variables and flags as prose, but not as release-indexed, validatable artifacts.
- **No release-synchronous automation.** Existing schemas and guides are maintained
  periodically rather than generated and semantically diffed for every release.

SchemaStore is useful and endorsed from the official docs, but the docs explicitly
warn that its settings schema may not include the newest fields. Its settings schema
also permits unknown properties, which favors compatibility over completeness.

## Why it exists

Nobody provides an **auto-generated, versioned, broad-coverage** artifact set. This
project therefore:

- **Owns the unserved axes** — documented environment variables, scoped CLI option
  metadata, and documented keybinding defaults.
- **Owns the automation** — source snapshots, semantic release diffs, validation
  gates, provenance, and atomic publication.
- **Reconstructs independently** — official examples and specialized pages supply
  structure, while the release binary independently corroborates settings types,
  enums, command bindings, CLI structure, and candidates.
- **Keeps discoveries honest** — binary-only identifiers remain candidates until an
  authoritative source classifies them.

### Relationship to upstream

SchemaStore remains a useful community artifact and development benchmark. It is not
a generation source: an old capability is preserved only when current first-party
evidence supports it, or explicitly classified as moved, retired, different-surface,
or unverified.

### Pivot plan

If Anthropic publishes an official machine-readable schema or explicitly documented
self-description endpoint, this project pivots to a validator/differ over that
artifact. The fact-level source model makes that a source-policy change rather than
a rewrite. See [`pipeline.md`](pipeline.md) → “Pivot readiness.”

## Goals

- One command or scheduled job regenerates the artifact set for a given Claude Code
  version without depending on a local installation and with only bounded,
  integrity-verified binary operations.
- Output is grouped by interface and indexed by a user-facing **catalog** plus an
  audit **manifest**. The optional combined schema is explicitly a tooling envelope
  and never presented as a document Claude consumes.
- Green candidates become reviewed PRs; publication occurs after protected-environment
  approval, while failures leave the last-good artifact untouched.
- Every fact can retain evidence for existence, type, description, defaults, enums,
  and version bounds.

## Non-goals

- Not a runtime library or Claude Code wrapper; it produces data.
- Not a redistribution of the Claude Code binary, raw strings, or official-doc prose.
- Not claiming Anthropic affiliation or endorsement.
- Not labeling binary-only identifiers as public or internal without evidence.

## Primary consumer

The project originated as an upstream input for
[Orpheus](https://github.com/amitray007/orpheus), but the artifacts are designed for
any tool that wraps, validates, or configures Claude Code.
