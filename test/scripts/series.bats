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
