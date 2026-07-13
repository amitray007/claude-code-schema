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

A landscape survey (see [`decisions.md`](decisions.md) → D-9) found the ecosystem
splits into two camps that **never overlap** — that gap is what justifies this project:

- **Machine-readable but narrow.** [SchemaStore](https://www.schemastore.org/) maintains
  **two** real, per-release JSON Schemas —
  [`claude-code-settings.json`](https://json.schemastore.org/claude-code-settings.json)
  **and** `claude-code-keybindings.json`. But `env` is modeled as an **opaque object**
  (0 of ~200 env vars enumerated), and **CLI flags are entirely absent**. Hand-synced
  by one volunteer (~weekly).
- **Broad but not machine-readable.** [`claude-code-ultimate-guide`](https://github.com/FlorianBruniaux/claude-code-ultimate-guide)
  (5.4k★) enumerates ~190 env vars + flags — but as **prose + an LLM line-index**, not
  a validatable schema.
- **No auto-generation anywhere.** Every existing schema is **hand-synced**. Claude Code
  releases ~daily; keeping up by hand does not scale. Anthropic publishes no official
  schema and closed both requests for one (#2783, #11795) **"not planned."**

## Why it exists (the honest justification)

Nobody provides an **auto-generated, versioned, broad-coverage** schema. So this
project's differentiated value is precise:

- **Owns the unserved axes** — **env-var + CLI-flag enumeration** as real machine-readable
  schemas. No project covers these today.
- **Owns the automation** — auto-generated and release-diffed on every release, which
  *nobody* does (all existing schemas are hand-synced).
- **Adopts, doesn't duplicate** — consumes SchemaStore's `settings` + `keybindings`
  schemas as the source of truth for those two dimensions (they're current + per-release),
  rather than regenerating them. See [`sources.md`](sources.md) and D-9.
- **More resilient** — no single-volunteer dependency for the axes it owns; the pipeline
  is the maintainer.

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
