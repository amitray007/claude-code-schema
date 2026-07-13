# Sources

> **Entry type:** Reference
> **Status:** Corrected after the pre-spec audit (see [`decisions.md`](decisions.md))
> **Related:** [`extraction-notes.md`](extraction-notes.md) · [`pipeline.md`](pipeline.md)

No single source gives the whole surface. Each source below is documented with the
same four fields: **what data**, **how**, **exact source**, and a **worked example**.
The reconciliation rules that combine them live in [`pipeline.md`](pipeline.md).

> ⚠️ **Corrected extraction target.** An earlier design assumed the Claude Code Bun
> binary shipped as the main npm package. It does **not** — see Source A. The main
> `@anthropic-ai/claude-code` npm package is a small JS wrapper; the binary ships as
> **per-platform optional dependencies**. All extraction targets the tarball of the
> platform package, pulled hermetically in CI — never a locally-installed binary.

---

## Source A — the per-platform binary tarball (flags, enums, env)

**What data**
- **CLI flags with descriptions** (~146 defs; 48 on the main program) and **literal
  enum arrays** (e.g. permission modes).
- **Environment variables** — a *superset* of `CLAUDE_CODE_*` (~402) + `ANTHROPIC_*`
  (~57), including internal/probe vars that must be filtered against the docs.
- **NOT** settings.json keys — the binary compiles Zod to closures, so declarative
  key/type shapes are gone (though key *strings* often survive as object-literal
  property names, usable as a corroboration set only).

