# Overview

> **Entry type:** Orientation
> **Status:** Design / pre-implementation
> **Related:** [`sources.md`](sources.md) · [`pipeline.md`](pipeline.md) · [`decisions.md`](decisions.md)

## What this is

**Claude Schema Store** is a self-hosted, open-source generator that produces a
machine-readable, versioned schema of **Claude Code's entire configuration
surface** — settings.json keys, environment variables, CLI flags, and default
keybindings — and **regenerates it automatically on every
`@anthropic-ai/claude-code` release**.

It is keyed on the actual npm release, cross-checks the shipped binary against the
official docs, and stays current without a human noticing each release.

## The problem it solves

There is already a community schema — [SchemaStore's
`claude-code-settings.json`](https://json.schemastore.org/claude-code-settings.json).
It is useful but limited, and the limits are what justify this project:

1. **It lags.** Anthropic's own docs warn it *"may not include settings added in
   the most recent CLI releases."* Routine version-sync is done by **one outside
   volunteer** — bus-factor-1 on freshness. (See [`decisions.md`](decisions.md)
   for the full ownership investigation.)
2. **It's settings-only.** It models `settings.json` keys. It does **not** cover
   environment variables, CLI flags, or keybindings — dimensions that Claude Code
   exposes richly and that consumers (like [Orpheus](https://github.com/amitray007/orpheus))
   genuinely need.
3. **Claude Code releases ~daily.** Keeping up by hand does not scale.

## Why it exists (the honest justification)

SchemaStore is **community-hosted, Anthropic-endorsed, but not Anthropic-maintained
or release-synced.** So this project is:

- **Fresher** — auto-regenerated on every release, not on a volunteer's manual cadence.
- **Broader** — a *superset*: settings **+ env vars + flags + keybindings**. The
  non-settings dimensions have **no upstream home** today.
- **More resilient** — no single-volunteer dependency; the pipeline is the maintainer.

### Relationship to upstream

We are not trying to replace or fork SchemaStore antagonistically. Where a settings
fix belongs upstream, contribute it to SchemaStore. This project owns the
**freshness + the broader coverage** that SchemaStore structurally does not provide.

### Pivot plan (designed-in, not an afterthought)

Anthropic *could* ship an official machine-readable schema (there's an open request,
[issue #11795](https://github.com/anthropics/claude-code/issues/11795), closed
"not planned") or a `--dump-schema` command any day. If that happens, this project
**pivots to a thin validator/differ** over the official artifact rather than a
generator. The architecture is designed so that pivot is cheap (see
[`pipeline.md`](pipeline.md) → "Pivot readiness").

## Goals

- One command / one scheduled job regenerates the full schema for a given Claude
  Code version, hermetically (no CLI execution, no local install dependency).
- Output is both **granular** (per-category files) and **combined** (one index) —
  see [`schema-format.md`](schema-format.md).
- **Auto-maintains itself**: a release trigger → regenerate → validate → auto-merge
  or open-an-issue. No human in the routine loop, but a bad parse can never ship.
- Every field carries **provenance** so consumers can see where each fact came from
  and how well corroborated it is.

## Non-goals

- Not a runtime library or a Claude Code wrapper — it produces *data*, nothing more.
- Not a redistribution of the Claude Code binary or large verbatim strings from it —
  only distilled, factual schema data.
- Not claiming Anthropic affiliation or endorsement. Descriptive naming +
  "not affiliated with Anthropic" disclaimer.
- Not attempting to extract *types* the binary doesn't expose declaratively — those
  come from docs/SchemaStore, with provenance tags marking the difference.

## Primary consumer

Originated as the upstream that feeds [Orpheus](https://github.com/amitray007/orpheus)'s
settings system (which turns this schema into a settings manifest → generated UI +
launch composition). But the output is designed to be consumable by **anyone**
wrapping or configuring Claude Code.
