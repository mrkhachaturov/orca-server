#!/usr/bin/env bash
#MISE description="Series integrity — 10 checks over patches, series and the tree"
#MISE dir="{{config_root}}"
set -euo pipefail

main() {
  bats ./test/scripts
}

main "$@"
