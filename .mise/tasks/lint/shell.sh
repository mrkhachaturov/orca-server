#!/usr/bin/env bash
#MISE description="shellcheck every tracked shell script"
#MISE dir="{{config_root}}"
set -euo pipefail

main() {
  # lib/orca is a gitlink, so git ls-files never descends into upstream's scripts.
  shellcheck -e SC2046,SC2164,SC2154,SC1091,SC1090,SC2002 $(git ls-files '*.sh' '*.bats')
}

main "$@"
