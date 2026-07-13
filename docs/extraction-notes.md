# Extraction Notes

> **Entry type:** Reference (empirical findings)
> **Status:** Verified against Claude Code `v2.1.207`, macOS arm64
> **Related:** [`sources.md`](sources.md) · [`pipeline.md`](pipeline.md)

Real findings from live probes of the installed Claude Code binary. This is the
ground-truth record of *what is actually extractable and how* — the design in
[`sources.md`](sources.md) is built on these facts.

> **2026-07-13 recheck:** the linux-x64 npm tarball for v2.1.207 was downloaded,
> its npm SHA-512 integrity was verified, and static extraction reproduced **402**
> unique `CLAUDE_CODE_*` names and **59** unique `ANTHROPIC_*` names. This confirms
> extractability, not public support. The binary is now classified as a discovery
> source; official docs are the authority for public env vars and flags.

---

## The binary

- **Path (local install):** `~/.local/share/claude/versions/<version>`
  (e.g. `~/.local/share/claude/versions/2.1.207`)
- **Type:** Mach-O 64-bit executable arm64, ~240 MB. A **Bun-compiled
  single-file executable** — the entire minified JS bundle is embedded inside the
  Mach-O (`__cstring` / `__const` sections; contains JavaScriptCore markers
  `__jsc_int` / `__wtf_config`).
- **No sidecar files:** the `ClaudeCode.app` bundle is the *same* kind of Bun
  binary. There is **no** `Resources/` dir, no asar, no unpacked `cli.js`, no
  `.d.ts`, no `package.json` inside. Everything lives in the Mach-O.

> ⚠️ **The path above is the local NATIVE-INSTALLER binary, NOT what CI should use.**
> The pre-spec audit resolved the load-bearing question: the Bun binary ships on npm
> as **per-platform optional dependencies** (`@anthropic-ai/claude-code-<os>-<arch>`),
> a plain tarball CI can `npm pack` + `strings` hermetically. Do **not** probe a
> locally-installed `~/.local` binary in CI. See [`sources.md`](sources.md) → Source C
> and [`decisions.md`](decisions.md) → D-1. The empirical findings below (from the
> local v2.1.207 binary) still hold — the *content* is identical; only the *acquisition
> path* changed.

---

## What was found (artifact by artifact)

| Artifact | Result | How |
| --- | --- | --- |
| **CLI flags + descriptions** | ✅ **146** flag defs (48 on main program) | Commander.js `.option(...)` chain on a single contiguous minified line |
| **Enum arrays** | ✅ clean literal data | e.g. permission modes extracted verbatim (below) |
| **Env vars** | ✅ **402** `CLAUDE_CODE_*` + **59** `ANTHROPIC_*` on the rechecked linux tarball | `strings \| grep -oE 'CLAUDE_CODE_[A-Z0-9_]+'` — an unclassified **candidate superset** |
| **Keybinding defaults/capabilities** | ✅ embedded, but public defaults come from docs | the exact binary also exposes action-token candidates and the command-binding validator grammar |
| **settings.json schema** | ❌ no complete declarative schema | Zod shapes are compiled, but `claude doctor` independently exposes deterministic validation diagnostics for invalid settings |
| **TypeScript `.d.ts`** | ❌ not found | only stray type-comment fragments |

### Real extracted data (verbatim)

**Permission-mode enum** (from the bundle, ~line 324919):

```json
["acceptEdits","auto","bypassPermissions","default","dontAsk","plan"]
```

Note `"auto"` — this is the auto-mode Orpheus had not yet wired.

**Env vars** — real sample showing signal beside noise (why a docs filter is needed):

```
CLAUDE_CODE_DISABLE_AUTO_MEMORY        # user-facing
CLAUDE_CODE_DISABLE_1M_CONTEXT         # user-facing
CLAUDE_CODE_SUBAGENT_MODEL             # user-facing
CLAUDE_CODE_3P_PROBE_WROTE_OPUS_...    # internal-looking, still unclassified
CLAUDE_CODE_ACT_DONT_REDERIVE          # internal-looking, still unclassified
```

**Flags** — real sample (main program, v2.1.207):

```
--bare       Minimal mode: skip hooks, LSP, plugin sync, attribution, auto-memory…
--safe-mode  Start with all customizations disabled — useful for troubleshooting…
--print, -p  Print response and exit (useful for pipes)…
```

---

## Runtime CLI introspection — useful only inside a strict boundary

Probing `claude` at runtime for a self-describing schema:

| Probe | Result |
| --- | --- |
| `claude --help`, `claude <subcmd> --help` | Prose help only. 67 flags + 13 subcommands. Parseable but brittle. |
| `claude --help --json` | `--json` ignored; identical prose. |
| `claude --help-all` / `--dump-config` / `--print-config` | `unknown option` (exit 1). |
| `claude --json-schema` | Exists but is for **structured session output validation**, not self-description. |
| `claude agents --json` | ✅ JSON — but **runtime session state**, not schema. |
| `claude auto-mode config` / `defaults` | ✅ ~60 KB JSON — but the **permission classifier ruleset**, not the settings/flags/env schema. |
| isolated `claude doctor` with invalid `settings.json` | ✅ deterministic path/type/enum diagnostics; Version 4 recovers 111 current top-level diagnostics without authentication |
| `man claude`, completion scripts | None exist. |

**Verdict:** the CLI does not emit a complete self-description, but bounded help
recovers command/argument/option structure and doctor provides an independent
settings validation oracle. Environment discovery remains docs plus static
candidates.

---

## ⚠️ Hard safety constraints (from a live near-miss)

1. **Never shell out to guessed `claude` subcommands.** During probing,
   `claude config list` and `claude completion` **started a real interactive agent
   session** — those subcommands no longer exist, so the arguments were parsed as a
   *prompt*. Any CLI interaction in the pipeline must use only `--version`, command
   paths discovered from successful parent `--help`, or `doctor` against generated
   invalid settings in an isolated home. Always use timeouts, closed stdin, traffic
   suppression, and no inherited credentials.

2. **The env-var grep is a candidate superset.** Absence from docs does not prove a
   name is internal, and a prefix allowlist does not prove it is public. Publish the
   documented set; keep binary-only names in a separate discovery report.

3. **Never trust a single source for a dimension.** Cross-source reconciliation is
   what makes parse fragility *detectable* rather than silent. See
   [`pipeline.md`](pipeline.md).

4. **Do not flatten Commander options.** The same option name can occur under
   different subcommands. Static extraction must reconstruct command paths and
   hidden/deprecated state before binary options can be compared to public docs.
