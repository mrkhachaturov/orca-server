#!/usr/bin/env bash
#MISE description="Typecheck the assembled tree — the gate for src/"
#MISE dir="{{config_root}}"
#MISE depends=["up"]
set -Eeuo pipefail

# vitest transpiles and never typechecks, so this is the only gate for src/:
# an overlay file cannot fail to apply, and does break when upstream renames
# something it imports.
cd lib/orca

# A stale build-info file hides errors in code you just wrote. Not
# `rm config/*.tsbuildinfo` — that aborts the chain under zsh when nothing matches.
find config -name '*.tsbuildinfo' -delete

pnpm run typecheck:tsc
