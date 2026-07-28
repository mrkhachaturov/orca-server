---
paths:
  - "patches/**"
  - "lib/orca/src/**"
---

# Quilt mechanics

Loads when a patch or an upstream file is open, because these fail silently at exactly that moment.
The judgement rules — what a patch must prove before it ships — stay in `AGENTS.md`.

- **`quilt add` before touching a file that exists upstream.** An edit to a file not in the current
  patch is invisible to `quilt refresh`: it stays in the working tree and the series does not carry
  it. `series.bats` failing an unowned working-tree file is the only place that surfaces.

  ```bash
  quilt top                      # which patch is on top right now
  quilt files                    # what it already owns — edit only these
  quilt add lib/orca/src/…       # BEFORE the first edit to anything else
  quilt refresh                  # after the edit, or the change is not in the patch
  ```

- **A new file is never a quilt operation.** It goes in `src/`: nothing `quilt add`ed, nothing
  refreshed, nothing that can conflict on a bump. `mise run owner <path>` answers which half owns a
  path.

- **Order in the series is data**, held in `patches/series`. Patches are named for the capability
  they add. Never renumber — reordering is an edit to that file and nothing else. Never put a patch
  identifier in a code comment; name the rule instead, because the identifier moves and the rule
  does not.
