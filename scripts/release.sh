#!/usr/bin/env bash
# Merge develop into main, create a release commit + annotated tag, and push
# to trigger .github/workflows/release.yml
#
# Must be run from the develop branch.
#
# Usage:
#   ./scripts/release.sh              # auto-pick next version from commits on develop
#   ./scripts/release.sh --dry-run
#   ./scripts/release.sh v0.4.0       # override the suggested version
#   ./scripts/release.sh --suggest    # print suggestion only
#
# Options:
#   --dry-run   Print actions without merging, committing, tagging, or pushing
#   --suggest   Print the suggested next version from commits since the latest tag
#   --remote    Git remote to push to (default: origin)
#   --yes       Skip the confirmation prompt

set -euo pipefail

REMOTE="origin"
DRY_RUN=0
SUGGEST=0
ASSUME_YES=0
VERSION=""
START_BRANCH=""

usage() {
  sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

die() {
  echo "error: $*" >&2
  exit 1
}

info() {
  echo "-> $*"
}

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "  [dry-run] $*"
  else
    "$@"
  fi
}

normalize_version() {
  local raw="$1"
  if [[ "$raw" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "v${raw}"
  elif [[ "$raw" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "$raw"
  else
    die "version must look like v0.4.0 (got: ${raw})"
  fi
}

# Return 0 if $1 is strictly greater than $2 (e.g. v0.4.0 > v0.3.1).
version_greater() {
  local left="${1#v}"
  local right="${2#v}"
  [[ "$left" != "$right" && "$(printf '%s\n' "$right" "$left" | sort -V | tail -n1)" == "$left" ]]
}

latest_tag() {
  git describe --tags --abbrev=0 2>/dev/null || true
}

# Suggest next version from commits in range: latest_tag..$1 (default: HEAD)
suggest_version() {
  local tip="${1:-HEAD}"
  local latest
  latest="$(latest_tag)"
  if [[ -z "$latest" ]]; then
    echo "v0.1.0"
    return 0
  fi

  local major minor patch
  if [[ "$latest" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    major="${BASH_REMATCH[1]}"
    minor="${BASH_REMATCH[2]}"
    patch="${BASH_REMATCH[3]}"
  else
    die "cannot parse latest tag: ${latest}"
  fi

  local subjects
  subjects="$(git log "${latest}..${tip}" --pretty=%s --no-merges 2>/dev/null || true)"

  if [[ -z "${subjects}" ]]; then
    return 1
  fi

  if echo "$subjects" | grep -Eq '^(feat|fix|perf|refactor|chore|docs|style|test|build|ci)(\(.+\))?!:'; then
    if [[ "$major" -eq 0 ]]; then
      echo "v0.$((minor + 1)).0"
    else
      echo "v$((major + 1)).0.0"
    fi
  elif echo "$subjects" | grep -Eq '^feat(\(.+\))?:'; then
    echo "v${major}.$((minor + 1)).0"
  elif echo "$subjects" | grep -Eq '^(fix|perf)(\(.+\))?:'; then
    echo "v${major}.${minor}.$((patch + 1))"
  else
    # deps/docs/chores only - still a patch release if you choose to cut one
    echo "v${major}.${minor}.$((patch + 1))"
  fi
}

restore_branch() {
  if [[ -n "$START_BRANCH" && "$DRY_RUN" -eq 0 ]]; then
    # Abort a failed merge so checkout is not blocked by unmerged paths.
    if [[ -e "$(git rev-parse --git-path MERGE_HEAD)" ]]; then
      git merge --abort >/dev/null 2>&1 || true
    fi
    local current
    current="$(git branch --show-current 2>/dev/null || true)"
    if [[ "$current" != "$START_BRANCH" ]] && git show-ref --verify --quiet "refs/heads/${START_BRANCH}"; then
      git checkout "$START_BRANCH" >/dev/null
    fi
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h | --help) usage 0 ;;
    --dry-run) DRY_RUN=1 ;;
    --suggest) SUGGEST=1 ;;
    --yes | -y) ASSUME_YES=1 ;;
    --remote)
      shift
      [[ $# -gt 0 ]] || die "--remote requires a value"
      REMOTE="$1"
      ;;
    -*)
      die "unknown option: $1"
      ;;
    *)
      [[ -z "$VERSION" ]] || die "unexpected argument: $1"
      VERSION="$1"
      ;;
  esac
  shift
done

cd "$(git rev-parse --show-toplevel)"

command -v git >/dev/null || die "git is required"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not inside a git repository"

START_BRANCH="$(git branch --show-current)"
[[ -n "$START_BRANCH" ]] || die "detached HEAD is not supported"
[[ "$START_BRANCH" == "develop" ]] || die "must be on develop (currently on ${START_BRANCH})"

info "Fetching ${REMOTE}"
git fetch "$REMOTE" --tags --prune

git show-ref --verify --quiet "refs/remotes/${REMOTE}/main" \
  || die "missing ${REMOTE}/main"
git show-ref --verify --quiet "refs/remotes/${REMOTE}/develop" \
  || die "missing ${REMOTE}/develop"

DEVELOP_REF="${REMOTE}/develop"
MAIN_REF="${REMOTE}/main"

latest="$(latest_tag)"
suggested=""
if suggested="$(suggest_version "$DEVELOP_REF")"; then
  :
else
  suggested=""
fi

if [[ "$SUGGEST" -eq 1 ]]; then
  echo "latest:    ${latest:-"(none)"}"
  if [[ -n "$suggested" ]]; then
    echo "suggested: ${suggested}"
  else
    echo "suggested: (none - no commits on develop since last tag)"
  fi
  if [[ -n "$latest" ]]; then
    echo
    echo "commits on develop since ${latest}:"
    git log "${latest}..${DEVELOP_REF}" --oneline --no-merges || true
  fi
  exit 0
fi

if [[ "$DRY_RUN" -eq 0 ]]; then
  [[ -z "$(git status --porcelain)" ]] || die "working tree is dirty; commit or stash first"
fi

# Local develop must match remote so we release what is published
if git show-ref --verify --quiet "refs/heads/develop"; then
  local_dev_ahead="$(git rev-list --count "${DEVELOP_REF}..develop")"
  local_dev_behind="$(git rev-list --count "develop..${DEVELOP_REF}")"
  if [[ "$local_dev_ahead" != "0" ]]; then
    die "local develop is ahead of ${DEVELOP_REF} by ${local_dev_ahead} commit(s); push develop first"
  fi
  if [[ "$local_dev_behind" != "0" ]]; then
    die "local develop is behind ${DEVELOP_REF} by ${local_dev_behind} commit(s); pull/rebase develop first"
  fi
fi

pending="$(git rev-list --count "${MAIN_REF}..${DEVELOP_REF}")"
if [[ "$pending" == "0" && -z "$suggested" ]]; then
  die "nothing to release - develop has no new commits since ${latest:-"(none)"}"
fi

if [[ -z "$VERSION" ]]; then
  [[ -n "$suggested" ]] || die "nothing to release - no releasable commits on develop since ${latest:-"(none)"}"
  VERSION="$suggested"
  info "Auto-selected version ${VERSION}"
else
  VERSION="$(normalize_version "$VERSION")"
fi

if [[ -n "$latest" ]] && ! version_greater "$VERSION" "$latest"; then
  die "version ${VERSION} must be greater than latest tag ${latest}"
fi

if git rev-parse -q --verify "refs/tags/${VERSION}" >/dev/null; then
  die "tag ${VERSION} already exists locally"
fi
if git ls-remote --exit-code --tags "$REMOTE" "refs/tags/${VERSION}" >/dev/null 2>&1; then
  die "tag ${VERSION} already exists on ${REMOTE}"
fi

info "Latest tag: ${latest:-"(none)"}"
if [[ -n "$suggested" && "$VERSION" != "$suggested" ]]; then
  info "Suggested:  ${suggested} (overridden)"
fi
info "Releasing:  ${VERSION}"
info "Merging ${pending} commit(s) from develop into main"

if [[ "$DRY_RUN" -eq 0 ]]; then
  info "Checking atomic push support on ${REMOTE}"
  if ! git push --atomic --dry-run "$REMOTE" "refs/heads/develop:refs/heads/develop" >/dev/null 2>&1; then
    die "remote ${REMOTE} does not support atomic pushes (required to publish main and the tag together)"
  fi
fi

if [[ "$ASSUME_YES" -eq 0 && "$DRY_RUN" -eq 0 ]]; then
  echo
  git log "${MAIN_REF}..${DEVELOP_REF}" --oneline --no-merges || true
  echo
  read -r -p "Merge develop into main, tag ${VERSION}, and push to ${REMOTE}? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || die "aborted"
fi

trap restore_branch EXIT

info "Checking out main"
if git show-ref --verify --quiet "refs/heads/main"; then
  if ! git merge-base --is-ancestor main "$MAIN_REF"; then
    die "local main has unpublished commits not on ${MAIN_REF}; push or reset them first"
  fi
  run git checkout main
  info "Updating local main to ${MAIN_REF}"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "  [dry-run] git reset --hard ${MAIN_REF}"
  else
    git reset --hard "$MAIN_REF"
  fi
else
  info "Creating local main from ${MAIN_REF}"
  run git checkout -B main "$MAIN_REF"
fi

info "Merging ${DEVELOP_REF} into main"
if git merge-base --is-ancestor "$MAIN_REF" "$DEVELOP_REF"; then
  # develop is strictly ahead - fast-forward
  run git merge --ff-only "$DEVELOP_REF"
else
  run git merge --no-ff "$DEVELOP_REF" -m "chore: prepare release ${VERSION}"
fi

info "Creating release commit"
run git commit --allow-empty -m "chore: release ${VERSION}"

info "Creating annotated tag ${VERSION}"
run git tag -a "$VERSION" -m "$VERSION"

info "Pushing main and ${VERSION} to ${REMOTE} (atomic)"
run git push --atomic "$REMOTE" main "refs/tags/${VERSION}"

info "Syncing develop with main (release commit)"
run git checkout develop
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "  [dry-run] git reset --hard ${REMOTE}/develop"
  echo "  [dry-run] git merge --ff-only main"
else
  git reset --hard "${REMOTE}/develop"
  git merge --ff-only main
fi
run git push "$REMOTE" develop

# Stay on develop after a successful release
START_BRANCH="develop"
trap - EXIT

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo
  echo "Dry run complete - no changes made."
else
  echo
  echo "Release ${VERSION} pushed. GitHub Actions will draft the release and publish the Docker image."
fi
