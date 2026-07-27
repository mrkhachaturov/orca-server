<!--
Please link to the issue this PR solves.
If there is no existing issue, please first create one unless the fix is minor.

Please make sure the base of your PR is the default branch!
-->

Fixes #

## What this changes

<!-- One or two lines. A patch's rationale header carries the detail; do not repeat it here. -->

## Owner

<!-- Tick one. `mise run owner <path>` names it for you. -->

- [ ] `patches/` — modifies a file that exists upstream. Managed with quilt, never edited by hand.
- [ ] `src/` — a file upstream does not have, copied into the tree by the overlay.
- [ ] Neither — docs, CI or tooling.

## Checks

- [ ] `mise run check` passes.
- [ ] A test fails without this change and passes with it. If it is a patch, the header names that test.
- [ ] Nothing in the patch could have lived in `src/` instead.

<!--
The last one is the one that matters. A patch is restacked and re-justified on every upstream bump,
for as long as it exists; an overlay file never is. See docs/CONTRIBUTING.md, "Keep changes out of
the series when you can".
-->
