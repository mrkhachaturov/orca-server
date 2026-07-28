#!/usr/bin/env bash
#MISE alias="down"
#MISE description="Return lib/orca to pristine upstream"
#MISE dir="{{config_root}}"
set -Eeuo pipefail

# Both halves: the overlay's copies are untracked in the submodule, so a pop
# leaves them behind.
quilt pop -a > /dev/null 2>&1 || true
mise run overlay --clean
