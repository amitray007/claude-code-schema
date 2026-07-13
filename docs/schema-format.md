# Artifact format

> **Entry type:** Contract
> **Status:** Corrected by the 2026-07-13 audit
> **Related:** [`pipeline.md`](pipeline.md) · [`sources.md`](sources.md) ·
> [`audit-2026-07-13.md`](audits/audit-2026-07-13.md)

The output uses JSON Schema only where there is a real JSON instance to validate.
Other surfaces use explicit catalogs, all indexed by a manifest.

## Files

| File                                     | Kind                 | Represents                                                                                 |
| ---------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------ |
| `settings.schema.json`                   | JSON Schema draft-07 | Claude Code `settings.json`                                                                |
| `global-config.schema.json`              | JSON Schema draft-07 | global `~/.claude.json` preferences                                                        |
| `desktop-managed-settings.schema.json`   | JSON Schema draft-07 | Claude Desktop-only managed policy                                                         |
| `env.schema.json`                        | JSON Schema draft-07 | a declared JSON projection of string-valued environment variables                          |
| `keybindings.schema.json`                | JSON Schema draft-07 | `~/.claude/keybindings.json`                                                               |
| `keybindings.runtime-compat.schema.json` | JSON Schema draft-07 | exact parser-compatible keybinding action values, including warning-only strings           |
| `flags.catalog.json`                     | versioned catalog    | options keyed by command path, spellings, arity, defaults, choices, and status when proven |
| `keybinding-defaults.catalog.json`       | versioned catalog    | public action names, contexts, and documented default display values                       |
| `settings-facts.catalog.json`            | versioned catalog    | setting paths, scopes, status, fact evidence, and runtime corroboration                    |
| `keybinding-capabilities.catalog.json`   | versioned catalog    | documented actions plus exact-binary candidates and command-binding evidence               |
| `claude-code.schema.json`                | JSON Schema draft-07 | explicit tooling envelope containing all five JSON configuration surfaces                  |
| `manifest.json`                          | versioned index      | release identity, sources, digests, artifact roles, counts, and drift                      |

`claude-code.schema.json` deliberately composes only the five artifacts that
validate JSON instances: settings, global configuration, Desktop managed policy,
environment, and keybindings. It does not attempt to compose catalogs or the
manifest, and Claude Code never reads this aggregate object. The envelope exists
for tooling that needs one validated snapshot of all configuration surfaces. See
[`examples/combined.json`](../examples/combined.json).

## Common metadata

Every artifact records:

- `claudeCodeVersion` or `x-claude-code-version`;
- an artifact kind and format version;
- source evidence and documentation links at the artifact or fact level; and
- a digest in `manifest.json`.

The manifest records for each source:

- stable source ID and role;
- requested and resolved URL;
- SHA-256 of the exact response bytes; and
- byte count.

Production snapshots should also record retrieval time outside deterministic
artifact payloads, or derive it from the release-run record, to avoid noisy rebuilds.

## Fact-level provenance

Do not use a single `x-source` when facts came from different places. A property may
have separate evidence for existence, type, description, enum/default, and version
bounds. The target model is conceptually:

```json
{
  "x-provenance": {
    "existence": [{ "source": "settingsDocs", "sourceSha256": "..." }],
    "type": [{ "source": "platformBinaryDoctor", "sourceSha256": "..." }],
    "description": [{ "source": "settingsDocs", "sourceSha256": "..." }]
  }
}
```

The experiment uses a smaller evidence array while the internal intermediate model
is still being designed. Confidence, corroboration, documentation status, and drift
are derived from evidence. A binary-only token is `undocumented-candidate`, not
automatically `internal` or public. Full official-doc prose is not redistributed by
the experiment; it records links and digests pending a licensing decision.

## Settings schema

Use official examples and tables as the structured base, specialized first-party
pages for nested semantics, and the exact release's isolated `doctor` diagnostics
as independent top-level type/enum corroboration. Preserve
`additionalProperties: true` in compatibility objects unless first-party evidence
establishes a closed set. Do not turn a dotted docs path into a literal top-level
property, and do not flatten global or Desktop-only fields into `settings.json`.

SchemaStore is not a generation source. A development-only parity report may use
Version 1 after generation to find lost capabilities, but discrepancies must be
resolved through current first-party evidence rather than copied constraints.

A future strict/audit schema may set `additionalProperties: false`, but it must be a
separate opt-in artifact and is not the default compatibility validator.

## Environment schema

The schema validates a JSON representation such as:

```json
{
  "ANTHROPIC_BASE_URL": "https://api.example.test",
  "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1"
}
```

All values are strings because process environments are string-valued. Documented
variables receive source links and version evidence. Other environment names remain
allowed with string values; binary-only candidates are not injected as public
properties.

## Flag catalog

Flags are not a JSON configuration file. Each option record is scoped by
`commandPath` and can contain:

- canonical name and aliases/spellings;
- required/optional/no-value arity;
- repeatability and variadic state;
- choices, default, conflicts, implications, hidden/deprecated state;
- documentation prose and examples; and
- fact-level provenance.

Unknown metadata stays unknown. It must not be guessed from an example. Duplicate
names at different command paths are valid records, not collisions.

## Keybindings schema and defaults catalog

The dedicated keybindings schema validates user configuration, including contexts,
actions, keystroke syntax, command bindings, and null unbinding. The defaults
catalog is separate because defaults describe application behavior, not the shape
of a user's override file. Preserve OS-specific or context-specific defaults as
display text until normalization is proven.

## Manifest example

```json
{
  "schemaVersion": 1,
  "artifactKind": "claude-code-surface-manifest",
  "claudeCodeVersion": "2.1.207",
  "release": {
    "npmPackage": "@anthropic-ai/claude-code",
    "npmIntegrity": "sha512-...",
    "expectedGitTag": "v2.1.207"
  },
  "artifacts": {
    "settings.schema.json": {
      "artifactKind": "settings-json-schema",
      "sha256": "..."
    },
    "flags.catalog.json": {
      "artifactKind": "cli-option-catalog",
      "sha256": "..."
    }
  },
  "drift": {
    "docsOnlyUntypedTopLevelSettings": [],
    "documentedActionsMissingFromSchema": []
  }
}
```

## Stability promises

- Pin a release tag plus manifest digest for reproducibility.
- Catalog additions are normally additive; removals and classification changes are
  explicit diffs, not silently retained for an invented grace period.
- JSON Schema custom `x-` keywords remain annotations.
- Catalog and manifest `schemaVersion` changes on a breaking format change.
- A mutable upstream response with the same Claude Code version but a new digest is
  recorded as a new observation and reviewed before replacing a published artifact.
