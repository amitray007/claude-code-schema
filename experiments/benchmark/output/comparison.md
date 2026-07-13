# Cross-version benchmark

Claude Code release: `2.1.207`

> The score is an evidence-and-capability rubric, not an accuracy percentage.

| Version | Score / 100 | SchemaStore source | Typed settings | Constrained paths | Env properties | Probed commands | Public key actions | Artifacts |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| V1 | 49.3 | yes | 124/131 | 532 | 287 | 0 | 114 | 5 |
| V2 | 26.0 | no | 0/116 | 2 | 287 | 0 | 101 | 5 |
| V3 | 46.0 | no | 0/116 | 2 | 287 | 39 | 101 | 9 |
| V4 | 100.0 | no | 124/124 | 544 | 313 | 39 | 101 | 16 |

Category breakdown:

| Version | Source evidence | Settings quality | Interface breadth | Exact-release evidence | QA and provenance |
| --- | ---: | ---: | ---: | ---: | ---: |
| V1 | 3.0/20 | 31.3/40 | 11.0/20 | 0.0/10 | 4.0/10 |
| V2 | 6.0/20 | 6.0/40 | 10.0/20 | 0.0/10 | 4.0/10 |
| V3 | 13.0/20 | 6.0/40 | 15.0/20 | 8.0/10 | 4.0/10 |
| V4 | 20.0/20 | 40.0/40 | 20.0/20 | 10.0/10 | 10.0/10 |

Winner: **V4**

Ranking:

1. V4 — 100.0/100
2. V1 — 49.3/100
3. V3 — 46.0/100
4. V2 — 26.0/100

V4 parity result:

- V1 constrained paths: 532
- V1 paths active in V4: 516
- Explicitly scoped, retired, or legacy: 16
- Unaccounted: 0
- Current V4 paths not in V1: 28

See `comparison.json` for all raw metrics, category points, criteria, and limitations.
