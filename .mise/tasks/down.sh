#!/usr/bin/env bash
#MISE description="Return lib/orca to pristine upstream"
#MISE dir="{{config_root}}"
set -Eeuo pipefail

# Both halves are needed. The overlay's copies are untracked in the submodule, so
# popping the series leaves them behind and the tree is not pristine.
quilt pop -a > /dev/null 2>&1 || true
mise run overlay --clean
