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

## Releasing

1. Rebase the branch on `main` before running any gate. Branch protection refuses a merge from a
   branch that is behind, and the rebase resets every check — gate first and you pay for CI twice.
2. Check that `CHANGELOG.md` lists the changes under `## Unreleased`, and that the Orca version on the line under the
   heading is the one `lib/orca` is pinned to.
3. Actions → Draft release → Run workflow, with the Orca tag, for example `v1.4.156`.
4. CI checks that the submodule is on that tag, applies the series, runs the integrity tests, builds the AppImage, and
   uploads it to a draft release. The release body is the `## Unreleased` section, cut out of the changelog by the
   workflow.
5. Read the draft. Publish it if the notes and the asset are right.
6. In `CHANGELOG.md`, rename `## Unreleased` to the released version with today's date, and open a fresh `## Unreleased`
   above it.

Our version drops Orca's major and keeps the two components that move: `v1.4.156` releases as `v4.156.0`. The last slot
is ours — re-releasing the same Orca with a changed series is `v4.156.1`, which the workflow does when you set the
`patch` input. Read it back by taking the first two fields and prepending `1.`.

Merging an upstream bump pull request from an `update/*` branch triggers the same workflow, so a bump normally produces
a draft release without anyone asking for one.

### Release candidates

Add an `-rc.<number>` suffix to the version and mark the published release as a pre-release. Leave the changelog on
`## Unreleased` until the final release.

## Upstream bumps

The scheduled workflow opens a pull request every time Orca tags a release. It restacks the series and stops at the
first patch that will not apply. Resolving conflicts is described in [Contributing](./CONTRIBUTING.md).

Only `patches/` restacks. Nothing in the overlay can be rejected by a bump; when a bump does break it, an upstream API
it calls has moved, and `mise run test:types` is what says so. A bump that produced no conflicts still has to typecheck.

Then review. For each patch, ask whether upstream has since shipped the behaviour, whether the patch has grown to cover
something a smaller change would fix, whether part of it is new code that belongs in the overlay, and whether two
patches have converged on the same symbols. Write the answer in the changelog.

Patches labelled `upstream-fixed` in the issue tracker are the ones a bump can delete outright.

## Testing

`mise run test:series` guards the series and runs in CI on every change to the tree or the tooling. It is the one suite
that has to stay green, because a stale patch is invisible in a diff. It also enforces the two-owner boundary: every
file in the submodule tree belongs to a patch or to the overlay, and none belongs to both.

`mise run test:unit` runs the acceptance tests the series and the overlay carry. `mise run test:scope` runs upstream's
own tests beside every file either of them touches, which catches a patch breaking tests it never names. Both apply to
the patched tree, both need `pnpm install` inside `lib/orca` first, and both run in the pull request build.

`mise run test:e2e` boots the built AppImage and fetches the web client. Linux only, and it needs a build to exist.

`mise run check` is every gate in one command — the suites above except `test:e2e`, plus `test:types` and `lint`.
`mise run ci` adds the AppImage build after it. The `pre-push` hook is narrower: `test:series` and `lint:docs` only.

## Documentation

Everything under `docs/` is written for people using or contributing to this repository. None of it is upstream's.

Keep [README](./README.md) short: what the project is, how to start it, and a link for everything else.
