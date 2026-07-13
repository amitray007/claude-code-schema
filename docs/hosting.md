# Release distribution

GitHub Releases are the only public distribution host. The repository keeps the
current reviewed artifact set in [`output/`](../output/); it does not maintain a
`latest/` alias, per-version directories, or a `site/` mirror.

## Published URL layout

Tags and GitHub Release titles use `vX.Y.Z`. Every JSON artifact is uploaded as a
separate asset:

```text
https://github.com/amitray007/claude-code-schema/releases/tag/v2.1.207
https://github.com/amitray007/claude-code-schema/releases/download/v2.1.207/catalog.json
https://github.com/amitray007/claude-code-schema/releases/download/v2.1.207/manifest.json
https://github.com/amitray007/claude-code-schema/releases/download/v2.1.207/settings.schema.json
https://github.com/amitray007/claude-code-schema/releases/download/v2.1.207/claude-code.schema.json
```

These versioned download URLs are also the schemas' canonical `$id` values.
`settings.schema.json` and `claude-code.schema.json` use internal references to
bundled definitions, so each release asset can be downloaded and compiled alone.
The individual surface schemas remain separate assets for focused consumers.

Consumers can discover assets through GitHub's public Releases API or download them
directly. Public release metadata and assets do not require authentication. See the
[GitHub Releases API](https://docs.github.com/en/rest/releases/releases) and
[release-assets API](https://docs.github.com/en/rest/releases/assets).

## Integrity

Each release includes:

- all generated JSON files as individual assets;
- `SHA256SUMS`, containing a digest for every JSON asset; and
- GitHub build-provenance attestations for every JSON asset.

No ZIP or tar archive is created. Start with `catalog.json` to discover which file
matches a configuration location or interface. Its `startHere.settingsJson` and
`startHere.environmentVariables` entries point directly to the two most commonly
needed schemas. The tag, release assets, manifest digests, checksums, and
attestations all refer to the same reviewed `output/` bytes.
