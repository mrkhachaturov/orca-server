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

  # These steps are always manual.
  {
    echo "- [ ] Re-justify every patch (keep / shrink / merge / drop)"
    echo "- [ ] Run ./ci/dev/test-patches.sh"
    echo "- [ ] Verify changelog"
  } >> .cache/checklist
}

main "$@"
