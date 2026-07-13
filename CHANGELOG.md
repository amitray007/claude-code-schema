# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Open-source scaffolding: MIT `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, and GitHub issue/PR templates.
- Knowledge base under `docs/` capturing the design, sources, pipeline, schema
  format, extraction notes, decisions, and open questions.

### Changed

- Project name settled as `claude-code-schema`; license settled as MIT
  (resolving open questions Q-1 and Q-2).
- `settings.schema.json` and `claude-code.schema.json` now bundle their referenced
  schemas so each artifact compiles standalone in offline validators.

[Unreleased]: https://github.com/amitray007/claude-code-schema/commits/main
