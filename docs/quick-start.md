# Consumer quick start

Use this page when you want Claude Code configuration data rather than generation
provenance or maintainer audit records.

## Claude Code `settings.json`

Use **`settings.schema.json`**. It is the primary reference and validator for keys,
types, nested structures, examples, scopes, and selected defaults accepted in:

- `~/.claude/settings.json`;
- `.claude/settings.json`;
- `.claude/settings.local.json`;
- `--settings <file-or-json>`; and
- supported managed-settings sources.

For Claude Code `v2.1.207`:

```text
https://github.com/amitray007/claude-code-schema/releases/download/v2.1.207/settings.schema.json
```

Add the release URL as `$schema` to receive editor completion and validation. See
[`examples/settings.json`](../examples/settings.json).

The schema's `env` property uses a bundled copy of `environment.schema.json`, so
recognized environment-variable names are available while editing `settings.json`.
The downloaded settings schema compiles by itself in offline validators; load the
separate environment schema only when validating an environment map directly.

`settings.catalog.json` is supporting evidence. Most users do not need it. Use it
only when auditing source provenance, scope classification, or runtime
corroboration for a setting.

## Claude Code environment variables

Use **`environment.schema.json`** as the primary list of supported variable names
and as a validator for a JSON representation of a process environment.

For Claude Code `v2.1.207`:

```text
https://github.com/amitray007/claude-code-schema/releases/download/v2.1.207/environment.schema.json
```

The JSON representation looks like this:

```json
{
  "ANTHROPIC_BASE_URL": "https://api.example.test",
  "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1"
}
```

This JSON object is for editors, CI, wrappers, and other tooling. Claude Code does
not read an environment JSON file. Set the actual variables in the shell, process
runner, container, or CI environment that launches `claude`. See
[`examples/environment.json`](../examples/environment.json).

`environment.catalog.json` is supporting evidence. It additionally contains hook
exposure, retired/unverified records, and binary-only candidates. Those candidates
must not be treated as supported public variables.

## Files most consumers can ignore

- `*.catalog.json`, other than `cli.catalog.json`, primarily preserve evidence and
  behavior that cannot be expressed faithfully as JSON Schema.
- `manifest.json` and `validation-report.json` are integrity and CI records.
- `review.catalog.json` is maintainer-only evidence and never accepted
  configuration.
- `claude-code.schema.json` is a self-contained synthetic multi-surface testing
  envelope. Claude Code does not consume it.

The generated `catalog.json` exposes the same choice under `startHere` and groups
the remaining files by audience under `audiences`.
