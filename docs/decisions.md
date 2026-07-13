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
  `~/.local` binary is the _native-installer_ output — a different provenance CI
  won't have.
- **Changed to:** derive the platform matrix from the wrapper's
  `optionalDependencies`, fetch an exact platform `dist.tarball` (or use
  script-disabled `npm pack`), verify `dist.integrity`, then inspect statically in
  an ephemeral directory. No execution or local-install dependency.
- **Why it's better:** hermetic, reproducible, cross-platform-selectable, and safer
  than the original (no postinstall, no CLI run). The blocker turned into a cleaner path.

## D-2 · Public status comes from docs; binary strings are candidates

- **Initially thought:** on any conflict, docs win.
- **First audit concluded:** binary wins for flag/env existence because it is the
  shipped artifact.
- **2026-07-13 audit corrected that:** string presence proves existence in the
  artifact, not public support or ownership. It can be internal, dead, experimental,
  dependency-owned, or scoped to a subcommand/platform. Absence from docs also does
  not prove `internal`.
- **Changed to:** official docs establish public status/prose; first-party examples,
  specialized pages, and exact-binary validation supply structure; scoped static
  extraction supplies corroboration and undocumented candidates. Provenance is per
  fact (existence/type/prose/default), not one `x-source` scalar.
- **Why:** preserves fresh discoveries without misrepresenting them as supported API.

## D-3 · Auto-merge is gated on validation, not a human

- **Initially thought:** trigger → regenerate → open PR/commit.
- **Audit found:** no acceptance criteria = a bad parse ships a broken schema; but a
  human gate reintroduces the exact lag this project exists to kill.
- **First audit chose:** schema compilation, a positive real-config corpus,
  changelog identifier satisfaction, and count floors.
- **2026-07-13 audit corrected that:** `additionalProperties: true` makes a
  positive-only corpus weak; raw changelog backticks are untyped; count floors miss
  false additions and bad types.
- **Changed to:** source integrity/structure, schema compilation, positive and
  negative fixtures, mutation tests, catalog invariants, semantic release diffs,
  cross-source drift checks, and manifest digest verification. Green may auto-merge;
  unexplained drift or any failure keeps last-good.

## D-4 · SchemaStore is MIXED (community-hosted, Anthropic-endorsed, not maintained)

- **Question:** two research passes disagreed — is SchemaStore's
  `claude-code-settings.json` Anthropic-official or community-maintained?
