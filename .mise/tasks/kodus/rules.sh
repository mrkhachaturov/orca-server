#!/usr/bin/env bash
#MISE description="Push .kody/rules/*.md into Kodus — create on first run, update after"
#MISE dir="{{config_root}}"

# The server mints the uuid; it is written back into the frontmatter, so a second run
# updates rather than duplicates.

set -Eeuo pipefail

RULES_DIR=.kody/rules

function repo_id() {
  kodus config remote list --json | jq -r --arg slug "$1" '.[] | select(.fullName == $slug) | .id'
}

function frontmatter() {
  awk 'NR == 1 && /^---$/ { f = 1; next } f && /^---$/ { exit } f' "$1"
}

function body() {
  awk 'NR == 1 && /^---$/ { f = 1; next } f && /^---$/ { f = 0; b = 1; next } b' "$1"
}

function field() {
  printf '%s\n' "$2" | sed -n "s/^$1:[[:space:]]*//p" | sed 's/^"//;s/"$//'
}

# `path: ["a", "b"]` -> `a,b`. Kodus fires a rule on files matching any comma-listed glob.
function globs() {
  printf '%s\n' "$1" | tr -d '[]"' | tr -d ' '
}

# The frontmatter spells it pull-request; the API wants a space.
function api_scope() {
  case $1 in
    pull-request) printf 'pull request' ;;
    file) printf 'file' ;;
    *)
      echo "unknown scope '$1' — use file or pull-request" >&2
      return 1
      ;;
  esac
}

# Without a uuid line there is nowhere to record identity, so every run would duplicate.
function stamp_uuid() {
  local file=$1 uuid=$2
  grep -q '^uuid:' "$file" || {
    echo "$file has no uuid field — add \`uuid: \"\"\` to its frontmatter" >&2
    return 1
  }
  sed -i.bak "s|^uuid: .*|uuid: \"$uuid\"|" "$file"
  rm -f "$file.bak"
}

# The schema has isRequestChangesActive but no threshold — the one setting the file can't carry.
function apply_settings() {
  kodus config remote set . review.requestChanges.minSeverity critical > /dev/null
  echo "settings requestChanges.minSeverity=critical"
}

function main() {
  local slug id fm rule_body title scope path severity uuid out
  # Both remote shapes, with or without the .git suffix.
  slug=$(git remote get-url origin | sed -e 's|\.git$||' -e 's|/$||' -e 's|.*[:/]\([^/]*/[^/]*\)$|\1|')
  id=$(repo_id "$slug")
  [ -n "$id" ] || {
    echo "$slug is not a repository Kodus knows — add it with \`kodus config -r .\`" >&2
    return 1
  }
  echo "repository $slug -> $id"

  for file in "$RULES_DIR"/*.md; do
    fm=$(frontmatter "$file")
    rule_body=$(body "$file")
    title=$(field title "$fm")
    scope=$(api_scope "$(field scope "$fm")")
    path=$(globs "$(field path "$fm")")
    severity=$(field severity_min "$fm")
    uuid=$(field uuid "$fm")

    if [ -n "$uuid" ]; then
      kodus rules update --uuid "$uuid" --repo-id "$id" --title "$title" \
        --rule "$rule_body" --severity "$severity" --scope "$scope" --path "$path" \
        --json > /dev/null
      echo "updated  $title"
    else
      out=$(kodus rules create --repo-id "$id" --title "$title" \
        --rule "$rule_body" --severity "$severity" --scope "$scope" --path "$path" --json)
      stamp_uuid "$file" "$(printf '%s' "$out" | jq -r '.uuid')"
      echo "created  $title"
    fi
  done

  apply_settings
}

main "$@"
