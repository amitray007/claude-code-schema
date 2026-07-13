# Pipeline

> **Entry type:** Design
> **Status:** Corrected after the pre-spec audit (see [`decisions.md`](decisions.md))
> **Related:** [`sources.md`](sources.md) · [`schema-format.md`](schema-format.md)

How the sources in [`sources.md`](sources.md) combine into a versioned schema,
unattended, without ever shipping a bad artifact.

## Flow

```
  ┌─ TRIGGER ────────────────────────────────────────────────┐
  │  npm /latest version changes  →  run for that version     │
  └───────────────────────────────────────────────────────────┘
                              │
  ┌─ EXTRACT (parallel, hermetic) ───────────────────────────┐
  │  A  platform tarball  → flags, enums, env superset        │
  │  B  docs .md          → settings.json keys + prose        │
  │  D  CHANGELOG         → "what changed" identifiers        │
  │  E  SchemaStore       → settings key types                │
  └───────────────────────────────────────────────────────────┘
                              │
  ┌─ RECONCILE (per-field provenance — NOT "docs win") ──────┐
  │  merge by field; tag every field with x-source /          │
  │  x-corroborated / x-undocumented / x-internal             │
  └───────────────────────────────────────────────────────────┘
                              │
  ┌─ VALIDATION GATE (all must pass) ────────────────────────┐
  │  1 draft-07 compiles   2 real-config corpus: 0 false-neg  │
  │  3 CHANGELOG delta ok  4 count floors hold                │
  └───────────────────────────────────────────────────────────┘
                    │ green                    │ any red
                    ▼                          ▼
        emit + auto-merge PR        open an issue, KEEP last-good
        (tag git with version)      (never overwrite the artifact)
```

## Reconciliation — per-field provenance, not a global winner

The earlier "docs win on conflict" rule was **backwards** for the freshest data and
is replaced by a **per-field** policy (see [`decisions.md`](decisions.md), D-2):

| Field | Authority | Why |
| --- | --- | --- |
| Flag / env **existence** & **enum literals** | **Binary wins** | The binary is the shipped truth; docs lag by days. Suppressing a real new flag defeats the project. |
| `settings.json` **key existence** | **Docs win** | Only source; binary can't yield them declaratively. |
| **Types** of settings keys | **SchemaStore**, then docs | Docs express types poorly; binary can't. |
| **Descriptions / deprecation / min-version** | **Docs win** | Binary has no prose. |

**Provenance tags on every field** (the single highest-value design decision):
- `x-source`: `"binary"` | `"docs"` | `"schemastore"` | `"changelog"`
- `x-undocumented`: `true` for a flag/env present in the binary but absent from docs
  — **included, not dropped** (it's the freshest signal the project exists to surface).
- `x-corroborated`: `false` for a docs key with no binary/SchemaStore backing.
- `x-internal`: `true` for env vars in the 402 superset that fail the user-facing
  filter (docs OR SchemaStore OR prefix-allowlist) — retained but marked, not published as user-facing.

## Validation gate — what makes auto-merge safe

Auto-merge is only defensible because emit is gated on **semantics, not a human**.
All four must pass before a PR is opened/merged:

1. **Schema compiles** — the emitted JSON Schema is itself valid draft-07 (`ajv compile`).
2. **Corpus validation** — a committed corpus of real-world `settings.json` files
   (harvested from public dotfiles + this project's own) validates with **zero false
   negatives**. A known-good config must never be rejected.
3. **CHANGELOG delta** — every identifier the CHANGELOG names as added/changed for
   this version is present in the emitted schema.
4. **Count floors** — flag/env/key counts may not collapse (e.g. `>20%` drop vs
   last release fails the run). This is the tripwire for a silent binary-extraction
   break (minifier/bytecode change).

**On any red:** open an issue with the diff, and **leave the last-good committed
schema untouched.** Fail-closed on output; fail-safe on the artifact. An empty or
half-parsed schema can never overwrite a good one.

## Safety constraints (carried from extraction)

- **Never shell out to guessed `claude` subcommands** — they parse as prompts and
  start a real session (see [`extraction-notes.md`](extraction-notes.md)). The
  pipeline does **not** execute the CLI at all; it reads the tarball.
- **Never redistribute the binary** or large verbatim strings — emit distilled facts
  only; filter out any binary-sourced description prose over a length threshold.

## Versioning model

- **`latest/`** holds the current 5-file set at HEAD.
- **git tags** (`v<claude-code-version>`) let consumers pin:
  `raw.githubusercontent.com/<repo>/v2.1.207/latest/settings.schema.json`.
- A small `versions.json` maps `<version> → git sha`.
- **No** directory-per-version (459+ near-duplicate dirs → a duplication/noise
  nightmare). History + tags are the version store.

## Pivot readiness

If Anthropic ships an official full schema or `--dump-schema`, the reconcile step
gains one authoritative source and the project **degrades to a thin validator/differ**
over it. Because reconciliation is already source-tagged and per-field, adding
"official" as the top-authority source is a config change, not a rewrite.
