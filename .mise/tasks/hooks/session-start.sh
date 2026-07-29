#!/usr/bin/env bash
#MISE description="SessionStart: publish pin, branch, series and graph state"
#MISE dir="{{config_root}}"
#MISE raw=true

# A graph's head_sha reads live git, so an index built before the pin moved still reports
# the new tag. Staleness is computed here, not asserted.

set -uo pipefail

pin=$(git -C lib/orca describe --tags 2> /dev/null || echo unknown)
branch=$(git branch --show-current 2> /dev/null || echo DETACHED)
applied=$(quilt applied 2> /dev/null | wc -l | tr -d ' ')
expected=$(grep -cv '^[[:space:]]*\(#\|$\)' patches/series 2> /dev/null || echo '?')
behind=$(git rev-list --count HEAD..origin/main 2> /dev/null || echo '?')

read -r -d '' context << EOF
orca-server state: pin=$pin branch=$branch series=${applied:-0}/$expected behind-main=$behind

Each step of the flow has a skill that owns it. Run the skill; do not rebuild its steps.
  capability: orca-patch-audit -> orca-patch-author -> orca-write-test -> orca-patch-verify
  bump:       mise run bump -> orca-patch-audit (keep|shrink|merge|drop) -> the same chain

An unverified claim is labelled unverified. "I did not check" is an acceptable answer.
EOF

jq -nc --arg c "$context" \
  '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$c}}'
