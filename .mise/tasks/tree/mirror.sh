#!/usr/bin/env bash
#MISE alias="mirror"
#MISE description="Publish the assembled tree to the Sourcegraph mirror"
#MISE dir="{{config_root}}"
#MISE depends=["up"]

# Publishes only. No gate reads the mirror and the build never touches it — a
# stale mirror costs search, not CI.
#
# Two refs of one repo, so `pristine` and `patched` can be diffed as revisions:
#   pristine       the pin, bare upstream
#   patched        the pin + the series + the overlay
#   patched-<tag>  that same tree, kept as a snapshot
#
# Tags arrive one per bump, never by fetching upstream: run this on an update/* branch
# and the mirror carries that release before the pull request merges.
#
#   mise run mirror

set -Eeuo pipefail

MIRROR=.cache/orca-mirror
REMOTE="${ORCA_MIRROR_REMOTE:-https://github.com/mrkhachaturov/orca-mirror.git}"

# A clone of the submodule, not a fetch from GitHub: the tags are already here.
function prepare_clone() {
  if [ ! -d "$MIRROR/.git" ]; then
    git clone --quiet "$PWD/lib/orca" "$MIRROR"
    git -C "$MIRROR" remote rename origin submodule
    git -C "$MIRROR" remote add origin "$REMOTE"
    # quilt's internal data must not reach the published tree.
    echo '.pc/' >> "$MIRROR/.git/info/exclude"
  else
    git -C "$MIRROR" remote set-url origin "$REMOTE"
    git -C "$MIRROR" fetch --quiet submodule --tags --prune
  fi
}

# Copies the assembled tree, never rebuilds it. The patches are written against
# the superproject, where the files sit under lib/orca/ — a strip level the
# mirror does not have. `depends = ["up"]` is what guarantees it is assembled.
function build_tree() {
  git -C "$MIRROR" checkout --quiet --force -B patched "$tag"
  git -C "$MIRROR" reset --hard --quiet "$tag"
  git -C "$MIRROR" clean --quiet -fd
  rsync --archive --delete --exclude .git --exclude .pc lib/orca/ "$MIRROR/"
}

function publish() {
  git -C "$MIRROR" add --all
  git -C "$MIRROR" -c user.name='orca-server' -c user.email='mirror@localhost' \
    commit --quiet --message "patched $tag" --allow-empty
  # Annotated and unsigned explicitly: the machine's git config may force either.
  git -C "$MIRROR" -c tag.gpgSign=false -c user.name='orca-server' -c user.email='mirror@localhost' \
    tag --force --annotate --message "patched $tag" "patched-$tag" > /dev/null

  git -C "$MIRROR" push --quiet --force origin patched
  # `^{}` dereferences the annotated tag: a branch must point at a commit, and
  # GitHub rejects one that points at a tag object.
  git -C "$MIRROR" push --quiet --force origin "$tag^{}:refs/heads/pristine"
  git -C "$MIRROR" push --quiet --force origin "refs/tags/$tag" "refs/tags/patched-$tag"
}

function main() {

  source ./.mise/lib.sh

  local tag
  tag="v$(orca_version)"

  # A submodule's .git is a file pointing at the superproject, never a directory.
  [ -e lib/orca/.git ] || {
    echo >&2 "no submodule at lib/orca"
    return 1
  }

  echo "mirror: $tag -> $REMOTE"
  prepare_clone
  build_tree
  publish

  echo "mirror: pristine=$tag patched=$(git -C "$MIRROR" rev-parse --short patched)"
}

main "$@"
