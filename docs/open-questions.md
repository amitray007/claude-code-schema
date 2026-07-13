# Open Questions

> **Entry type:** Unresolved decisions
> **Status:** Living — remaining integration and upstream-policy decisions
> **Related:** [`decisions.md`](decisions.md) · [`handoff.md`](handoff.md)

Calls that are not yet made. Each notes who/what it blocks.

## Q-1 · Final repo / package name — RESOLVED

- **Decision:** public project name is `claude-code-schema` (clearest,
  trademark-safe); the local repo dir stays `claudeschema` as a short alias.
- Alternatives considered: `claudeschemastore`, `claudestore`.

## Q-2 · License — RESOLVED

- **Decision:** MIT (see [`LICENSE`](../LICENSE)). Chosen for simplicity;
  Apache-2.0's patent grant was considered but MIT's minimalism won for a
  facts/interoperability project of this size.

## Q-5 · Upstream-contribution stance

- Version 4 no longer consumes SchemaStore. **Open:** whether independently found
  corrections should also be proposed upstream as a courtesy, without coupling this
  project's release cadence or source policy to their acceptance.

## Q-6 · Consumer integration (Orpheus side)

- This schema feeds Orpheus's settings manifest. That consumer work is a **separate
  project/spec** and is out of scope here.
- **Open:** the exact contract Orpheus consumes (which artifacts, pinned by tag or
  tracking latest, and how it uses fact-level provenance and confidence).

## Resolved by the 2026-07-13 audit

### Q-3 · Validation fixtures

- The gate (D-3) needs a committed corpus of real-world `settings.json` files that
  must validate with zero false negatives.
- **Decision:** use official and tag-pinned Anthropic examples plus curated synthetic
  boundary/mutation cases as the required
  gate. Opt-in, scrubbed real configs may supplement it, but the project will not
  scrape public dotfiles as a prerequisite. A positive-only corpus is insufficient,
  especially while the compatibility schema allows unknown properties.

### Q-4 · Per-OS binary cadence

- Flags/enums _should_ be identical across the 8 platform binaries, but platform-gated
  flags exist.
- **Decision:** public artifacts come from official docs, so platform binaries are
  not required for publication. Scan linux-x64 as the per-release discovery canary;
  scan one representative for Linux, macOS, and Windows on stable releases or
  weekly. Scan all packages only when the wrapper's platform matrix changes or a
  representative diff appears.

### Q-7 · Bytecode-compilation contingency

- If Anthropic enables Bun **bytecode** compilation, `strings`-based flag/env
  extraction silently breaks (the count-floor gate catches it, but yields nothing).
- **Decision:** continue publishing the docs-backed public artifacts and mark binary
  discovery unavailable. Version 4's bounded help/doctor probes are optional
  corroboration channels and must never broaden into guessed operational commands.

### Q-8 · Official-schema pivot trigger

- The pivot plan (become a validator/differ) activates if Anthropic ships an official
  schema or an explicitly documented schema-dump command.
- **Decision:** monitor the official `llms.txt`, settings/keybindings pages, and
  release notes for an announced machine-readable artifact. An explicit official
  link triggers a source-policy review; it does
  not silently change authority in an automated run.
