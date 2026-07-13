# Sources

> **Entry type:** Reference
> **Status:** Corrected by the 2026-07-13 audit
> **Related:** [`extraction-notes.md`](extraction-notes.md) ·
> [`pipeline.md`](pipeline.md) · [`audit-2026-07-13.md`](audits/audit-2026-07-13.md)

No source covers every selected interface. Sources are assigned by the fact they
can actually prove; no source “wins globally.”

## Source A — official documentation markdown

**Role:** primary authority for the public surface and prose.

**Exact endpoints**

- `https://code.claude.com/docs/en/settings.md`
- `https://code.claude.com/docs/en/env-vars.md`
- `https://code.claude.com/docs/en/cli-reference.md`
- `https://code.claude.com/docs/en/keybindings.md`
- `https://code.claude.com/docs/llms.txt`

**Provides**

- public settings names, descriptions, examples, and documented version bounds;
- public environment-variable names and descriptions;
- public top-level CLI flag spellings, descriptions, and examples;
- keybinding contexts, action names, documented defaults, and validation guidance;
- the current documentation route index.

**Extraction**

1. Discover/confirm routes through `llms.txt`; do not hardcode it merely as a
   canary.
2. Fetch English markdown, record requested/resolved URL, byte count, and SHA-256.
3. Bound each intended section by headings, then identify tables by required header
   names. Do not parse every pipe row on the page.
4. Split GFM rows while respecting escaped pipes and code spans.
5. Capture all `{/* min-version */}` and `{/* max-version */}` markers without
   treating them as complete historical coverage.
6. Fail on missing/duplicate required sections, malformed tables, empty output, or
   implausible semantic diffs.

**Limitations**

- The pages are mutable and not version-addressed. Exact source bytes/digests must
  be archived for reproducibility.
- Settings types are incomplete or embedded in examples/prose.
- CLI tables do not prove option arity, defaults, hidden state, or subcommand scope.
- Documentation can lag or lead the binary; that is drift to report, not a reason
  to publish an unclassified binary token as public.

## Source B — expanded first-party configuration references

**Role:** nested structure, scope, and specialized configuration semantics that the
single settings table cannot express completely.

Version 4 reads the official settings, keybindings, hooks, status-line, plugin,
Desktop, sandboxing, auto-mode, voice, managed-MCP, server-managed-settings, and
monitoring pages. It also reads tag-pinned JSON examples and the hook validator from
`anthropics/claude-code` at `v<version>`.

**Provides**

- nested permission, worktree, sandbox, auto-mode, voice, status-line, hook, and
  policy-helper shapes;
- separate `~/.claude.json`, Claude Code settings, and Desktop policy surfaces;
- current hook events and five handler variants;
- plugin and managed-policy examples tied to the release tag; and
- standard OpenTelemetry variables documented outside the main env table.

Examples prove observed shapes, not exhaustive closed objects. The generator keeps
compatibility objects open unless first-party evidence establishes a closed set.
Full source URLs and response digests are recorded in the Version 4 manifest.

## Source C — npm registry metadata and platform tarballs

**Role:** release identity, platform matrix, immutable package integrity, and
optional static candidate discovery.

**Exact endpoints**

- `https://registry.npmjs.org/@anthropic-ai/claude-code/latest`
- `https://registry.npmjs.org/@anthropic-ai/claude-code/<version>`
- platform package/version and `dist.tarball` URLs derived from
  `optionalDependencies`

**Provides**

- exact npm version and distribution integrity;
- version-matched optional platform package names;
- a shipped native binary that can be inspected statically for candidates.

**Acquisition**

1. Resolve the exact wrapper version; reject a response that does not match the
   requested version.
2. Derive, never hardcode, the platform package matrix.
3. Fetch a versioned platform `dist.tarball` directly or use `npm pack` with scripts
   disabled.
4. Verify `dist.integrity` before extraction.
5. Inspect only in an ephemeral directory; never commit or redistribute the binary
   or raw string dump.

**Static discovery**

- `strings -n 6` plus exact identifier regexes can discover env candidates and
  literal enum candidates.
- Commander extraction must reconstruct command paths and option metadata. A flat
  regex list mixes top-level, subcommand, hidden, test, and dependency options.
- Binary-only findings go to a separate candidate report. They are not classified
  as public or internal automatically.

Version 4 also executes two bounded, non-authenticated validation channels from the
exact verified binary: recursive `--help` paths discovered from prior help output,
and `claude doctor` against null sentinels in an isolated config directory. The
doctor diagnostics independently prove top-level settings types and selected enums.
No prompt, login, update, install, or operational command is sent. Raw output is not
redistributed.

The v2.1.207 linux-x64 recheck reproduced 402 `CLAUDE_CODE_*` and 59
`ANTHROPIC_*` candidates and the known permission-mode literal. See
[`extraction-notes.md`](extraction-notes.md).

## Source D — Anthropic Git tags, releases, and changelog

**Role:** release corroboration and typed change hints.

**Exact sources**

- `https://github.com/anthropics/claude-code/releases`
- `https://raw.githubusercontent.com/anthropics/claude-code/v<version>/CHANGELOG.md`

Use the matching tag rather than `main` for a release-specific changelog when the
tag exists. A tag can arrive after npm, so retry/wait without replacing last-good
output.

Backtick identifiers are not self-typing. A changelog hint is high confidence only
when both the artifact kind and change verb are explicit. Paths, commands, examples,
removals, and fixed bugs must not become automatic “must exist” assertions.

## Source policy matrix

| Fact | Primary source | Secondary/corroboration |
| --- | --- | --- |
| release version/platform matrix/integrity | npm | GitHub tag/release |
| public setting existence and prose | settings docs | specialized official pages |
| settings types and constraints | official examples/tables | exact-binary `doctor` diagnostics |
| global/Desktop/policy scope | specialized official docs | tagged managed examples |
| public env existence and prose | docs | binary static candidate match |
| public top-level flags and prose | docs | scoped Commander extraction |
| flag arity/default/choices/command path | scoped Commander model | docs examples |
| keybindings validation | keybindings docs | exact-binary validator strings/candidates |
| actions and documented defaults | keybindings docs | exact-binary candidate presence |
| release change hints | tagged changelog | semantic artifact diff |

SchemaStore is deliberately absent from this matrix. Version 1 may be read after
generation by a development-only parity benchmark, but it cannot contribute a
Version 4 property, type, enum, action, or artifact.

## Snapshot observations (not permanent thresholds)

For Claude Code v2.1.207 on 2026-07-13, the experiment parsed 117 settings rows,
290 environment rows, 71 documented top-level flag rows, and 109 keybinding
action/default rows. Strict leading row-level version bounds reduced the current
public outputs to 287 env properties and 70 flag records. Inline markers attached
to later clauses were retained as evidence rather than treated as whole-row bounds.
Version 4 expands the env schema to 313 properties by adding standard variables from
the official monitoring reference and provider-standard references, while keeping
hook-provided and retired names separately scoped. These values seed conservative
tests; future gates compare structure and semantic diffs rather than treating the
numbers as contracts.
