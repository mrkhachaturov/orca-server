#!/usr/bin/env bash
#MISE description="Every test beside a directory either owner touches"
#MISE dir="{{config_root}}"
#MISE depends=["up"]
set -euo pipefail

# A patch breaks tests it never names: one module-scope import took out 411 while
# the series' own tests stayed green.
main() {

  source ./.mise/lib.sh

  local expected applied
  expected="$(grep -cv '^[[:space:]]*\(#\|$\)' patches/series)"
  applied="$(quilt applied 2> /dev/null | wc -l | tr -d ' ')"
  if [[ $applied != "$expected" ]]; then
    echo >&2 "only $applied of $expected patches are applied — run: quilt push -a"
    exit 1
  fi

  # Both owners: a directory holding only overlay files would otherwise get no
  # coverage at all.
  local dirs
  dirs="$({
    quilt files -a | sed 's|^lib/orca/||'
    [ -d src ] && find src -type f
  } | grep -E '^src/.*\.tsx?$' | xargs -n1 dirname | sort -u)"

  if [[ -z $dirs ]]; then
    echo >&2 "neither the series nor the overlay touches any src/ file"
    exit 1
  fi

  pushd lib/orca

  # Direct neighbours only: a directory handed to vitest is a path substring, so
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
