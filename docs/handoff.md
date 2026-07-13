# Implementation Handoff

> **Entry type:** Handoff brief for the implementing agent
> **Status:** Ready to pick up
> **Read first:** [`overview.md`](overview.md) → [`sources.md`](sources.md) → [`pipeline.md`](pipeline.md) → [`schema-format.md`](schema-format.md) → [`decisions.md`](decisions.md) → [`open-questions.md`](open-questions.md)

You are picking up **Claude Schema Store** at the pre-implementation stage. The
design is done, audited, and corrected. Your job is to **build the generator**. This
brief is self-contained: everything you need is in this repo's `docs/`. Do not assume
access to any prior conversation.

---

## 1. What you are building (in one paragraph)

A self-hosted, open-source tool + GitHub Action that, on every
`@anthropic-ai/claude-code` npm release, regenerates a **machine-readable, versioned
schema of Claude Code's config surface** — settings.json keys, env vars, CLI flags,
keybindings — by extracting from the shipped per-platform binary tarball and the
official docs, reconciling with per-field provenance, validating against real
configs, and auto-merging only if all gates pass. Output: per-category schema files +
one combined index. Full rationale in [`overview.md`](overview.md).

## 2. Non-negotiable constraints (read before writing code)

1. **Hermetic extraction, no CLI execution.** Pull
   `@anthropic-ai/claude-code-<os>-<arch>` via `npm pack` / `dist.tarball`, untar,
   `strings` the binary. **Never run the `claude` CLI** — guessed subcommands parse
   as prompts and start real agent sessions ([`extraction-notes.md`](extraction-notes.md)).
   If you ever must, only `--help`/`--version`, with timeout + stdin closed.
2. **Never overwrite the last-good artifact with a failed/partial parse.** Emit is
   fail-closed; the committed schema is fail-safe ([`pipeline.md`](pipeline.md)).
3. **Per-field provenance, not "docs win."** Binary wins for flag/env existence +
   enums; docs win for settings-key existence + prose; SchemaStore for types. Tag
   every field ([`decisions.md`](decisions.md) → D-2).
4. **Never redistribute the binary or large verbatim strings.** Distilled facts only
   ([`decisions.md`](decisions.md) → D-8).
5. **Count-floor assertions are mandatory.** A silent extraction break (minifier/
   bytecode change) must fail loudly, never emit empty.

## 3. Suggested build order (independent, testable units)

Each unit is independently verifiable. Build and test in this order; earlier units
have no dependency on later ones.

| # | Unit | Deliverable | Acceptance check |
| --- | --- | --- | --- |
| 1 | **Platform-matrix + tarball fetch** | Read wrapper `optionalDependencies`; `npm pack` the canonical platform (linux-x64) for a given version; untar to a temp dir. | For `2.1.207`, downloads + unpacks the binary hermetically; no CLI run; platform list derived, not hardcoded. |
| 2 | **Binary extractor** | From the unpacked binary: flags (Commander `.option`), enum arrays, `CLAUDE_CODE_*`/`ANTHROPIC_*` env superset. | Reproduces the known v2.1.207 numbers (~146 flags, ~402 env) and the permission-mode enum exactly ([`extraction-notes.md`](extraction-notes.md)). |
| 3 | **Docs parser** | Fetch + parse `settings.md` / `env-vars.md` / `cli-reference.md` pipe tables (capture `{/* min-version */}`); fetch `llms.txt` as a structure canary. | Parses current docs into records; a malformed/empty table is a hard error, not silent zero. |
| 4 | **CHANGELOG + SchemaStore fetchers** | Parse `## <version>` bullets for identifiers; fetch + JSON-diff SchemaStore (follow redirect). | Extracts the named identifiers for a version; SchemaStore fetched despite cross-host redirect. |
| 5 | **Reconciler** | Merge all sources into one model with per-field `x-source`/`x-undocumented`/`x-corroborated`/`x-internal` tags per D-2. | Given fixtures, a binary-only flag is included + tagged `x-undocumented`; an internal env var is tagged `x-internal`, not published as public. |
| 6 | **Emitter** | Write `settings/env/flags/keybindings.schema.json` + combined `claude-code.schema.json` (`$ref`), each with `x-claude-code-version`. Format in [`schema-format.md`](schema-format.md). | Emitted files are valid draft-07; combined index `$ref`s resolve. |
| 7 | **Validation gate** | (a) ajv-compile, (b) real-config corpus zero-false-negatives, (c) CHANGELOG-delta satisfied, (d) count floors. | A deliberately broken extraction (e.g. 0 flags) fails the gate; a good run passes all four. |
| 8 | **Orchestrator + GitHub Action** | Cron polls npm `/latest`; on new version runs 1–7; green → open/merge PR + git-tag `v<version>`; red → open an issue, keep last-good. | Dry-run against `2.1.207` produces the full 5-file set + a `v2.1.207` tag; a forced-failure run opens an issue and leaves `latest/` untouched. |

## 4. Repo layout (proposed)

```
/                      generator source (language TBD — see below)
/latest/               the 5 emitted schema files at HEAD
/corpus/               real settings.json files for the validation gate (Q-3)
/.github/workflows/    the release-triggered regeneration action
/versions.json         { "<version>": "<git-sha>" } pin index
/docs/                 this knowledge base
```

## 5. Language / tooling note

Not yet decided. The extraction is shell-heavy (`strings`, `grep`, `tar`), the
reconciliation/validation is JSON-heavy (ajv). A Node/TypeScript generator with
`ajv` for validation is the natural default (matches the JSON-Schema domain and the
Orpheus consumer), but this is your call — record it in [`decisions.md`](decisions.md).

## 6. Resolve these before/while building (see [`open-questions.md`](open-questions.md))

- **Q-1** final name · **Q-2** license · **Q-3** where the validation corpus comes
  from (blocks Unit 7) · **Q-4** canonical platform + variance cadence · **Q-7** the
  bytecode-break fallback · **Q-8** how the official-schema pivot is detected.

Q-3 is the one that actually blocks a unit — resolve it before Unit 7.

## 7. Definition of done (v1)

- A scheduled run detects a new Claude Code release and regenerates all five schema
  files, tagged to that version, **fully unattended**, with the validation gate
  green — and a forced-failure run proves the fail-safe (issue opened, artifact
  untouched).
- The emitted schemas validate a corpus of real `settings.json` files with zero
  false negatives.
- README + docs updated to reflect the built reality; license + name finalized.

## 8. What is explicitly OUT of scope for v1

- The Orpheus-side consumer (manifest → generated UI). Separate project ([`open-questions.md`](open-questions.md) → Q-6).
- The full official-schema pivot implementation (design for it; don't build it yet).
- Per-version directories (use `latest/` + tags — [`decisions.md`](decisions.md) → D-6).
