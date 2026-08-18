#!/usr/bin/env bash
#MISE description="PreToolUse: name the mirror when a search targets Orca's tree"
#MISE dir="{{config_root}}"
#MISE raw=true

# A nudge, never a refusal: grep stays right for a git rev, non-symbol text and an
# unindexed tree.

set -uo pipefail

payload=$(cat)
tool=$(jq -r '.tool_name // ""' <<< "$payload" 2> /dev/null)

case $tool in
  Grep)
    target=$(jq -r '[.tool_input.path?, .tool_input.glob?] | map(select(. != null)) | join(" ")' <<< "$payload" 2> /dev/null)
    ;;
  Bash)
    target=$(jq -r '.tool_input.command // ""' <<< "$payload" 2> /dev/null)
    # Only a search command earns the note; `git -C lib/orca log` does not.
    # The pattern lives in a variable: `;`, `&` and `(` break parsing inline.
    search_re='(^|[[:space:]|;&(])(grep|egrep|fgrep|rg|ag)([[:space:]]|$)'
    [[ $target =~ $search_re ]] || exit 0
    ;;
  *) exit 0 ;;
esac

[[ $target == *lib/orca* || $target == *.cache/orca-* ]] || exit 0

read -r -d '' context << 'EOF'
Sourcegraph indexes this tree: repo orca-mirror, rev:patched (pin + series + overlay) and
rev:pristine (pin bare). Ask it for symbols, callers and references — precise navigation crosses
the patch boundary. Keep grep for a git rev, non-symbol text and uncommitted work.
EOF

jq -nc --arg c "$context" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$c}}'
