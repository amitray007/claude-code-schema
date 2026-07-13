# Schema Format

> **Entry type:** Contract
> **Status:** Design
> **Related:** [`pipeline.md`](pipeline.md) · [`sources.md`](sources.md)

The output contract: what the generator emits and how consumers use it.

## Files — per-category **and** combined

Both granular and unified, so a consumer takes exactly what it needs:

| File | Covers | Source authority |
| --- | --- | --- |
| `settings.schema.json` | `settings.json` keys + types | docs + SchemaStore |
| `env.schema.json` | environment variables | binary (filtered) + docs |
| `flags.schema.json` | CLI flags + enum values | binary + docs |
| `keybindings.schema.json` | default keybindings | binary |
| `claude-code.schema.json` | **combined index**, `$ref`-ing the four above | — |

The combined index composes the per-category schemas via `$ref`, so there is one
source of truth per category and no duplication between granular and combined forms.

## Base format

- **JSON Schema draft-07** (matches SchemaStore; broadly supported by validators/IDEs).
- Every file carries `"x-claude-code-version": "<version>"` so a consumer can assert
  exactly which release it received.
- The combined index carries a `"x-generated-at"` marker and a `"x-sources"` summary.

## Provenance — every field is tagged

The reconciliation policy ([`pipeline.md`](pipeline.md)) attaches provenance so
every fact is auditable. Custom `x-` keywords (ignored by standard validators, read
by aware consumers):

| Keyword | Meaning |
| --- | --- |
| `x-source` | `"binary"` \| `"docs"` \| `"schemastore"` \| `"changelog"` — where the fact came from |
| `x-undocumented` | `true` = present in the binary but not the docs (freshest signal) |
| `x-corroborated` | `false` = single-source, no cross-check |
| `x-internal` | `true` = env var that failed the user-facing filter; retained but not "public" |
| `x-min-version` | from the docs' `{/* min-version */}` markers, when present |

## Example — a flag entry (`flags.schema.json`)

```json
{
  "permission-mode": {
    "type": "string",
    "description": "Set the permission mode for the session.",
    "enum": ["acceptEdits", "auto", "bypassPermissions", "default", "dontAsk", "plan"],
    "x-source": "binary",
    "x-corroborated": true
  },
  "some-new-flag": {
    "type": "boolean",
    "x-source": "binary",
    "x-undocumented": true,
    "x-corroborated": false
  }
}
```

## Example — an env entry (`env.schema.json`)

```json
{
  "ANTHROPIC_BASE_URL": {
    "type": "string",
    "description": "Override the API endpoint URL.",
    "x-source": "docs",
    "x-corroborated": true
  },
  "CLAUDE_CODE_ACT_DONT_REDERIVE": {
    "type": "string",
    "x-source": "binary",
    "x-internal": true,
    "x-corroborated": false
  }
}
```

## Consumer contract (stability promises)

- **Additive by default.** New keys/flags appear; existing entries keep their shape.
- **Removals are explicit** — a removed key is retained one release with
  `"deprecated": true` before dropping, so consumers get a signal, not a surprise.
- **Pin by git tag** (`v<version>`) for reproducibility; track `latest/` for freshness.
- Standard validators ignore all `x-` keywords, so the schemas validate real
  `settings.json` files out of the box.
