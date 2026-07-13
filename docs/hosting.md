# Schema hosting

## Published URL layout

The initial host is GitHub Pages:

```text
https://amitray007.github.io/claude-code-schema/index.json
https://amitray007.github.io/claude-code-schema/claude-code/index.json
https://amitray007.github.io/claude-code-schema/claude-code/latest/settings.schema.json
https://amitray007.github.io/claude-code-schema/claude-code/2.1.207/settings.schema.json
https://amitray007.github.io/claude-code-schema/claude-code/2.1.207/claude-code.schema.json
```

Versioned URLs are canonical. `latest/` is a convenience copy whose schemas retain
their immutable versioned `$id` values.

Each version directory contains every artifact declared by its manifest, including
schemas and catalogs, so the hosted release is independently digest-verifiable.
Validation reports, the compressed bundle, checksums, and attestations are also
distributed through the GitHub Release. The current complete artifact set is about
one megabyte, comfortably small enough for Pages.

## Custom domain migration

When a domain is selected:

1. choose a subdomain such as `schemas.example.com`;
2. verify it in GitHub and configure it under repository Pages settings;
3. add a DNS CNAME to `amitray007.github.io`;
4. enforce HTTPS;
5. set repository variable `SCHEMA_BASE_URL` to
   `https://schemas.example.com/claude-code`;
6. change `defaultBaseUrl` in `src/config.ts`; and
7. regenerate the hosted history so every `$id` moves in one reviewed migration.

Do not place a mutable `latest` URL in `$id`. Schema identity must remain tied to
the exact Claude Code version.
