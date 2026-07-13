# Decision Log

> **Entry type:** Rationale / audit trail
> **Status:** Living
> **Related:** all other entries

What was chosen and **why** — including the places an initial conclusion was wrong
and got corrected by the pre-spec audit. The corrections are the point: they keep the
knowledge base honest.

---

## D-1 · Extraction target: per-platform npm tarball, not the main package

- **Initially thought:** the Claude Code Bun binary ships as the main
  `@anthropic-ai/claude-code` npm package; `strings` the installed
  `~/.local/share/claude/versions/<ver>` binary.
- **Audit found:** the main npm package is a ~157 KB **JS wrapper**; the 230 MB Bun
  binary moved to **per-platform optional dependencies**
  (`@anthropic-ai/claude-code-<os>-<arch>`, 8 of them) around v2.1.113. The
  `~/.local` binary is the *native-installer* output — a different provenance CI
  won't have.
- **Changed to:** pull the **platform tarball** hermetically in CI
  (`npm pack @anthropic-ai/claude-code-<os>-<arch>@<ver>` → untar → `strings`). No
  execution, no local-install dependency. The wrapper's `optionalDependencies` map
  is the authoritative platform matrix.
- **Why it's better:** hermetic, reproducible, cross-platform-selectable, and safer
  than the original (no postinstall, no CLI run). The blocker turned into a cleaner path.

## D-2 · Reconciliation: per-field provenance, not "docs win globally"

- **Initially thought:** on any conflict, docs win.
- **Audit found:** backwards for the freshest data. The binary is the shipped truth;
  docs lag by days. "Docs win" would suppress a real, newly-shipped flag — defeating
  the whole "regenerate every release" premise.
- **Changed to:** per-field authority — binary wins for flag/env existence + enum
  literals; docs win for settings-key existence + prose; SchemaStore wins for types.
  Every field tagged with `x-source` / `x-undocumented` / `x-corroborated` /
  `x-internal`. See [`pipeline.md`](pipeline.md).
- **Why:** turns every conflict into auditable data instead of a lossy global rule.

## D-3 · Auto-merge is gated on validation, not a human

- **Initially thought:** trigger → regenerate → open PR/commit.
- **Audit found:** no acceptance criteria = a bad parse ships a broken schema; but a
  human gate reintroduces the exact lag this project exists to kill.
- **Changed to:** gate emit on four automated checks — (1) draft-07 compiles, (2) a
  committed corpus of real `settings.json` validates with zero false negatives, (3)
  CHANGELOG delta is satisfied, (4) count-floor assertions hold. Green → auto-merge;
  any red → open an issue and keep the last-good artifact.
- **Why:** makes hands-off auto-merge *safe* — the schema can never silently degrade.

## D-4 · SchemaStore is MIXED (community-hosted, Anthropic-endorsed, not maintained)

- **Question:** two research passes disagreed — is SchemaStore's
  `claude-code-settings.json` Anthropic-official or community-maintained?
- **Primary-evidence verdict: MIXED.**
  - Lives in the community `SchemaStore/schemastore` repo; originally added by an
    outside contributor (`wagerfield`, PR #4798).
  - Routine "sync to vX" work is **one outside volunteer** (`@miteshashar`, 14 of 37
    commits) — bus-factor-1 on freshness.
  - Anthropic staff **do** contribute occasionally (`kurt@anthropic.com`,
    `adamj+git@anthropic.com` adding fields) — so not purely third-party.
  - Anthropic docs call it "the official JSON schema" (endorsement) but **warn it
    may lag recent releases** — i.e. they don't control its cadence.
  - Issue #11795 (asking Anthropic to own/link it) was closed **"not planned."**
- **Consequence for design:** this project is justified as a **fresher + broader**
  (env/flags/keybindings) alternative, contributing settings fixes upstream where
  useful, with a pivot plan if Anthropic ever ships an official full schema. See
  [`overview.md`](overview.md).

## D-5 · Output shape: per-category files **and** a combined index

- **Chosen:** emit `settings` / `env` / `flags` / `keybindings` separately **and** a
  combined `claude-code.schema.json` that `$ref`s them.
- **Why:** granular consumers take one dimension; whole-surface consumers take the
  index. Per-category split is also how the "superset" coverage (vs settings-only
  SchemaStore) is expressed.

## D-6 · Versioning: `latest/` + git tags, not directory-per-version

- **Chosen:** one `latest/` set at HEAD; git tags `v<version>` for pinning; a
  `versions.json` index. No per-version directories.
- **Why:** ~daily releases → 459+ near-duplicate dirs would be a duplication/noise
  nightmare. History + tags give reproducible pinning for free.

## D-7 · Naming & affiliation

- **Chosen:** directory/repo `claudeschema`; human-facing title "Claude Schema Store".
  Descriptive naming, explicit "not affiliated with Anthropic" disclaimer.
- **Why:** trademark caution; avoid implying official endorsement.
- **Open:** final repo/package name — see [`open-questions.md`](open-questions.md).

## D-8 · Legal posture: distill facts, never redistribute the binary

- **Chosen:** emit only distilled schema facts (flag names, enum values, key names).
  Never redistribute the binary or large verbatim string dumps; filter binary-sourced
  prose over a length threshold.
- **Why:** factual/interoperability data is defensible; wholesale binary content is not.

## D-9 · Landscape check: build, but adopt SchemaStore for settings + keybindings

- **Question:** is anyone already maintaining such a schema? (build vs adopt vs contribute)
- **Research verdict (with citations):** the ecosystem splits into two camps that
  never overlap, leaving a real gap:
  - **Machine-readable but narrow:** SchemaStore maintains **two** real, per-release
    JSON Schemas — `claude-code-settings.json` **and** `claude-code-keybindings.json`
    (synced ~weekly by @miteshashar; less laggy than first assumed). But `env` is an
    **opaque object** (0 of ~200 env vars enumerated) and **CLI flags are absent**.
  - **Broad but not machine-readable:** `FlorianBruniaux/claude-code-ultimate-guide`
    (5.4k★, very active) enumerates ~190 env vars + flags — but as **prose + an LLM
    line-index**, not a validatable schema.
  - Everything else is **dead or adjacent**: `spences10/claude-code-settings-schema`
    self-deprecated *pointing to SchemaStore*; `hesreallyhim/claude-code-json-schema`
    archived (plugin manifests). No `@types/claude-code`. Anthropic closed both
    official-schema requests (#2783, #11795) **"not planned."**
- **Verdict: BUILD is still justified — nobody does auto-generated, broad-coverage,
  versioned. But SCOPE SHIFTS to adopt + own-the-gap:**
  - **Adopt** SchemaStore's `settings` + `keybindings` schemas as the source of truth
    for those two dimensions — they're current and per-release. Do **not** regenerate
    them from scratch. (This revises D-2/D-5: for settings + keybindings, SchemaStore
    is now the *primary* source, not a lagging corroboration.)
  - **Own** the genuinely unserved axes: **env-var enumeration + CLI-flag enumeration**
    (from the binary, per [`sources.md`](sources.md) Source A) — no schema anywhere
    covers these.
  - **Own** the **automation** — auto-generate/diff on every release — which *nobody*
    does (all existing schemas are hand-synced).
- **Optional upstream contribution:** enrich SchemaStore's opaque `env` object into an
  enumerated map. But SchemaStore is JSON-Schema-scoped + hand-synced, so it won't host
  CLI flags or an auto-pipeline — the niche is durable.
- **Note:** this is exactly what Orpheus's `audit-claude-env-vars` + `env-vars.json`
  snapshot already prototypes internally — we are productizing the one artifact no
  public project maintains.
