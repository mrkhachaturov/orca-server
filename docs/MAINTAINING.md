<!-- prettier-ignore-start -->
<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
# Maintaining

- [Releasing](#releasing)
  - [Release candidates](#release-candidates)
- [Upstream bumps](#upstream-bumps)
- [Testing](#testing)
- [Documentation](#documentation)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->
<!-- prettier-ignore-end -->

Orca ships often, so most of the work here is keeping the patch series applied to the current release and deciding what
no longer needs to exist. There is very little feature work. If a capability can be built without touching Orca's
source, it should not be a patch at all.

## Releasing

1. Check that `CHANGELOG.md` lists the changes under `## Unreleased`, and that the Orca version on the line under the
   heading is the one `lib/orca` is pinned to.
2. Go to Actions, Draft release, Run workflow, and give it the Orca tag, for example `v1.4.156`.
3. CI checks that the submodule really is on that tag, applies the series, runs the integrity tests, builds the
   AppImage, and uploads it to a draft release. The release body is the `## Unreleased` section, cut out of the
   changelog by the workflow.
4. Read the draft. Publish it if the notes and the asset are right.
5. In `CHANGELOG.md`, rename `## Unreleased` to the released version with today's date, and open a fresh `## Unreleased`
   above it.

Our version is derived from Orca's, the way code-server derives its version from Code. Orca's major is always 1 and
carries no information, so it goes, and the two components that move stay: `v1.4.156` releases as `v4.156.0`. The last
slot is ours. Re-releasing the same Orca with a changed series is `v4.156.1`, which the workflow does when you set the
`patch` input.

Reading it back is "take the first two fields and prepend `1.`", and that stays true no matter how many times we
re-release. code-server's scheme loses that: their own patch releases move the same slot Code's patch lives in, so
`4.124.2` does not say whether Code was at `1.124.0` or `1.124.2`.

Merging an upstream bump pull request from an `update/*` branch triggers the same workflow, so a bump normally produces
a draft release without anyone asking for one.

### Release candidates

Add an `-rc.<number>` suffix to the version and mark the published release as a pre-release. Leave the changelog on
`## Unreleased` until the final release.

## Upstream bumps

The scheduled workflow opens a pull request every time Orca tags a release. It restacks the series and stops at the
first patch that will not apply. Resolving conflicts is described in [Contributing](./CONTRIBUTING.md).

The part that is not mechanical is the review. A patch applying cleanly says nothing about whether it should still be
there. For each one, ask whether upstream has since shipped the behaviour, whether the patch has grown to cover
something a smaller change would fix, and whether two patches have converged on the same symbols. Write the answer in
the changelog. A bump that only makes the build pass again has skipped the point of the review.

Watch for patches labelled `upstream-fixed` in the issue tracker. Those are the ones a bump can delete outright.

## Testing

`./ci/dev/test-scripts.sh` guards the series and runs in CI on every change to `patches/` or `lib/`. It is the one suite
that has to stay green, because a stale patch is invisible in a diff.

`./ci/dev/test-unit.sh` runs the acceptance tests the patches carry, against the patched tree. Needs `pnpm install`
inside `lib/orca` first, which takes a while, so it is not wired into the pull request build yet.

`./ci/dev/test-e2e.sh` boots the built AppImage and fetches the web client. Linux only, and it needs a build to exist.

## Documentation

Everything under `docs/` is written for people using or contributing to this repository. None of it is upstream's, and
none of it belongs upstream.

Keep [README](./README.md) short. It states what the project is and how to start it, and defers everything else. That
discipline is borrowed from code-server, whose README is eighty lines with 78,000 stars behind it.
