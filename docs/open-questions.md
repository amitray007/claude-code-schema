# Open Questions

> **Entry type:** Unresolved decisions
> **Status:** Living — resolve before or during implementation
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

## Q-3 · Real-config corpus for the validation gate

- The gate (D-3) needs a committed corpus of real-world `settings.json` files that
  must validate with zero false negatives.
- **Open:** where to harvest (public dotfiles repos? Orpheus's own users' configs,
  scrubbed?), how many, how to keep them current, and privacy scrubbing rules.

## Q-4 · Per-OS enum variance cadence

- Flags/enums *should* be identical across the 8 platform binaries, but platform-gated
  flags exist.
- **Open:** confirm the extraction platform (leaning linux-x64 as canonical) and the
  cadence for cross-platform spot-diffs (leaning quarterly, not per-run, to avoid
  pulling ~1.8 GB every release).

## Q-5 · Upstream-contribution stance

- Given D-4 (SchemaStore is community-hosted + Anthropic-endorsed), how actively do we
  push settings fixes upstream vs only maintaining our own?
- **Open:** a concrete policy — e.g. "settings-key fixes → PR upstream; env/flags/
  keybindings → ours only." Affects how the project is positioned to the community.

## Q-6 · Consumer integration (Orpheus side)

- This schema feeds Orpheus's settings manifest. That consumer work is a **separate
  project/spec** and is out of scope here.
- **Open:** the exact contract Orpheus consumes (which files, pinned by tag or
  tracking latest, and how it maps `x-source` provenance into its own `wired` flags).

## Q-7 · Bytecode-compilation contingency

- If Anthropic enables Bun **bytecode** compilation, `strings`-based flag/env
  extraction silently breaks (the count-floor gate catches it, but yields nothing).
- **Open:** the fallback when Source A dies — fall back to `--help` prose parsing for
  flags? Rely on docs + SchemaStore only? Document the degraded mode before it's needed.

## Q-8 · Official-schema pivot trigger

- The pivot plan (become a validator/differ) activates if Anthropic ships an official
  schema or `--dump-schema`.
- **Open:** how the pipeline *detects* that (probe a candidate endpoint each run?),
  and the concrete steps of the pivot.
