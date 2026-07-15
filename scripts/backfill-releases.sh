#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  npm run schema:backfill -- --versions V1[,V2...] --previous DIR [options]
  npm run schema:backfill -- --publish-only BUNDLE [options]

Options:
  --work-directory DIR       Candidate and release-bundle root (default: .work/backfill)
  --platform-package NAME    Exact platform package used for bounded probes
  --base-url URL             Canonical release download URL root
  --source DIR               Offline source artifacts; valid for one requested version
  --candidate DIR            Bundle an existing candidate; valid for one requested version
  --allow-historical-docs    Explicitly permit best-effort mutable docs for historical versions
  --publication-root DIR     Atomically stage the final candidate as DIR/output after all pass
  --publish                  Create or byte-for-byte verify each tag and GitHub Release
  --publish-only BUNDLE      Publish or verify one already-built release bundle
  --repository OWNER/REPO    GitHub repository (default: amitray007/claude-code-schema)
  --target REF               Commit tagged by publication (default: HEAD)
  --latest                   Mark a --publish-only release as latest
EOF
}

repository="amitray007/claude-code-schema"
target="HEAD"
work_directory=".work/backfill"
platform_package=""
base_url="https://github.com/amitray007/claude-code-schema/releases/download"
previous_directory=""
source_directory=""
candidate_directory=""
publication_root=""
publish="false"
publish_only=""
latest="false"
allow_historical_docs="false"
versions=()

require_value() {
  if [[ $# -lt 2 || -z "${2:-}" || "$2" == --* ]]; then
    echo "$1 requires a value" >&2
    exit 2
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --versions)
      require_value "$@"
      IFS=',' read -r -a requested <<< "$2"
      versions+=("${requested[@]}")
      shift 2
      ;;
    --previous)
      require_value "$@"
      previous_directory="$2"
      shift 2
      ;;
    --work-directory)
      require_value "$@"
      work_directory="$2"
      shift 2
      ;;
    --platform-package)
      require_value "$@"
      platform_package="$2"
      shift 2
      ;;
    --base-url)
      require_value "$@"
      base_url="$2"
      shift 2
      ;;
    --source)
      require_value "$@"
      source_directory="$2"
      shift 2
      ;;
    --candidate)
      require_value "$@"
      candidate_directory="$2"
      shift 2
      ;;
    --publication-root)
      require_value "$@"
      publication_root="$2"
      shift 2
      ;;
    --repository)
      require_value "$@"
      repository="$2"
      shift 2
      ;;
    --target)
      require_value "$@"
      target="$2"
      shift 2
      ;;
    --publish-only)
      require_value "$@"
      publish_only="$2"
      shift 2
      ;;
    --allow-historical-docs)
      allow_historical_docs="true"
      shift
      ;;
    --publish)
      publish="true"
      shift
      ;;
    --latest)
      latest="true"
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

absolute_directory() {
  local directory="$1"
  mkdir -p "$directory"
  (cd "$directory" && pwd -P)
}

sha256_files() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -- *.json
  else
    shasum -a 256 -- *.json
  fi
}

run_checked() {
  "$@"
}

