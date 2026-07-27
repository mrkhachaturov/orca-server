#!/usr/bin/env bash
#MISE description="Assemble the tree: apply the series, then copy the overlay in"
#MISE dir="{{config_root}}"
set -Eeuo pipefail

# quilt exits 2 when there is nothing left to push, which is success here.
exit_code=0
quilt push -a > /dev/null 2>&1 || exit_code=$?
case $exit_code in
  0 | 2) ;;
  *)
    echo >&2 "the series does not apply cleanly — fix it before continuing"
    exit $exit_code
    ;;
esac

mise run overlay
