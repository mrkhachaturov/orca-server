#!/usr/bin/env bash

# Move the pinned Orca submodule to a new upstream tag and restack the patch
# series onto it. Modelled on code-server's ci/build/update-vscode.sh.
#
#   VERSION=v1.4.157 ./ci/build/update-orca.sh
#
# With no VERSION, assumes the submodule is already at the target and you are
# re-running to resolve conflicts.
#
# A conflict stops the refresh loop. Resolve it the quilt way:
#   quilt push -f          # force-apply, rejects land in *.rej
#   ...fix the rejected hunks by hand...
#   quilt refresh          # rewrite the patch against the new base
#   ./ci/build/update-orca.sh   # re-run to continue the series
#
# Applying is NOT acceptance. A patch that applies can still be redundant or
# already shipped upstream; every bump re-justifies each patch in CHANGELOG.md.

set -Eeuo pipefail

function unapply_patches() {
  local -i exit_code=0
  quiet quilt pop -af 2>&1 || exit_code=$?
  case $exit_code in
    # Successfully unapplied.
    0) ;;
    # No more patches to unapply.
    2) ;;
    # Some error.
    *) return $exit_code ;;
  esac
}

function apply_patches() {
  local -i exit_code=0
  quiet quilt push -a 2>&1 || exit_code=$?
  case $exit_code in
    # Successfully applied.
    0) ;;
    # No more patches to apply.
    2) ;;
    # Some error.
    *) return $exit_code ;;
  esac
}

function update_orca() {
  pushd lib/orca
  if ! git checkout 2>&1 "$target_orca_version"; then
    echo "$target_orca_version does not exist locally, fetching..."
    git fetch --all --prune --tags
    echo "Checking out $target_orca_version again..."
    git checkout "$target_orca_version"
  fi
  popd
}

# Push one patch at a time and refresh it against the new base, so line numbers
# and context are rewritten rather than carried as fuzz. The loop stops at the
# first patch that will not apply; that one is a human's problem.
function refresh_patches() {
  local -i exit_code=0
  while quiet quilt push 2>&1; ! ((exit_code = $?)); do
    quilt refresh 2>&1
  done
  case $exit_code in
    # No more patches to apply.
    2) ;;
    # Some error.
    *) return $exit_code ;;
  esac
}

# Orca declares the node it builds against; the AppImage build must match it,
# not "latest".
# Upstream creating a file at a path the overlay owns is the loudest signal a
# bump can produce: it means upstream shipped something we carry, or picked the
# same name. Either way it is a finding, not a workspace problem — and git would
# otherwise report it as "untracked working tree files would be overwritten",
# which reads like the latter.
function check_overlay_collisions() {
  [ -d src ] || return 0
  local collisions="" f
  while read -r f; do
    if git -C lib/orca cat-file -e "HEAD:src/$f" 2> /dev/null; then
      collisions="$collisions src/$f"
    fi
  done < <(cd src && find . -type f | sed 's|^\./||')

  if [ -n "$collisions" ]; then
    echo "upstream now ships a file at a path the overlay owns:$collisions"
    echo "decide per file whether ours is still needed before continuing."
    return 1
  fi
  echo "no overlay path collides with $(git -C lib/orca describe --tags --always)"
}

function update_node() {
  local node_version
  node_version=$(cat .node-version)
  local target_node_version
  target_node_version=$(orca_node_version)
  if [[ $node_version == "$target_node_version" ]]; then
    echo "Already set to $target_node_version"
  else
    echo "Updating from $node_version to $target_node_version..."
    echo "$target_node_version" > .node-version
  fi
}

function add_changelog() {
  local file=CHANGELOG.md
  if grep --quiet "Orca $target_orca_version" "$file"; then
    echo "Changelog for $target_orca_version already exists"
  else
    sed -i.bak "s/## Unreleased/## Unreleased\n\nOrca $target_orca_version\n\n### Changed\n\n- Update to Orca $target_orca_version/" "$file"
    rm -f "$file.bak"
  fi
}

function main() {
  cd "$(dirname "${0}")/../.."

  source ./ci/lib.sh

  declare -a steps

  local target_orca_version
  if [[ ${VERSION-} ]]; then
    # Removing patches only needs to be done locally; in CI we start from a
    # fresh clone each time.
    if [[ ! ${CI-} ]]; then
      steps+=("Unapplying patches" "unapply_patches")
    fi
    target_orca_version="${VERSION}"
    steps+=(
      "Update Orca to $target_orca_version" "update_orca"
      "Check overlay paths against upstream" "check_overlay_collisions"
      "Refresh Orca patches" "refresh_patches"
    )
  else
    target_orca_version="v$(orca_version)"
    echo "Detected Orca version $target_orca_version"
  fi

  steps+=(
    "Update Node version" "update_node"
    "Add changelog note" "add_changelog"
  )

  # Even if a step failed, still output the last checkmark.
  run-steps "${steps[@]}" || true

  # These steps are always manual. A clean restack says only that the patches
  # still apply — it says nothing about src/, which cannot fail to apply and can
  # still fail to compile, and nothing about whether any of it is still needed.
  {
    echo "- [ ] Re-justify every patch (keep / shrink / merge / drop)"
    echo "- [ ] Run ./ci/dev/test-scripts.sh — series integrity"
    echo "- [ ] Run pnpm run typecheck:tsc in lib/orca — the gate for src/"
    echo "- [ ] Run ./ci/dev/test-unit.sh and ./ci/dev/test-scope.sh"
    echo "- [ ] Verify changelog"
  } >> .cache/checklist
}

main "$@"