publish_bundle() {
  local bundle="$1"
  local mark_latest="$2"
  local manifest="$bundle/manifest.json"
  test -f "$manifest"
  test -f "$bundle/SHA256SUMS"
  test -f "$bundle/RELEASE_NOTES.md"
  local version
  version=$(jq -er '.claudeCodeVersion' "$manifest")
  local tag="v${version}"
  local target_commit
  target_commit=$(git rev-parse "${target}^{commit}")
  git fetch --tags origin
  if git rev-parse "$tag" >/dev/null 2>&1; then
    test "$(git rev-parse "${tag}^{commit}")" = "$target_commit"
    if ! git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; then
      git push origin "$tag"
    fi
  else
    git tag -a "$tag" "$target_commit" -m "$tag"
    git push origin "$tag"
  fi

  local expected_count
  expected_count=$(($(find "$bundle" -maxdepth 1 -type f -name '*.json' | wc -l) + 1))
  if gh release view "$tag" --repo "$repository" >/dev/null 2>&1; then
    local downloaded
    downloaded=$(mktemp -d "${work_directory}/.download-${version}.XXXXXX")
    gh release download "$tag" --repo "$repository" --dir "$downloaded"
    test "$(find "$downloaded" -maxdepth 1 -type f | wc -l)" -eq "$expected_count"
    cmp "$bundle/SHA256SUMS" "$downloaded/SHA256SUMS"
    for file in "$bundle"/*.json; do
      cmp "$file" "$downloaded/$(basename "$file")"
    done
    rm -rf "$downloaded"
    echo "Release $tag already exists with the exact generated assets."
    return
  fi

  local latest_arguments=()
  if [[ "$mark_latest" == "true" ]]; then
    latest_arguments+=(--latest)
  fi
  gh release create "$tag" \
    --repo "$repository" \
    --verify-tag \
    --title "$tag" \
    --notes-file "$bundle/RELEASE_NOTES.md" \
    "${latest_arguments[@]}" \
    "$bundle/SHA256SUMS" "$bundle"/*.json
}

work_directory=$(absolute_directory "$work_directory")

if [[ -n "$publish_only" ]]; then
  if [[ ${#versions[@]} -ne 0 || -n "$previous_directory" ]]; then
    echo "--publish-only cannot be combined with --versions or --previous" >&2
    exit 2
  fi
  publish_bundle "$(absolute_directory "$publish_only")" "$latest"
  exit 0
fi

if [[ ${#versions[@]} -eq 0 || -z "$previous_directory" ]]; then
  usage >&2
  exit 2
fi
if [[ -n "$source_directory" && ${#versions[@]} -ne 1 ]]; then
  echo "--source is valid only when one version is requested" >&2
  exit 2
fi
if [[ -n "$candidate_directory" && ${#versions[@]} -ne 1 ]]; then
  echo "--candidate is valid only when one version is requested" >&2
  exit 2
fi
if [[ -n "$source_directory" && -n "$candidate_directory" ]]; then
  echo "--source and --candidate are mutually exclusive" >&2
  exit 2
fi

previous_directory=$(absolute_directory "$previous_directory")
test -f "$previous_directory/manifest.json"
last_candidate=""

for index in "${!versions[@]}"; do
  version="${versions[$index]}"
  if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$ ]]; then
    echo "Invalid version: $version" >&2
    exit 2
  fi
  candidate="$work_directory/candidates/$version"
  if [[ -n "$candidate_directory" ]]; then
    candidate=$(absolute_directory "$candidate_directory")
  else
    generate_arguments=(
      --version "$version"
      --output "$candidate"
      --base-url "$base_url"
    )
    if [[ -n "$platform_package" ]]; then
      generate_arguments+=(--platform-package "$platform_package")
    fi
    if [[ -n "$source_directory" ]]; then
      generate_arguments+=(--source "$source_directory")
    fi
    if [[ "$allow_historical_docs" == "true" ]]; then
      generate_arguments+=(--allow-historical-docs)
    fi
    run_checked node dist/src/cli.js generate "${generate_arguments[@]}"
  fi

  test "$(jq -er '.claudeCodeVersion' "$candidate/manifest.json")" = "$version"
  run_checked node dist/src/cli.js validate --directory "$candidate" >/dev/null
  diff_file="$work_directory/diffs/${version}.json"
  mkdir -p "$(dirname "$diff_file")"
  run_checked node dist/src/cli.js diff \
    --from "$previous_directory" \
    --to "$candidate" \
    --output "$diff_file" >/dev/null

  release_directory="$work_directory/releases/$version"
  release_staging=$(mktemp -d "$work_directory/.release-${version}.XXXXXX")
  cp "$candidate"/*.json "$release_staging/"
  published_artifacts=$(jq -er '.counts.publishedArtifacts' "$candidate/manifest.json")
  test "$(find "$release_staging" -maxdepth 1 -type f -name '*.json' | wc -l)" -eq "$published_artifacts"
  node dist/src/cli.js release-notes \
    --directory "$candidate" \
    --diff "$diff_file" \
    --output "$release_staging/RELEASE_NOTES.md" >/dev/null
  (cd "$release_staging" && sha256_files) > "$release_staging/SHA256SUMS"
  mkdir -p "$(dirname "$release_directory")"
  rm -rf "$release_directory"
  mv "$release_staging" "$release_directory"

  if [[ "$publish" == "true" ]]; then
    is_last="false"
    if [[ "$index" -eq "$((${#versions[@]} - 1))" ]]; then
      is_last="true"
    fi
    publish_bundle "$release_directory" "$is_last"
  fi
  previous_directory="$candidate"
  last_candidate="$candidate"
done

if [[ -n "$publication_root" ]]; then
  run_checked node dist/src/cli.js stage \
    --candidate "$last_candidate" \
    --publication-root "$publication_root"
fi

echo "Backfill complete: ${versions[*]}"
