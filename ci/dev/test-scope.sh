#!/usr/bin/env bash
set -euo pipefail

# Run the tests that sit beside the files the series touches, not only the tests
# it ships. A patch breaks tests it never names: one import at module scope took
# out 411 tests while the series' own tests stayed green.
main() {
  cd "$(dirname "$0")/../.."

  source ./ci/lib.sh

  local expected applied
  expected="$(grep -cv '^[[:space:]]*\(#\|$\)' patches/series)"
  applied="$(quilt applied 2> /dev/null | wc -l | tr -d ' ')"
  if [[ $applied != "$expected" ]]; then
    echo >&2 "only $applied of $expected patches are applied — run: quilt push -a"
    exit 1
  fi

  # The overlay has to be in the tree before its neighbours can be found.
  ./ci/build/overlay.sh > /dev/null

  # Both owners count. A patch modifies an upstream file; the overlay adds one of
  # ours. Either way the tests beside it are in scope, and a directory that holds
  # only overlay files would otherwise get no coverage at all.
  local dirs
  dirs="$( {
    quilt files -a | sed 's|^lib/orca/||'
    [ -d src ] && find src -type f
  } | grep -E '^src/.*\.tsx?$' | xargs -n1 dirname | sort -u)"

  if [[ -z $dirs ]]; then
    echo >&2 "neither the series nor the overlay touches any src/ file"
    exit 1
  fi

  pushd lib/orca

  # Direct neighbours only. A directory handed to vitest is a path substring, so
  # src/main would pull in every subtree below it — 79% of upstream's suite.
  local files
  files="$(while read -r d; do
    [[ -d $d ]] && find "$d" -maxdepth 1 \( -name '*.test.ts' -o -name '*.test.tsx' \)
  done <<< "$dirs" | sort -u)"

  echo "$(echo "$files" | wc -l | tr -d ' ') test files beside $(echo "$dirs" | wc -l | tr -d ' ') touched directories"

  # config/vitest.config.ts is the only config that maps the @/ alias.
  # shellcheck disable=SC2086
  pnpm exec vitest run --config config/vitest.config.ts $files
  popd
}

main "$@"
