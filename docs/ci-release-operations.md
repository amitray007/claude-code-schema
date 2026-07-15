# CI and release operations

## Workflows

| Workflow                   | Trigger                           | Purpose                                                                                    |
| -------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| `ci.yml`                   | PR, `main`, merge queue           | Offline tests, coverage, formatting, types, dependency review, experiment parity           |
| `discover-releases.yml`    | Daily and manual                  | Record every npm version after the baseline and dispatch publication only for npm `latest` |
| `auto-release-version.yml` | Dispatched by discovery           | Build, validate, diff, attest, and immutably publish the current npm `latest` version      |
| `analyze-version.yml`      | Reusable and manual               | Generate an exact-version candidate, validate it, upload review evidence, update its issue |
| `weekly-deep-audit.yml`    | Weekly and manual                 | Re-run live sources, exact binary probes, offline tests, and drift comparison              |
| `prepare-release-pr.yml`   | Manual                            | Download previously reviewed bytes, revalidate, stage publication files, open a draft PR   |
| `publish-release.yml`      | Merged `output/` files and manual | Validate committed bytes, checksum and attest each JSON file, create a GitHub Release      |

All external actions are pinned to full commit SHAs. Analysis and automatic
generation jobs have read-only repository permission. Only sanitized JSON candidates
and release bundles cross into publication; the write-enabled jobs never execute the
downloaded Claude binary. The separate job that edits an issue also never executes
it. Publication receives write permission only after entering the protected
`production` environment.

Discovery fails closed if its configured baseline is absent from npm history, which
prevents an accidental issue flood. Publication is immutable: if a version tag
already exists it must resolve to the exact validated `output/` commit, and existing
release assets are never overwritten. On a retry, every existing asset is downloaded
and compared byte-for-byte with the tagged files; a partial or divergent release
fails closed. Automatic release branches use one stable name per Claude Code version,
while manual review branches include the workflow run ID and attempt number. Both
strategies make retries collision-safe without mutating a published tag.

If several releases appear between discovery runs, each receives an issue, but only
the version identified by npm's current `latest` dist-tag enters generation and
publication. Older intervening versions are labeled `superseded` and closed without
regeneration because the public documentation is mutable and cannot be attributed to
them safely. There is no historical override or local backfill path.

For a safe new version, CI downloads and validates the most recent immutable schema
release,
generates the exact candidate, produces the semantic diff and release notes, stages
the candidate into `output/` on a fixed per-version automation branch, and tags that
exact commit. It uploads the same 15 JSON files plus `SHA256SUMS`, attests every JSON
asset, marks the new release latest, and opens a draft PR that synchronizes `main`'s
single current `output/` set. The protected `production` environment remains the
publication gate.

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

An automatically dispatched release that is no longer npm `latest`, lacks a previous
immutable schema release, or produces divergent bytes fails closed and moves from
`analysis-running` to `analysis-failed`. Immutable retries rebuild from the tagged
`output/` bytes and compare every remote asset byte-for-byte.

If a run stops after issue creation but before assigning a lifecycle label, the next
run resumes that issue. Issues already running, failed, awaiting review, approved,
published, or superseded are not dispatched again.

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
   to create pull requests for `prepare-release-pr.yml` and
   `auto-release-version.yml`.
3. Create a `production` environment with a required reviewer. In a
   single-maintainer repository, allow self-review so that maintainer can approve a
   deployment they initiated; with multiple maintainers, prevent self-review.
   Disable administrator bypass in the GitHub UI when the repository policy
   requires an unbypassable gate (the environment REST endpoint does not expose
   that toggle).
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
VERSION=$(npm view @anthropic-ai/claude-code version)
npm run schema:generate -- --version "$VERSION" --output .work/candidate
npm run schema:validate -- --directory .work/candidate
npm run schema:diff -- --from output --to .work/candidate
npm run schema:stage -- --candidate .work/candidate --publication-root .
```

Only `schema:stage` changes tracked `output/`, and it must be run after reviewing
the candidate and diff. Release publication uploads each committed JSON file plus a
`SHA256SUMS` file; it never refetches mutable documentation or builds a duplicate
archive/site tree.

Historical versions remain fail-closed because the public documentation is mutable.
The repository does not provide a historical-generation override or local backfill
command. Git contains only the latest validated `output/` set, while immutable GitHub
Release assets retain versions that were published while safely attributable.

## Probe limitation

The current verified engine supplies an isolated HOME, closes stdin, removes
credentials from the child environment, requests traffic suppression, and enforces
timeouts and command-count/depth limits. It does not yet provide an operating-system
network namespace around the binary. The manifest states this accurately. Moving
acquisition and probing fully into `src/` should split download from execution so
the latter can run under a hard no-network sandbox.