**How** — hermetic, no execution:
1. Read the wrapper package's `optionalDependencies` map — it **is** the
   authoritative platform matrix (don't hardcode the 8 platforms).
2. `npm pack @anthropic-ai/claude-code-<os>-<arch>@<version>` (or `curl` the
   `dist.tarball`), untar. This is a plain tarball — **no postinstall, no CLI run.**
3. `strings -n 6` the Mach-O/ELF/PE inside, then:
   - grep the contiguous Commander.js `.option(...)` line for flags,
   - `grep -oE 'CLAUDE_CODE_[A-Z0-9_]+'` for env vars,
   - grep literal enum arrays.
4. Extract from **one canonical platform** (linux-x64) per run; fan out to all 8
   only to spot-check per-OS enum variance (quarterly, not every run).

**Exact source**
- Wrapper (for the platform matrix): `https://registry.npmjs.org/@anthropic-ai/claude-code/latest` → `optionalDependencies`
- Platform tarball: `https://registry.npmjs.org/@anthropic-ai/claude-code-<os>-<arch>/latest` → `dist.tarball`
  (e.g. `@anthropic-ai/claude-code-linux-x64`, `-darwin-arm64`, ~230 MB unpacked)

**Worked example** — extract the permission-mode enum:
```bash
strings -n 6 ./claude-bin | grep -oE '"acceptEdits","auto",[^]]*'
# → ["acceptEdits","auto","bypassPermissions","default","dontAsk","plan"]
```
That `"auto"` is the auto-mode Orpheus had not wired.

> **Fragility (serious):** `strings`-grep depends on Bun keeping readable JS strings.
> A minifier change, code-splitting, or (worst) Bun **bytecode** compilation would
> silently zero the yield. Mitigated by a **flag-count floor assertion** in the
> validation gate ([`pipeline.md`](pipeline.md)) — a big drop fails loudly, never
> emits an empty schema.

---

## Source B — official docs (raw markdown) — settings.json keys

**What data** — the **only** source for `settings.json` keys (~100), plus documented
env vars (~120) and flags/commands (~99), each as a GitHub-flavored pipe table with
inline `{/* min-version: X */}` markers.

**How** — fetch the raw `.md`, parse pipe tables defensively (anchor on the
backtick-quoted key; capture the version markers; tolerate embedded `|`/links in
cells). Also fetch `llms.txt` each run as a **structure canary** — if the doc page
set changes, the parser is about to break; warn early.

**Exact source**
- `https://code.claude.com/docs/en/settings.md`
- `https://code.claude.com/docs/en/env-vars.md`
- `https://code.claude.com/docs/en/cli-reference.md`
- `https://code.claude.com/docs/llms.txt` (structure canary)

**Worked example**
```
INPUT  (a real row from env-vars.md):
  | `ANTHROPIC_BASE_URL` | Override the API endpoint URL … |
OUTPUT (parsed record):
  { "key": "ANTHROPIC_BASE_URL", "kind": "env", "purpose": "Override the API endpoint URL" }
```

> **Fragility (serious):** a docs re-theme (Mintlify → MDX components) changes the
> shape and yields near-zero keys. Mitigation: docs-parse failure is a **hard error
> that blocks emit but never overwrites the last-good committed schema** (fail-closed
> on output, fail-safe on the artifact).

---

## Source C — npm registry — the release trigger

**What data** — the current `latest` version string + a `time` map of all published
versions with ISO timestamps. Clean, stable public contract.

**How** — poll `/latest` on a cron; when `version` changes, kick regeneration for
that exact version.

**Exact source** — `https://registry.npmjs.org/@anthropic-ai/claude-code/latest`

**Worked example**
```json
{ "name": "@anthropic-ai/claude-code", "version": "2.1.207",
  "dist": { "tarball": "https://…/claude-code-2.1.207.tgz" } }
```

---

## Source D — CHANGELOG — "what changed" (targeting + gate)

**What data** — per-version bullets naming changed settings/flags/env by exact
backtick identifier. Used both to *target* which keys to re-verify and, promoted to
a **gate**: if the changelog says "added `X`" and `X` isn't in the emitted schema,
fail the run.

**How** — fetch raw, grep the new `## <version>` section for backtick identifiers.

**Exact source** — `https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md`

**Worked example**
```
## 2.1.207
- … disable via `disableAutoMode` in settings; opt-in via `CLAUDE_CODE_ENABLE_AUTO_MODE`
```

---

## Source E — SchemaStore — PRIMARY for settings + keybindings

> **Promoted after the landscape survey** ([`decisions.md`](decisions.md) → D-9).
> SchemaStore is current and per-release; do **not** regenerate settings/keybindings
> from scratch — adopt these two schemas as the source of truth for those dimensions.

**What data** — **two** draft-07 JSON Schemas:
- `claude-code-settings.json` — `settings.json` keys **with types** (the binary can't
  give types; docs express them poorly). **Primary** for the settings dimension.
- `claude-code-keybindings.json` — the keybindings schema. **Primary** for the
  keybindings dimension (nothing else provides it machine-readably).

**How** — fetch both (follow the cross-host redirect), JSON-diff against last-good.
Use directly as the settings + keybindings output basis. For settings *existence*,
cross-check against docs (Source B) + CHANGELOG (Source D) so a SchemaStore lag on a
brand-new key is caught and tagged, not silently missing.

**Known gaps this project fills** (why it's not the whole answer): SchemaStore's `env`
is an **opaque object** (no enumeration) and it has **no CLI-flags schema** — those
come from Source A.

**Exact source**
- `https://json.schemastore.org/claude-code-settings.json`
- `https://json.schemastore.org/claude-code-keybindings.json`
  (both redirect to `www.schemastore.org/...`)

---

## Source quick-reference

| Source | Provides | Extraction | Role |
| --- | --- | --- | --- |
| A · platform tarball | **flags, enums, env** | `npm pack` + `strings` (hermetic) | **Primary — the axes nobody else covers** |
| B · docs `.md` | settings/env/flag prose + version markers | fetch + parse pipe tables | Descriptions + settings-existence cross-check |
| C · npm registry | latest version + timestamps | poll `/latest` | **Trigger** |
| D · CHANGELOG | named per-version changes | grep `## version` | Targeting + gate |
| E · SchemaStore | **settings + keybindings** schemas | fetch + JSON-diff | **Primary — settings & keybindings (adopted)** |
