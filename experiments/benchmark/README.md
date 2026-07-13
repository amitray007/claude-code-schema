# Cross-version benchmark

This benchmark compares Versions 1–4 against the same Claude Code release. It runs
all four validators, extracts factual coverage metrics from their generated
artifacts, executes V4's post-generation V1 parity gate, and applies a disclosed
100-point evidence-and-capability rubric.

The score is not an accuracy percentage. There is no complete official oracle from
which to calculate a statistically meaningful accuracy rate. The rubric measures
the project objectives instead:

| Category | Weight |
| --- | ---: |
| source independence and first-party evidence | 20 |
| settings validation quality | 40 |
| interface breadth | 20 |
| exact-release binary evidence | 10 |
| QA, provenance, and parity accounting | 10 |

Run from the repository root:

```bash
npm run experiment:benchmark
```

Outputs:

- `output/comparison.json` contains raw metrics, every criterion's points, the
  ranking, methodology, and caveats.
- `output/comparison.md` is the compact human-readable result.

Raw enum, required, type, pattern, and example keyword counts are included for
transparency but are not scored independently. A repeated or stale constraint does
not become more accurate merely because it adds more JSON Schema keywords.
