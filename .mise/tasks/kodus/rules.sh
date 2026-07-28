#!/usr/bin/env bash
#MISE description="Push .kody/rules/*.md into Kodus — create on first run, update after"
#MISE dir="{{config_root}}"

# The files are the source of truth; Kodus holds a copy. `kodus rules` is the only
# surface that applies a rule without waiting for a pull request to close, and the
# repo-file importer needs a dashboard toggle that nothing here can set.
#
# The server mints the uuid. It is written back into the file's frontmatter, so a
# second run updates rather than duplicates.

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

# The file template says pull-request; the API wants a space.
function api_scope() {
  [ "$1" = "pull-request" ] && printf 'pull request' || printf 'file'
}

function stamp_uuid() {
  local file=$1 uuid=$2
  sed -i.bak "s|^uuid: \"\"|uuid: \"$uuid\"|" "$file"
  rm -f "$file.bak"
}

# Only critical blocks. Everything below it is advice, because the mechanical gates
# already decide whether the tree is sound and a second opinion should not gate a push.
function apply_settings() {
  kodus config remote set . review.requestChanges.minSeverity critical > /dev/null
  echo "settings requestChanges.minSeverity=critical"
}

function main() {
  local slug id fm rule_body title scope path severity uuid out
  slug=$(git remote get-url origin | sed 's|.*[:/]\([^/]*/[^/]*\)\.git$|\1|')
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
