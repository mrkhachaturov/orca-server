---
name: orca-patch-audit
description: >-
  Decide WHERE a change belongs before writing it — the `src/` overlay if the file is ours, else
  which patch in `patches/series` already owns those symbols, or a new patch. Also audits the series against itself and
  against upstream, and decides keep/shrink/merge/drop when the submodule pin moves. Run before
  authoring. A patch applying cleanly is not acceptance: it can apply and still be redundant or
  already shipped upstream.
when_to_use: >-
  After diagnosis names the symbols you will change and before writing code; on an upstream bump
  before refreshing patches; periodically to find coupled patches. Triggers: "which patch should
  this go in", "new patch or extend", "does upstream already do this", "audit the series",
  "what changed upstream", "can we drop this patch".
---

# Patch audit — where a change belongs, and what the series should still be

Runs before authoring. Deciding placement afterwards only reports the coupling you already built.

## Placement

Diagnose first: placement is answered with the symbol list in hand.

**Which owner, before which patch.** A file that already exists upstream is modified by a patch. A
file that does not is ours and lives in the `src/` overlay, checked in plain and never in a patch.
No path may be in both; `./ci/build/overlay.sh --check` fails if one is.

```bash
git -C lib/orca ls-files --error-unmatch src/<path>   # exit 0: upstream's, so a patch. exit 1: ours, so the overlay
```

```bash
quilt annotate lib/orca/<file>          # line → patch number, legend at the end
quilt patches  lib/orca/<file>          # every patch that touches this file
quilt files    <patch>.diff             # every upstream file that patch modifies
```

Those three see the patch half only — an overlay file has no annotation and appears in no patch. A
new module belongs to the capability that imports it, so read the link backwards:

```bash
grep -lE "from '[^']*/<module>'" patches/*.diff   # the patch that wires an overlay module in
```

**Symbols decide. Files inform.** `web-preload-api.ts` is touched by 9 of 13 patches, so a shared
file is the normal case and produces a reading list. A shared *symbol* means one capability is
being split in two.

| What `quilt annotate` shows for your symbols | Verdict |
|---|---|
| a patch number already on those lines | extend that patch: edit the tree, `quilt refresh` that patch, no new entry |
| numbers from several patches | one capability split across them — merge, or extend the earliest |
| nothing | new patch, after reading what `quilt patches` lists for the files |

Patch size never decides. Size is what restacking costs.

## Series audit

| Question | Command |
|---|---|
| Is any patch stale, fuzzy, or unlisted? | `./ci/dev/test-scripts.sh` — 10 checks, including that every file in the tree has an owner |
| Which patches are coupled, and through what? | `quilt graph --all --edge-labels=files` |
| How much does a patch modify? | `quilt files <patch>.diff \| wc -l` |
| Which files did we add rather than modify? | `find src -type f` — that is the whole answer |
| Who owns this file? | `./ci/dev/owner.sh <path>` |
| Which symbols are ours inside an upstream file? | `quilt annotate lib/orca/<path>` — owner per line, legend at the end |
| Does upstream already have a mechanism we reimplement? | `git -C lib/orca grep -n '<words>' <pinned tag>` |

`quilt graph` reports every edge; rank them and work top-down. Shared symbols in one subject area
mean merge. Shared files alone are normal.

Anything that enumerates the series by scanning `patches/*.diff` or `quilt files` under-reports what
we own — 29 of our 91 files are in the overlay, and none of them is in a patch. Both owners:

```bash
{ grep -h '^+++ orca-server/lib/orca/' patches/*.diff \
    | sed 's|^+++ orca-server/lib/orca/||;s/[[:space:]].*$//'
  find src -type f
} | sort -u
```

## When the pin moves

Each patch's acceptance lives in its own rationale header: the *To test* line and the test files it
names in backticks. A test that adds a file is an overlay file, so counting the tests a patch
contains measures nothing — the header naming is the only link between a capability and its
instrument. Recompute what each patch claims rather than trusting a list:

```bash
for p in $(grep -v '^[[:space:]]*\(#\|$\)' patches/series); do
  printf '%-38s %s\n' "$p" "$(quilt header "$p" \
    | grep -oE '`[A-Za-z0-9._/-]+\.test\.tsx?`' | tr -d '`' | sort -u | tr '\n' ' ')"
done
```

A patch naming no test cannot be dropped, shrunk or merged — give it one first. `test-scripts.sh`
check 5 already fails on a patch that names none, and on a named file that does not exist; whether
that test fails without the patch stays a review question.

Spend the effort where upstream actually moved:

```bash
git -C lib/orca diff <oldpin>..<newtag> --stat -- $(quilt files -a \
  | sed 's|^lib/orca/||' | sort -u | tr '\n' ' ')
```

`quilt files -a` is the whole list that matters here: an overlay path has no upstream counterpart,
so upstream cannot have moved it.

Apply in order; the first match wins.

1. **Drop — prove it.** Build a worktree at the new tag with no patches applied, run this patch's
   test and its *To test* repro there. The test is an overlay file, so copy the overlay in or the
   probe cannot find it. Green on bare upstream means upstream shipped it: delete the `.diff`,
   remove its line from `patches/series`, and record the probe in `CHANGELOG.md`.
   ```bash
   git -C lib/orca worktree add --detach .cache/probe <newtag>
   ./ci/build/overlay.sh --into .cache/probe
   ```
2. **Shrink** — the probe fails, but the new tag has a mechanism this patch reimplements. Look for
   one in `.cache/probe` before assuming there is none: `git -C lib/orca diff <oldtag>..<newtag>
   --stat -- src/` names where upstream moved, and `git -C .cache/probe grep -n '<words>'` searches
   what it moved to. Rewrite to call upstream's, delete one hunk group at a time, re-run the test
   after each; anything removable with the test green was dead weight.
3. **Merge** — two patches share symbols in one capability and neither test passes without the
   other. Two patches whose tests each pass alone are two capabilities sharing a file.
4. **Keep** — `quilt push` it and `quilt refresh` if `./ci/dev/test-scripts.sh` flagged it.

`./ci/build/update-orca.sh` restacks the series onto a new tag and stops at the first patch that
will not apply. It decides nothing: every verdict above is still yours to make.

## Evidence status

Name matching, graph queries and `quilt graph` edges say where to look. Whether a patch is still
needed is settled by running its test. `quilt annotate` is different in kind: it is exact ownership
from `.pc/`, so act on it directly.
