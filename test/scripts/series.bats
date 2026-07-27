#!/usr/bin/env bats

# Integrity of the patch series itself. These are the checks that used to live
# only in a human's (or an agent's) head: that the committed patches are exactly
# what a clean `quilt push -a` produces, that nothing on disk is orphaned, and
# that every patch says why it exists.
#
# They run without touching the submodule's working tree except through quilt,
# and they restore whatever state they found.

ROOT="$BATS_TEST_DIRNAME/../.."
PATCHES="$ROOT/patches"

setup_file() {
  cd "$ROOT" || exit 1
  # Remember what was applied so the suite is a no-op on a dev machine mid-work.
  QUILT_STATE_TOP="$(quilt top 2> /dev/null || true)"
  export QUILT_STATE_TOP
}

teardown_file() {
  cd "$ROOT" || exit 1
  quilt pop -a > /dev/null 2>&1 || true
  if [ -n "${QUILT_STATE_TOP:-}" ]; then
    quilt push "$QUILT_STATE_TOP" > /dev/null 2>&1 || true
  fi
}

series_entries() {
  grep -v '^[[:space:]]*\(#\|$\)' "$PATCHES/series"
}

@test "series file exists" {
  [ -f "$PATCHES/series" ]
}

@test "every entry in series exists on disk" {
  local missing=""
  while read -r p; do
    [ -f "$PATCHES/$p" ] || missing="$missing $p"
  done < <(series_entries)
  [ -z "$missing" ] || {
    echo "listed in series but not on disk:$missing"
    false
  }
}

@test "every patch on disk is listed in series" {
  local orphan=""
  for f in "$PATCHES"/*.diff; do
    local base
    base="$(basename "$f")"
    series_entries | grep -qxF "$base" || orphan="$orphan $base"
  done
  [ -z "$orphan" ] || {
    echo "on disk but not in series:$orphan"
    false
  }
}

@test "patch names carry no ordinal prefix" {
  # Order is data in series, never a filename convention. A numbered name means
  # renumbering has come back.
  local numbered=""
  while read -r p; do
    case "$p" in [0-9]*) numbered="$numbered $p" ;; esac
  done < <(series_entries)
  [ -z "$numbered" ] || {
    echo "ordinal-prefixed patch names:$numbered"
    false
  }
}

@test "every patch names a test file that exists" {
  # Tests live in the overlay, so a patch can no longer prove coverage by
  # containing one. The header names them instead, in backticks — that naming is
  # the only link between a capability and the instrument that measures it.
  #
  # Necessary, not sufficient, and deliberately weaker than it looks: whether the
  # test fails without the patch, and whether it asserts the intended behaviour
  # rather than the observed one, stays a review question. "Carries a test file"
  # passed 13/13 while four patches were untested in substance.
  local bad=""
  while read -r p; do
    local named f
    # shellcheck disable=SC2016  # backticks are literal here: the header quotes
    # test filenames in backticks, and this matches that, not a subshell.
    named="$(quilt header "$p" 2> /dev/null \
      | grep -oE '`[A-Za-z0-9._/-]+\.test\.tsx?`' | tr -d '`' | sort -u)"
    if [ -z "$named" ]; then
      bad="$bad $p(names-none)"
      continue
    fi
    for f in $named; do
      find "$ROOT/lib/orca/src" -name "$f" -print -quit 2> /dev/null | grep -q . \
        || bad="$bad $p:$f(missing)"
    done
  done < <(series_entries)
  [ -z "$bad" ] || {
    echo "test naming:$bad"
    false
  }
}

@test "every patch opens with a rationale header" {
  # quilt keeps free text above the first Index: line. A patch that cannot say
  # why it exists cannot be re-justified on the next upstream bump.
  local bare=""
  while read -r p; do
    head -1 "$PATCHES/$p" | grep -q '^Index:' && bare="$bare $p"
  done < <(series_entries)
  [ -z "$bare" ] || {
    echo "no rationale header:$bare"
    false
  }
}

@test "the whole series applies to the pinned submodule" {
  cd "$ROOT"
  quilt pop -a > /dev/null 2>&1 || true
  run quilt push -a
  [ "$status" -eq 0 ]
}

@test "no patch applies with fuzz" {
  # Fuzz means the patch no longer matches its base and survived on context
  # alone. It is the state right before a silent mis-apply.
  cd "$ROOT"
  quilt pop -a > /dev/null 2>&1 || true
  run quilt push -a
  echo "$output" | grep -qi "with fuzz" && {
    echo "$output" | grep -i "with fuzz"
    false
  }
  [ "$status" -eq 0 ]
}

@test "every patch is refreshed — a rebuild changes nothing" {
  # The committed patch must be byte-identical to what quilt would write now.
  # This is the check that makes a hand-edited or stale patch impossible to hide.
  cd "$ROOT"
  quilt pop -a > /dev/null 2>&1 || true
  local stale=""
  while quilt push > /dev/null 2>&1; do
    local top before after
    top="$(quilt top)"
    before="$(md5 -q "$ROOT/$top" 2> /dev/null || md5sum "$ROOT/$top" | cut -d' ' -f1)"
    quilt refresh > /dev/null 2>&1 || true
    after="$(md5 -q "$ROOT/$top" 2> /dev/null || md5sum "$ROOT/$top" | cut -d' ' -f1)"
    [ "$before" = "$after" ] || stale="$stale $(basename "$top")"
  done
  [ -z "$stale" ] || {
    echo "not refreshed (run quilt refresh and commit):$stale"
    false
  }
}

@test "every file in the submodule tree is owned by a patch or the overlay" {
  # The failure this catches is silent: `quilt add` snapshots what is on disk, so
  # adding a file that was written first records it as unchanged and `quilt
  # refresh` captures nothing. The file keeps working locally — it is in the
  # working tree — while being absent from the series, so a fresh checkout loses
  # it and test:unit, which derives its list from the series, never runs it.
  #
  # Two owners are legitimate. A patch modifies a file that exists upstream; the
  # overlay adds one that does not. Anything owned by neither is the silent case.
  cd "$ROOT"
  quilt pop -a > /dev/null 2>&1 || true
  quilt push -a > /dev/null 2>&1 || true
  mise run overlay > /dev/null

  local owned orphans=""
  owned="$( {
    grep -h '^+++ orca-server/lib/orca/' "$PATCHES"/*.diff \
      | sed 's|^+++ orca-server/lib/orca/||' \
      | sed 's/[[:space:]].*$//'
    [ -d "$ROOT/src" ] && find src -type f
  } | sort -u)"

  local f
  for f in $(git -C lib/orca ls-files -o --exclude-standard); do
    echo "$owned" | grep -qxF "$f" || orphans="$orphans $f"
  done

  [ -z "$orphans" ] || {
    echo "in the tree but in no patch (quilt add BEFORE creating, then refresh):$orphans"
    false
  }
}
