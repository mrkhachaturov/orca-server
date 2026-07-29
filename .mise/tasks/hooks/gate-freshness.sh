#!/usr/bin/env bash
#MISE description="PreToolUse: refuse a gate run from a branch behind main"
#MISE dir="{{config_root}}"

# Gating before a rebase pays for the whole matrix twice: the rebase resets every check.

set -uo pipefail

command=$(jq -r '.tool_input.command // ""' 2> /dev/null)

case $command in
  *"mise run check"* | *"mise run ci"* | *"mise run test:"* | *"hk run check"*) ;;
  *) exit 0 ;;
esac

behind=$(git rev-list --count HEAD..origin/main 2> /dev/null || echo 0)
[[ $behind =~ ^[0-9]+$ ]] || exit 0
((behind > 0)) || exit 0

read -r -d '' reason << EOF
The branch is $behind commit(s) behind origin/main.

Rebase before gating: \`gh pr update-branch --rebase\` for an open pull request, or
\`git rebase origin/main\` locally. Then run the gate.

Why: branch protection refuses a merge from a branch that is behind, and a rebase resets every
CI check. Gating now means running the whole matrix twice, including both AppImage builds.
EOF

jq -nc --arg r "$reason" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
