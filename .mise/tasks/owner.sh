#!/usr/bin/env bash
#MISE description="Name the owner of a path: overlay, patch, or upstream"
#MISE dir="{{config_root}}"

# Who owns this file — the overlay, a patch, or upstream alone?
#
#   mise run owner src/shared/open-in-url-template.ts
#   mise run owner lib/orca/src/shared/types.ts
#
# `quilt annotate` cannot answer this. On a file no patch owns it exits 0 and
# prints the file with no attribution, which is indistinguishable from an
# unmodified upstream file — so an overlay file reads as upstream's. This script
# checks both owners and says which, and defers to `quilt annotate` for the
# line-level answer when a patch is involved.

set -Eeuo pipefail

function main() {

  local arg=${1-}
  if [ -z "$arg" ]; then
    echo "usage: mise run owner <path>   (relative to the repo, lib/orca, or src/)" >&2
    return 1
  fi

  # Accept any of the three ways a path gets written around here, and reduce to
  # one form: relative to lib/orca.
  local rel=${arg#./}
  rel=${rel#lib/orca/}

  local found=0

  if [ -f "$rel" ] && [ -d src ] && [[ $rel == src/* ]]; then
    echo "overlay   $rel"
    echo "          ours entirely — upstream has no version of it."
    echo "          edit it here; the copy under lib/orca/ is build output."
    found=1
  fi

  local owners
  owners=$(grep -l "^+++ orca-server/lib/orca/$rel\([[:space:]]\|\$\)" patches/*.diff 2> /dev/null \
    | xargs -n1 basename 2> /dev/null || true)
  if [ -n "$owners" ]; then
    echo "patch     $rel"
    # shellcheck disable=SC2001  # indenting every line of a multi-line value is
    # not a substring replacement; ${var//} cannot express it.
    echo "$owners" | sed 's/^/          /'
    echo "          exists upstream; quilt owns the change. Line-level:"
    echo "          quilt annotate lib/orca/$rel"
    found=1
  fi

  if [ "$found" -eq 0 ]; then
    if git -C lib/orca ls-files --error-unmatch "$rel" > /dev/null 2>&1; then
      echo "upstream  $rel"
      echo "          unmodified. Changing it means a patch: quilt add first."
    else
      echo "unowned   $rel"
      echo "          in no patch and not in src/. If it is in the working tree"
      echo "          it is invisible to a fresh checkout — series.bats fails on"
      echo "          exactly this."
    fi
  fi

  if [ "$found" -eq 2 ]; then
    echo >&2 "error: owned twice. mise run overlay --check explains why that breaks."
    return 1
  fi
}

main "$@"
