#!/usr/bin/env bash
#MISE description="Series integrity — 10 checks over patches, series and the tree"
#MISE dir="{{config_root}}"
#MISE depends=["overlay"]
# Not "up": this pops and pushes the series itself. But check 5 looks for the
# tests a header names, and an overlay test only exists under lib/orca once
# copied — without this it passes only on a tree somebody already assembled.
set -euo pipefail

main() {
  bats ./test/scripts
}

main "$@"
