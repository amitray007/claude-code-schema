# Contributing to claude-code-schema

Thanks for your interest in improving **claude-code-schema** — a machine-readable,
versioned schema of Claude Code's configuration surface.

> **Status:** the deterministic production generator and CI/release workflows are
> implemented. The knowledge base in [`docs/`](docs/) and the executable contracts
> in [`src/`](src/) must stay consistent.

## Ways to contribute

- **Design feedback** — read [`docs/overview.md`](docs/overview.md) and the rest
  of the knowledge base, then open an issue challenging a decision, filling an
  open question ([`docs/open-questions.md`](docs/open-questions.md)), or proposing
  a better extraction approach.
- **Source corrections** — if a setting, env var, CLI flag, or keybinding is
  wrong or missing in the design docs, file an issue with the exact Claude Code
  version and how you verified it.
- **Real-config corpus** — the validation gate needs real-world `settings.json`
  files (see open question Q-3). Scrubbed, permissively-shareable examples help.
- **Generator improvements** — add a focused parser, validation rule, fixture, or
  release-safety improvement with tests that fail before the change.

## Ground rules

1. **Open an issue before large changes.** For anything beyond a typo or a
   one-line correction, discuss the approach first so effort isn't wasted.
2. **Keep the knowledge base coherent.** `docs/` is a cross-linked knowledge
   base, not a linear spec. If you change a decision, update
   [`docs/decisions.md`](docs/decisions.md) and any entries that reference it.
3. **Cite your sources.** Published schema facts must trace to a first-party source
   or the integrity-verified release package per [`docs/sources.md`](docs/sources.md).
   SchemaStore may be used only by the historical parity benchmark and must never
   inject production facts.
4. **Respect the safety constraints.** Binary extraction has hard rules; see
   [`docs/extraction-notes.md`](docs/extraction-notes.md) before touching that path.

## Pull request process

1. Fork the repo and create a branch: `feat/short-description` or `fix/short-description`.
2. Make focused, self-contained changes with clear commit messages.
3. Update relevant docs in the same PR.
4. Run `npm run format:check`, `npm run typecheck`, and `npm run test:coverage`.
5. Open the PR against `main` with a description of **what** changed and **why**,
   linking any related issue.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By
participating, you agree to uphold it.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).
