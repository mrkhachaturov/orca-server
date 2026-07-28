#!/usr/bin/env bash
#MISE alias="overlay"
#MISE description="Copy our own source into the patched Orca tree"
#MISE dir="{{config_root}}"

# Runs AFTER `quilt push -a`, never before.
#
# `--clean` exists because `quilt pop -a` does NOT undo a copy: the files are
# untracked in the submodule and survive a pop.

set -Eeuo pipefail

OVERLAY_ROOT=src
TARGET=lib/orca

function overlay_files() {
  [ -d "$OVERLAY_ROOT" ] || return 0
  find "$OVERLAY_ROOT" -type f | sed "s|^$OVERLAY_ROOT/||" | sort
}

# Every path any patch touches, relative to the overlay root.
function patched_files() {
  local p
  while read -r p; do
    [ -n "$p" ] || continue
    quilt files "$p" 2> /dev/null || true
  done < <(grep -v '^[[:space:]]*\(#\|$\)' patches/series) \
    | sed -n "s|^lib/orca/$OVERLAY_ROOT/||p" | sort -u
}

# The overlay copies last, so a path owned by both would silently overwrite the
# patch's result.
function check_disjoint() {
  local both
  both=$(comm -12 <(overlay_files) <(patched_files))
  if [ -n "$both" ]; then
    echo "error: these paths are owned by BOTH a patch and the overlay:" >&2
    # shellcheck disable=SC2001  # indenting every line of a multi-line value is
    # not a substring replacement; ${var//} cannot express it.
    echo "$both" | sed 's/^/  /' >&2
    echo "move the change into the overlay file, or delete the overlay copy." >&2
    return 1
  fi
}

function copy_in() {
  local dest=$1 f
  while read -r f; do
    [ -n "$f" ] || continue
    mkdir -p "$(dirname "$dest/$OVERLAY_ROOT/$f")"
    cp "$OVERLAY_ROOT/$f" "$dest/$OVERLAY_ROOT/$f"
  done < <(overlay_files)
}

# A path the overlay owns that git tracks is upstream's — refuse, never delete.
function clean_out() {
  local f target removed=0 tracked=""
  while read -r f; do
    [ -n "$f" ] || continue
    target="$TARGET/$OVERLAY_ROOT/$f"
    [ -e "$target" ] || continue
    if git -C "$TARGET" ls-files --error-unmatch "$OVERLAY_ROOT/$f" > /dev/null 2>&1; then
      tracked="$tracked $OVERLAY_ROOT/$f"
      continue
    fi
    rm -f "$target"
    removed=$((removed + 1))
  done < <(overlay_files)

  find "$TARGET/$OVERLAY_ROOT" -type d -empty -delete 2> /dev/null || true

  if [ -n "$tracked" ]; then
    echo "error: upstream now tracks a path the overlay owns:$tracked" >&2
    echo "not deleting it. decide whether ours is still needed." >&2
    return 1
  fi
  echo "overlay: removed $removed files from $TARGET/$OVERLAY_ROOT"
}

function main() {

  case ${1-} in
    --check)
      check_disjoint
      echo "overlay: $(overlay_files | wc -l | tr -d ' ') files, disjoint from patches"
      ;;
    --clean)
      clean_out
      ;;
    --into)
      [ -n "${2-}" ] || {
        echo "usage: mise run overlay --into <root>" >&2
        return 1
      }
      [ -d "$2" ] || {
        echo "no such tree: $2" >&2
        return 1
      }
      copy_in "$2"
      echo "overlay: copied $(overlay_files | wc -l | tr -d ' ') files into $2/$OVERLAY_ROOT"
      ;;
    "")
      check_disjoint
      copy_in "$TARGET"
      echo "overlay: copied $(overlay_files | wc -l | tr -d ' ') files into $TARGET/$OVERLAY_ROOT"
      ;;
    *)
      echo "usage: mise run overlay [--check | --clean | --into <root>]" >&2
      return 1
      ;;
  esac
}

main "$@"
