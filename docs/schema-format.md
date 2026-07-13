# Artifact format

> **Entry type:** Contract
> **Status:** Corrected by the 2026-07-13 audit
> **Related:** [`pipeline.md`](pipeline.md) · [`sources.md`](sources.md) ·
> [`audit-2026-07-13.md`](audits/audit-2026-07-13.md)

The output uses JSON Schema only where there is a real JSON instance to validate.
Other surfaces use explicit domain catalogs. `catalog.json` is the consumer entry
point; `manifest.json` is the provenance and integrity record.

If the goal is ordinary configuration rather than auditing, start with
[`quick-start.md`](quick-start.md): use `settings.schema.json` for Claude Code
settings files and `environment.schema.json` for environment-variable names.

## Files

| File                                   | Kind                 | Represents                                                                       |
| -------------------------------------- | -------------------- | -------------------------------------------------------------------------------- |
| `catalog.json`                         | release catalog      | product scope, groups, consumer, role, and real usage location for every asset   |
| `settings.schema.json`                 | JSON Schema draft-07 | Claude Code CLI settings objects                                                 |
| `global-config.schema.json`            | JSON Schema draft-07 | global `~/.claude.json` preferences                                              |
| `desktop-managed-settings.schema.json` | JSON Schema draft-07 | explicitly separate Claude Desktop managed policy                                |
| `environment.schema.json`              | JSON Schema draft-07 | tooling projection of the string-valued environment passed to the Claude process |
| `keybindings.schema.json`              | JSON Schema draft-07 | documented `~/.claude/keybindings.json` values                                   |
| `keybindings.compat.schema.json`       | JSON Schema draft-07 | parser-compatible keybindings, including warning-only action strings             |
| `claude-code.schema.json`              | JSON Schema draft-07 | synthetic tooling envelope containing the five JSON configuration surfaces       |
| `settings.catalog.json`                | domain catalog       | settings paths, scopes, evidence, runtime corroboration, and legacy candidates   |
| `environment.catalog.json`             | domain catalog       | documented variables, hook exposure, status, supplements, and binary candidates  |
| `cli.catalog.json`                     | domain catalog       | documented flags, probed commands/arguments/options, and static candidates       |
| `keybindings.catalog.json`             | domain catalog       | actions, defaults, command bindings, runtime evidence, and legacy candidates     |
| `review.catalog.json`                  | review catalog       | changelog hints and unresolved cross-version records; never accepted config      |
| `manifest.json`                        | integrity index      | release identity, sources, digests, counts, drift, and safety policy             |
| `validation-report.json`               | validation evidence  | deterministic validation checks and counts                                       |

`catalog.json` answers the first consumer question: “is this data settings, an
environment variable, a CLI argument, a terminal keybinding, Desktop policy, or
maintainer evidence?” Domain catalogs combine records that describe the same
interface while retaining explicit `documented`, `runtime`, and `candidate`
boundaries.

The catalog's `startHere` object maps common user goals directly to a primary file,
download URL, usage locations, example, and optional supporting-evidence file. Its
`audiences` object separates ordinary configuration references from specialized
tooling and maintainer/audit records.

`manifest.artifacts` carries digests for the 13 non-circular payloads. The manifest
cannot hash itself, and `validation-report.json` is emitted only after the candidate
has been validated; both are still listed in `catalog.json` and checksummed as
separate GitHub Release assets.

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

`settings.schema.json` reuses this schema through its real `env` property instead
of embedding a second copy of every environment-variable definition. The relative
reference resolves to the sibling `environment.schema.json` release asset. This is
a real relationship in Claude Code configuration, unlike the synthetic
multi-surface envelope.

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

## CLI catalog

Flags are not a JSON configuration file. `cli.catalog.json` combines the official
top-level flag table with the exact binary's bounded recursive `--help` command
tree. Each option record is scoped by `commandPath` and can contain:

- canonical name and aliases/spellings;
- required/optional/no-value arity;
- repeatability and variadic state;
- choices, default, conflicts, implications, hidden/deprecated state;
- documentation prose and examples; and
- fact-level provenance.

Unknown metadata stays unknown. It must not be guessed from an example. Duplicate
names at different command paths are valid records, not collisions.

## Keybindings schema and catalog

The dedicated keybindings schema validates user configuration, including contexts,
actions, keystroke syntax, command bindings, and null unbinding. Defaults live in
`keybindings.catalog.json` because they describe application behavior, not the shape
of a user's override file. The `.compat` schema is a deliberately more permissive
alternative for strings accepted with runtime warnings. Preserve OS-specific or
context-specific defaults as display text until normalization is proven.

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
    "cli.catalog.json": {
      "artifactKind": "cli-surface-catalog",
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
