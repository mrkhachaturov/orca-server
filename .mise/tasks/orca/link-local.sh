#!/usr/bin/env bash
#MISE alias="link-local"
#MISE description="Symlink the gitignored local config from the primary checkout into a new worktree"
#MISE dir="{{config_root}}"

set -Eeuo pipefail

PATHS=(
  .cache
  mise.local.toml
  mise.local.lock
  .mcp.json
  CLAUDE.local.md
  AGENTS.override.md
  .codex/config.toml
  .codex/hooks.json
  .agents/skills/orca-wiki
  .claude/commands
  .claude/skills/orca-wiki
  .claude/settings.local.json
  .claude/findings.md
)

root="${ORCA_ROOT_PATH:-}"
worktree="${ORCA_WORKTREE_PATH:-}"

if [ -z "$root" ] || [ -z "$worktree" ] || [ "$root" = "$worktree" ]; then
  exit 0
fi

for rel in "${PATHS[@]}"; do
  src="$root/$rel"
  dst="$worktree/$rel"
  [ -e "$src" ] || continue
  if [ -e "$dst" ] || [ -L "$dst" ]; then
    continue
  fi
  mkdir -p "$(dirname "$dst")"
  ln -s "$src" "$dst"
  echo "linked $rel"
done
