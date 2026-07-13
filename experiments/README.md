# Experiments

Each experiment is isolated under `version-<N>/` so new source strategies can be
tested without rewriting or obscuring earlier results.

| Version | Question | Sources | Result |
| --- | --- | --- | --- |
| [`version-1/`](version-1/) | What can we produce by combining official docs with SchemaStore? | npm metadata, official docs, SchemaStore settings + keybindings schemas | Rich settings/keybindings validation plus docs-backed env/flag/default artifacts |
| [`version-2/`](version-2/) | What can we produce without SchemaStore? | npm metadata and official docs only | Complete public-name catalogs, but deliberately weaker settings and keybindings validation |
| [`version-3/`](version-3/) | How far can an independent pipeline go with the shipped artifact and release history? | Version 2 sources, integrity-verified platform package, safe CLI probes, matching changelog/release notes | Subcommand-aware CLI catalog, static candidates/corroboration, and an advisory AI-review queue; settings types remain partial |
| [`version-4/`](version-4/) | Can first-party sources replace SchemaStore without losing validation capability? | Version 3 plus expanded official docs, tagged Anthropic examples, scoped config surfaces, and the exact binary's isolated `doctor` validator | Typed and nested settings, separate global/Desktop schemas, current keybindings, fact-level provenance, and a development-only V1 parity gate |

Measured against Claude Code `2.1.207`, version 1 emits 132 settings properties
with SchemaStore constraints and 114 keybinding actions. Version 2 finds 117
documented settings, but 116 of them have no verified type, and reconstructs 101
unique documented keybinding actions. Environment and top-level flag counts are
unchanged because those artifacts already come from official docs.

On `darwin-arm64`, version 3 verified and inspected the exact `2.1.207` platform
package, recovered 39 command paths, 178 command-option records, 21 positional
arguments, and 122 unique option spellings from safe help probes. Static inspection
found 455 environment candidates, while the matching changelog supplied 24 bullets
for advisory AI or human review. These are platform/release observations, not
permanent count guarantees.

Version 4 independently types the current settings surface, reconstructs nested
permissions, worktree, sandbox, and hook structures, and prevents global or Desktop
policy fields from being flattened into `settings.json`. Version 1 is read only by
the optional parity benchmark after generation; it is not a Version 4 source.

Run the experiments from the repository root:

```bash
npm run experiment:1
npm run experiment:1:check
npm run experiment:2
npm run experiment:2:check
npm run experiment:3
npm run experiment:3:check
npm run experiment:4
npm run experiment:4:check
npm run experiment:4:benchmark-v1
```

Generated files live inside each version's `output/` directory. Handwritten smoke
fixtures live inside its `examples/` directory.

To compare every version using the same evidence-and-capability rubric, run:

```bash
npm run experiment:benchmark
```

The benchmark implementation and generated comparison are under
[`benchmark/`](benchmark/). Its score is explicitly not presented as an accuracy
percentage; the raw measurements and criterion weights are included alongside it.
