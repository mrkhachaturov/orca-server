#!/usr/bin/env bash
#MISE description="Move the pinned Orca submodule to a new tag and restack the series"
#MISE dir="{{config_root}}"

#   VERSION=v1.4.157 mise run bump
#
# With no VERSION, assumes the submodule is already at the target and you are
# re-running to resolve conflicts. A conflict stops the refresh loop; resolve it
# and re-run: `quilt push -f`, fix the *.rej hunks, `quilt refresh`.

set -Eeuo pipefail

function unapply_patches() {
  local -i exit_code=0
  quiet quilt pop -af 2>&1 || exit_code=$?
  case $exit_code in
    0) ;;
    2) ;; # nothing left to unapply
    *) return $exit_code ;;
  esac
}

function apply_patches() {
  local -i exit_code=0
  quiet quilt push -a 2>&1 || exit_code=$?
  case $exit_code in
    0) ;;
    2) ;; # nothing left to apply
    *) return $exit_code ;;
  esac
}

function update_orca() {
  pushd lib/orca
  if ! git checkout "$target_orca_version" 2>&1; then
    echo "$target_orca_version does not exist locally, fetching..."
    git fetch --all --prune --tags
    echo "Checking out $target_orca_version again..."
    git checkout "$target_orca_version"
  fi
  popd
}

# One patch at a time, refreshed against the new base so context is rewritten
# rather than carried as fuzz. Stops at the first patch that will not apply.
function refresh_patches() {
  local -i exit_code=0
  while
    quiet quilt push 2>&1
    ! ((exit_code = $?))
  do
    quilt refresh 2>&1
  done
  case $exit_code in
    2) ;; # nothing left to apply
    *) return $exit_code ;;
  esac
}

# A collision means upstream now ships a path the overlay owns — a finding, not a
# workspace problem, which is all git would call it ("untracked working tree
# files would be overwritten").
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

# Both files carry the node version and both have to move: .node-version holds
# the major, mise.toml the exact release, and mise is what puts node on PATH in
# CI. Move only one and CI silently keeps building on the old major.
function update_node() {
  local target_major
  target_major=$(orca_node_version)
  if [[ $(cat .node-version) == "$target_major" ]]; then
    echo ".node-version already $target_major"
  else
    echo ".node-version: $(cat .node-version) -> $target_major"
    echo "$target_major" > .node-version
  fi

  local target_full current_full
  target_full=$(orca_node_full_version)
  current_full=$(sed -n 's/^node = "\(.*\)"$/\1/p' mise.toml)
  if [[ $current_full == "$target_full" ]]; then
    echo "mise.toml already node $target_full"
  else
    echo "mise.toml: node $current_full -> $target_full"
    sed -i.bak "s/^node = \".*\"$/node = \"$target_full\"/" mise.toml
    rm -f mise.toml.bak
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

  source ./.mise/lib.sh

  declare -a steps

  local target_orca_version
  if [[ ${VERSION-} ]]; then
    # CI starts from a fresh clone, so there is nothing applied to pop.
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

  # Even a failed step still gets its checkmark written.
  run-steps "${steps[@]}" || true

  # Always manual: a clean restack says the patches apply, not that they are
  # still needed, and says nothing at all about src/.
  {
    echo "- [ ] Re-justify every patch (keep / shrink / merge / drop)"
    echo "- [ ] Run mise run test:series — series integrity"
    echo "- [ ] Run pnpm run typecheck:tsc in lib/orca — the gate for src/"
    echo "- [ ] Run mise run test:unit and mise run test:scope"
    echo "- [ ] Verify changelog"
  } >> .cache/checklist
}

main "$@"
