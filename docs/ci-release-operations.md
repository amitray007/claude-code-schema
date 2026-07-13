# CI and release operations

## Workflows

| Workflow                 | Trigger                           | Purpose                                                                                    |
| ------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------ |
| `ci.yml`                 | PR, `main`, merge queue           | Offline tests, coverage, formatting, types, dependency review, experiment parity           |
| `discover-releases.yml`  | Daily and manual                  | Record every npm version after the baseline and analyze only the current npm `latest`      |
| `analyze-version.yml`    | Reusable and manual               | Generate an exact-version candidate, validate it, upload review evidence, update its issue |
| `weekly-deep-audit.yml`  | Weekly and manual                 | Re-run live sources, exact binary probes, offline tests, and drift comparison              |
| `prepare-release-pr.yml` | Manual                            | Download previously reviewed bytes, revalidate, stage publication files, open a draft PR   |
| `publish-release.yml`    | Merged `output/` files and manual | Validate committed bytes, checksum and attest each JSON file, create a GitHub Release      |

All external actions are pinned to full commit SHAs. The analysis job has read-only
repository permission. The job that edits an issue does not execute the downloaded
Claude binary. Publication receives write permission only after entering the
`production` environment.

Discovery fails closed if its configured baseline is absent from npm history, which
prevents an accidental issue flood. Publication is immutable: if a version tag
already exists it must resolve to the reviewed `main` commit, and existing release
assets are never overwritten.

If several releases appear between discovery runs, each still receives an issue.
Only the version identified by npm's `latest` dist-tag is analyzed because the
documentation sources are mutable and cannot be attributed safely to an older
version. Intervening versions are labeled `superseded` and closed without generating
a schema; their issue remains the durable discovery record.

Repository tags and GitHub Release titles use only the schema version in the form
`vX.Y.Z` (for example, `v2.1.207`). Product or repository prefixes are not added.

## Version issue lifecycle

The discovery workflow uses the hidden marker
`claude-code-schema-release:<version>` as the idempotency key. Labels express the
state:

1. `claude-release` + `analysis-running`;
2. `needs-review` after successful deterministic analysis;
3. `approved-for-pr` after a maintainer starts PR preparation; and
4. `published` after release completion.

An intervening release that was already older than npm `latest` when discovered is
labeled `superseded` and closed as not planned. It never enters the analysis or
publication states.

Failed analysis is labeled `analysis-failed`, linked to its workflow log, and leaves
the issue open. A successful publication adds the immutable release link, marks the
issue `published`, and closes it only after the release exists.

The issue contains exact source URLs and digests, counts, semantic diff, validation
status, workflow link, local reproduction commands, and a manual checklist. The
30-day workflow artifact is for review convenience; the issue summary and eventual
GitHub Release are the durable record.

## Required repository settings

Before enabling publication:

1. Protect `main` and require `Test and validate`, `Dependency review`, one review,
   and conversation resolution.
2. Set Actions workflow permissions to read by default, then allow GitHub Actions
   to create pull requests for `prepare-release-pr.yml`.
3. Create a `production` environment with a required reviewer, prevent
   self-review, and disable administrator bypass.
4. Keep Issues enabled. Discovery creates and updates the required labels.
5. Keep `SCHEMA_BASE_URL` unset to use this repository's immutable GitHub Release
   download URL. Set it only when deliberately migrating every schema `$id`.
6. Enable the repository Dependency Graph and set repository variable
   `ENABLE_DEPENDENCY_REVIEW=true` to activate GitHub's per-PR dependency diff.
   Until then CI uses a production `npm audit` fallback instead of failing because
   the repository feature is unavailable.

## Local release review

```bash
npm ci --ignore-scripts
npm run schema:discover -- --after 2.1.207
npm run schema:generate -- --version 2.1.207 --output .work/candidate
npm run schema:validate -- --directory .work/candidate
npm run schema:diff -- --from output --to .work/candidate
npm run schema:stage -- --candidate .work/candidate --publication-root .
```

Only `schema:stage` changes tracked `output/`, and it must be run after reviewing
the candidate and diff. Release publication uploads each committed JSON file plus a
`SHA256SUMS` file; it never refetches mutable documentation or builds a duplicate
archive/site tree.

## Probe limitation

The current verified engine supplies an isolated HOME, closes stdin, removes
credentials from the child environment, requests traffic suppression, and enforces
timeouts and command-count/depth limits. It does not yet provide an operating-system
network namespace around the binary. The manifest states this accurately. Moving
acquisition and probing fully into `src/` should split download from execution so
the latter can run under a hard no-network sandbox.