- **Primary-evidence verdict: MIXED.**
  - Lives in the community `SchemaStore/schemastore` repo; originally added by an
    outside contributor (`wagerfield`, PR #4798).
  - Routine version-sync work has often depended on outside volunteer contributions,
    so freshness is not coupled to every Claude Code release.
  - Anthropic staff **do** contribute occasionally (`kurt@anthropic.com`,
    `adamj+git@anthropic.com` adding fields) — so not purely third-party.
  - Anthropic docs call it "the official JSON schema" (endorsement) but **warn it
    may lag recent releases** — i.e. they don't control its cadence.
  - Issue #11795 (asking Anthropic to own/link it) was closed **"not planned."**
- **Consequence for design:** this project is justified as a **fresher + broader**
  (env/flags/keybindings) alternative, contributing settings fixes upstream where
  useful, with a pivot plan if Anthropic ever ships an official full schema. See
  [`overview.md`](overview.md).

## D-5 · Output shape: validators, catalogs, and a manifest

- **Initially chosen:** make every dimension a JSON Schema and `$ref` them from a
  combined schema.
- **Audit found:** flags are not JSON instances, defaults are behavior rather than a
  user-file shape, and composing all dimensions describes an invented document.
- **Changed to:** JSON Schemas for settings, keybindings, and the declared env-object
  projection; catalogs for flags and defaults; `manifest.json` as the index.

## D-6 · Versioning: `latest/` + git tags, not directory-per-version

- **Chosen:** one `latest/` set at HEAD; git tags `v<version>` for pinning; a version
  index containing tag/ref plus manifest digest. No per-version directories.
- **Correction:** a file in a commit cannot reliably contain that commit's own SHA;
  doing so changes the SHA. Use the tag and content digest or an external post-commit
  registry.
- **Why:** ~daily releases → 459+ near-duplicate dirs would be a duplication/noise
  nightmare. History + tags give reproducible pinning for free.

## D-7 · Naming & affiliation

- **Chosen:** directory/repo `claudeschema`; human-facing title "Claude Schema Store".
  Descriptive naming, explicit "not affiliated with Anthropic" disclaimer.
- **Why:** trademark caution; avoid implying official endorsement.
- **Open:** final repo/package name — see [`open-questions.md`](open-questions.md).

## D-8 · Legal posture: distill facts, never redistribute the binary

- **Chosen:** emit only distilled facts and source evidence. Never redistribute the
  binary, raw string dumps, or binary-sourced prose. Static extraction happens in
  an ephemeral directory and publishes only classified candidate identifiers/diffs.
- **Why:** factual/interoperability data is defensible; wholesale binary content is not.

## D-9 · Landscape check: build, but adopt SchemaStore for settings + keybindings

> Historical decision, superseded by D-17 after the Version 4 experiment.

- **Question:** is anyone already maintaining such a schema? (build vs adopt vs contribute)
- **Research verdict:** the ecosystem splits into two camps, leaving a real gap:
  - **Machine-readable but narrow:** SchemaStore maintains settings and keybindings
    JSON Schemas, but no release-indexed environment or scoped CLI option catalog.
  - **Broad but not machine-readable:** community guides enumerate environment
    variables and flags as prose or indexes rather than validatable artifacts.
  - Other projects found were deprecated, archived, or adjacent; no existing project
    combines broad coverage with release-synchronous generation and semantic diffs.
- **Verdict: BUILD is still justified — nobody does auto-generated, broad-coverage,
  versioned. But SCOPE SHIFTS to adopt + own-the-gap:**
  - **Adopt** SchemaStore as the structured validation basis for settings and
    keybindings instead of rebuilding its type constraints from scratch. Official
    docs still establish public status, defaults, and docs-only drift.
  - **Own** the genuinely unserved axes: **env-var enumeration + CLI-flag enumeration**
    as public docs-backed catalogs, with static binary analysis supplying a separate
    candidate-discovery feed.
  - **Own** the **automation** — auto-generate/diff on every release — which _nobody_
    does (all existing schemas are hand-synced).
- **Optional upstream contribution:** enrich SchemaStore's opaque `env` object into an
  enumerated map. But SchemaStore is JSON-Schema-scoped + hand-synced, so it won't host
  CLI flags or an auto-pipeline — the niche is durable.
- **Note:** this is exactly what Orpheus's `audit-claude-env-vars` + `env-vars.json`
  snapshot already prototypes internally — we are productizing the one artifact no
  public project maintains.

## D-10 · Mutable docs require content-addressed evidence

- **Found:** official markdown endpoints are live and not version-addressed. Version
  markers are helpful but not a complete historical record.
- **Chosen:** record requested/resolved URLs, raw-byte SHA-256, byte count, and parser
  version; archive exact source bytes or a content-addressed snapshot if historical
  reproducibility is promised.
- **Consequence:** rebuilding an old Claude Code version from today's docs is a new
  observation unless the original source snapshot is available.

## D-11 · Changelog is a hint, not a raw identifier gate

- **Found:** backticks contain settings, env vars, flags, paths, commands, examples,
  and names involved in additions, removals, and fixes.
- **Chosen:** only confidence-scored, typed change claims can assert completeness.
  The semantic artifact diff is the primary change record.

## D-12 · Compatibility and completeness are different products

- **Found:** SchemaStore's settings schema permits unknown properties, which avoids
  false negatives but cannot prove the setting catalog is complete.
- **Chosen:** keep a permissive compatibility validator and evaluate completeness in
  the fact catalog/drift gate. Any future strict validator is an explicit opt-in
  artifact.

## D-13 · The experiment uses Node before the final implementation decision

> Superseded by D-18. This records why Node was used for the proofs.

- **Chosen:** the proof uses dependency-light Node ESM plus Ajv because the inputs
  and outputs are JSON-heavy and Node has native fetch.
- **Why:** it validates the source and artifact design before committing to the full
  generator architecture. The final language decision remains open if production
  requirements reveal a better fit.

## D-14 · Distinguish factual extraction from prose redistribution

- **Found:** SchemaStore declares Apache-2.0, while the collected official docs do
  not present an equivalent open-content license for wholesale redistribution.
- **Chosen:** the public experiment emits identifiers, defaults, version markers,
  source links, and evidence digests without copying full official-doc descriptions.
  SchemaStore-derived artifacts require the upstream license and attribution in any
  public distribution.
- **Note:** this is a conservative engineering posture, not legal advice; resolve
  with counsel or explicit permission before publishing a prose-rich artifact.

## D-15 · Keep source-strategy experiments versioned and comparable

> The Version 2 conclusion below was superseded by Version 4 (D-17); it remains as
> the record of why docs-table-only extraction was insufficient.

- **Question:** can official Claude Code docs replace SchemaStore as the structured
  source for settings and keybindings?
- **Experiment:** retain the original official-docs-plus-SchemaStore proof as
  `experiments/version-1/`, and run an isolated official-docs-only proof as
  `experiments/version-2/`.
- **Result for Claude Code 2.1.207:** docs alone enumerate 117 settings rows, but 116
  top-level properties have no verified value type. Docs reconstruct 101 unique
  keybinding actions versus 114 in the SchemaStore-backed schema, and do not fully
  specify keystroke or command-binding object grammar.
- **Decision:** keep SchemaStore as the structured validation basis unless a more
  authoritative machine-readable source appears. Use official docs for public-name
  catalogs and drift evidence. Preserve future source experiments under monotonically
  numbered `experiments/version-<N>/` directories so results remain reproducible.

## D-16 · Independent binary probing is bounded evidence, not schema authority

- **Question:** if SchemaStore is excluded, should the released Claude Code binary
  and release notes become additional first-class sources?
- **Experiment:** version 3 verifies the exact host platform package against npm
  integrity, inspects static strings, and executes only `--version` plus recursively
  discovered `--help` paths in an isolated temporary home. It also parses the
  matching-tag changelog and GitHub release metadata into reviewable hints.
- **Decision:** use help probing as strong evidence for command paths, option names,
  arity, aliases, choices, and displayed defaults. Treat static strings as candidate
  presence only. Release-note bullets remain deterministic review hints and require
  human review; they never mutate published artifacts without stronger structured
  evidence and validation gates. AI is not required or used by production.
- **Limitation:** neither static strings nor help output reconstructs complete
  settings types and nested validation rules. The independent settings artifact must
  remain explicitly partial until those constraints are proven from a first-party
  machine-readable source or a maintained independent model.

## D-17 · Version 4 replaces SchemaStore generation with a first-party evidence stack

- **Question:** can the project preserve everything useful in the SchemaStore-backed
  experiment without using SchemaStore as a source?
- **Finding:** the main settings table alone cannot, but the broader first-party
  surface can. JSON examples establish value shapes; specialized settings, hooks,
  status-line, plugins, Desktop, sandbox, auto-mode, voice, managed-MCP, and
  monitoring pages establish nested semantics and scope; tag-pinned Anthropic
  examples add release-specific configurations; and `claude doctor` from the exact
  verified binary independently reports top-level types and enums.
- **Decision:** Version 4 uses that stack and emits separate settings, global-config,
  and Desktop-policy schemas. Dotted settings become nested paths. Compatibility
  objects remain open unless a first-party source proves closure.
- **Keybinding correction:** the exact binary contains the `command:` validator and
  its pattern. V1-only action tokens that remain in the binary but not current docs
  are candidates, not public actions. `doctor:fix` is explicitly retired after
  2.1.204.
- **Parity policy:** Version 1 is read only by a post-generation development gate.
  Every old field/action must be active, moved, on a different surface, retired, or
  explicitly unverified. It can never inject a Version 4 schema fact.
- **Why this is better than keyword-count parity:** stale fields are not preserved as
  active merely to match SchemaStore, while current first-party-only fields and
  scopes are represented. Accuracy and conservative compatibility take precedence
  over copying a community schema's format or raw constraint counts.

## D-18 · Production is deterministic TypeScript on Node

- **Decision:** implement the production CLI in TypeScript on Node 24, with Ajv for
  draft-07 compilation and behavioral validation.
- **Reason:** the system is JSON- and HTTP-heavy, the four experiments already
  established the source behavior in Node, and shared types make artifact contracts
  testable without introducing a second runtime.
- **AI policy:** no AI participates in extraction, reconciliation, validation,
  release discovery, issue creation, or publication. Ambiguous changelog prose is a
  human-review hint and cannot change generated facts.

## D-19 · A combined schema is an explicit tooling envelope

- **Decision:** emit `claude-code.schema.json` with required `settings`,
  `globalConfig`, `desktopManagedSettings`, `environment`, and `keybindings`
  properties, each using a relative reference to its standalone schema.
- **Boundary:** this object is never presented as a file Claude Code consumes. CLI
  catalogs, behavioral defaults, evidence catalogs, and the manifest are excluded
  because they are not configuration instances.

## D-20 · Releases are discovered automatically and published only after review

- **Decision:** check npm daily, create one idempotent issue per unseen version,
  perform deterministic analysis in a read-only job, and retain the candidate as a
  workflow artifact. A maintainer manually selects reviewed bytes for a draft PR.
- **Publication:** after merge, revalidate the committed bytes, create a versioned
  GitHub Release with checksums and provenance, and deploy consumer schemas to
  GitHub Pages. The protected `production` environment is the final approval gate.
- **Identity:** versioned URLs are canonical. Mutable `latest` copies retain their
  immutable versioned `$id` values.
