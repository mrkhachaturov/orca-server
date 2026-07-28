#!/usr/bin/env bash
#MISE description="PreToolUse: route graph indexing through the cbm tasks"
#MISE dir="{{config_root}}"

# Scoped by its matcher to the indexing MCP tool, so it always denies. Every cbm
# task indexes --mode full, and cbm-patched runs the overlay itself and refuses a
# partly applied series. A direct call skips both and yields a graph that is not
# comparable to its siblings.

set -uo pipefail

read -r -d '' reason << 'EOF'
Index through the task that owns the graph, not the MCP tool:

  mise run cbm-patched              pin + series + overlay
  mise run cbm-pristine             the pin, bare
  VERSION=<tag> mise run cbm-next   a release we have not pinned
  mise run cbm                      both pin graphs, after the pin moves

Why: the tasks index --mode full, and cbm-patched runs the overlay and refuses a partly applied
series. A direct call picks its own mode, so the graph stops being comparable to its siblings —
which is exactly how orca-next ended up indexed at a different fidelity than orca-patched.

After a bump merges, that tag IS the pin: run `mise run cbm` and leave orca-next alone until the
next candidate.
EOF

jq -nc --arg r "$reason" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
