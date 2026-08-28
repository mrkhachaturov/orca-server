#!/usr/bin/env bash
#MISE description="The version operators paste in docs/ is the latest released one"
#MISE dir="{{config_root}}"

# A stale pin is invisible in review and installs a months-old build. The
# released version is CHANGELOG.md's first heading below `## Unreleased`, so
# rolling the changelog is what fires this — the same commit that has to fix it.

set -Eeuo pipefail

main() {
  local latest
  latest="$(sed -n '/^## Unreleased/,$ s/^## \[\([0-9][0-9.]*\)\].*/\1/p' CHANGELOG.md | head -1)"
  if [ -z "$latest" ]; then
    echo >&2 "error: no released version heading below '## Unreleased' in CHANGELOG.md"
    return 1
  fi

  # `VERSION=<x.y.z>` is the download pin. Excludes docs/CONTRIBUTING.md's
  # `VERSION=v1.4.157 mise run bump`, which is an Orca tag, not a release of ours.
  local pins
  pins="$(grep -rn '^VERSION=[0-9]' docs || true)"
  if [ -z "$pins" ]; then
    echo >&2 "error: no 'VERSION=<x.y.z>' pin left in docs/ — this check has lost its target"
    return 1
  fi

  local pin drift=""
  while IFS= read -r pin; do
    [ "${pin##*VERSION=}" = "$latest" ] || drift="$drift $pin"
  done <<< "$pins"

  if [ -n "$drift" ]; then
    echo >&2 "error: docs pin a version that is not the latest release ($latest):"
    local hit
    for hit in $drift; do echo >&2 "  $hit"; done
    echo >&2 "set every 'VERSION=' line in docs/ to $latest, or roll CHANGELOG.md first."
    return 1
  fi
}

main "$@"
