<!-- prettier-ignore-start -->
<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
# Contributing

- [Requirements](#requirements)
- [Development workflow](#development-workflow)
  - [Working on a patch](#working-on-a-patch)
  - [Version updates to Orca](#version-updates-to-orca)
  - [Build](#build)
- [Test](#test)
  - [Series tests](#series-tests)
  - [Acceptance tests](#acceptance-tests)
  - [End-to-end tests](#end-to-end-tests)
- [Structure](#structure)
  - [Modifications to Orca](#modifications-to-orca)
  - [Keep changes out of the series when you can](#keep-changes-out-of-the-series-when-you-can)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->
<!-- prettier-ignore-end -->

## Requirements

- `git`, with support for submodules
- [`mise`](https://mise.jdx.dev), which pins the rest of the host toolchain
- `quilt`, to manage the patch series. It is in neither the mise registry nor the pkgx pantry, so install it from your
  package manager: `brew install quilt` on macOS, `apt-get install quilt` on Debian and Ubuntu.
- Docker with buildx, to build the AppImage
- A Linux x86_64 host, if you want to run the end-to-end test. The artifact is a Linux binary and will not run anywhere
  else.

## Development workflow

```bash
git clone https://github.com/mrkhachaturov/orca-server.git
cd orca-server
git submodule update --init   # fetches Orca at the pinned tag into lib/orca
mise install
quilt push -a                 # applies the series to lib/orca
```

`lib/orca` is now a working Orca tree with our changes on it. It will show as dirty in `git status` and that is expected:
the changes live in `patches/`, never in a commit inside the submodule.

To get back to pristine upstream, run `quilt pop -a`. That is also how you compare behaviour against stock Orca, and it
is faster and more honest than keeping a second checkout around.

### Working on a patch

Never edit a file in `patches/` by hand. Let quilt write it.

```bash
quilt new my-capability.diff              # creates the patch and makes it current
quilt add lib/orca/src/main/some-file.ts  # BEFORE you touch the file
# ...edit the file...
quilt refresh                             # writes your changes into the current patch
```

The `quilt add` step is the whole point. It saves the file as it was, so `refresh` can only ever produce that one
patch's own diff. It cannot swallow changes belonging to a later patch, which is the failure that hand-exported patches
are prone to and that nobody notices until an upstream bump.

To change an existing patch, pop back to it first:

```bash
quilt pop my-capability.diff   # or: quilt pop -a && quilt push my-capability.diff
# ...edit...
quilt refresh
quilt push -a                  # confirm the rest of the series still applies
```

Three rules the tests enforce:

Every patch opens with a rationale header, the free text above the first `Index:` line. Say what the patch does, why the
behaviour it fixes is wrong without it, and how to check. Name the test file it carries.

Every patch leaves the build working on its own. Patches may depend on each other, but no intermediate state may be
broken, or the series cannot be bisected or reordered.

Patch names describe a capability. Order is data, and it lives in `patches/series`. Nothing is numbered, so nothing ever
has to be renumbered.

### Version updates to Orca

```bash
VERSION=v1.4.157 ./ci/build/update-orca.sh
```

The script unapplies the series, moves the submodule to the new tag, then pushes each patch and refreshes it against the
new base. It stops at the first patch that will not apply. Resolve that one by hand:

```bash
quilt push -f     # force-apply; rejected hunks land in *.rej
# ...apply the rejects by hand...
quilt refresh
./ci/build/update-orca.sh   # re-run to continue through the rest
```

A patch applying is not a reason to keep it. Every bump is the moment to decide, for each patch, whether to keep it,
shrink it, merge it into another, or drop it because upstream has since shipped the behaviour. Record the decision in
`CHANGELOG.md`. The scheduled workflow opens a pull request for this and deliberately never merges it.

### Build

```bash
./ci/build/build-appimage.sh   # writes dist/orca-server-<tag>-x86_64.AppImage
```

The build reads the version off the submodule, checks that the whole series is applied, and then runs Orca's own
`build:desktop`, which typechecks. That typecheck is what actually proves the series still fits upstream.

## Test

```bash
./ci/dev/lint-scripts.sh   # shellcheck over every tracked shell script
./ci/dev/test-scripts.sh   # series integrity
./ci/dev/test-unit.sh      # the acceptance tests the patches carry
./ci/dev/test-e2e.sh       # boot the built AppImage and fetch the web client
```

### Series tests

`test/scripts/series.bats` checks the things a reviewer cannot see by reading a diff: that every entry in `series`
resolves, that no patch applies with fuzz, that every patch carries a rationale header, and that a `quilt refresh` of
each patch changes nothing. That last one is the important one. It means a stale or hand-edited patch fails CI instead
of sitting in the tree until someone bumps upstream and cannot work out why the tree no longer matches.

### Acceptance tests

Ours live inside the patches, in Orca's tree, and run under Orca's own vitest. That is forced by what they test: RPC
methods, surface builders, ownership resolvers, none of which are reachable from outside the process. `test-unit.sh`
reads the file list out of the series, so adding a patch adds its tests without touching the runner.

The trade is that these tests restack on every bump. In exchange, a patch already carries the test an upstream pull
request would need.

Upstream's full suite is not green under parallel load, even on a pristine tag. Before blaming a patch for a failure,
run `pnpm test` inside `lib/orca` with the series popped and compare.

### End-to-end tests

`test-e2e.sh` extracts the built AppImage, starts it under Xvfb and D-Bus, and waits for `GET /web-index.html`. It also
asserts the listener is on loopback, because in trusted-proxy mode a bind to `0.0.0.0` means the mode silently did not
take effect. Linux only.

## Structure

This repository has no source of its own. Orca is a git submodule at `lib/orca`, pinned to a release tag, and every
change is a file in [patches](../patches) applied with quilt. The submodule commit is the only place the version is
recorded; no build file repeats it.

The AppImage is built in a Docker sandbox so its glibc floor comes from Debian bookworm rather than from whichever
runner happened to build it.

### Modifications to Orca

Orca is an Electron app whose UI talks to the main process over IPC. Its web client swaps that preload for one that
translates the same calls into runtime RPC, and upstream has only wired up part of it. Calls with no RPC behind them
fall through a proxy that returns `undefined`, so the feature does nothing and reports no error. Most of the series
closes one of those gaps.

Three patches are different. They exist because `orca serve` has no renderer at all, so anything the desktop computes in
its store has no equivalent on a headless host and has to be built from what the host itself knows.

One patch, `trusted-proxy-session`, is specific to running behind an authenticating proxy and has no upstream analogue.

If the web client gets finished upstream, most of this series disappears. That is the outcome to aim for, so patches are
written to be acceptable upstream rather than merely to work here.

### Keep changes out of the series when you can

A patch has to be restacked on every upstream bump. Anything that does not need Orca's source should live in this
repository instead, where it costs nothing to carry.

The product rename is the worked example. `ci/build/electron-builder.overlay.cjs` sets `appId` and `productName` through
electron-builder's own `extends`, which deep-merges over upstream's config at build time. Doing the same thing as a
patch would have added a fourteenth file to restack forever.
