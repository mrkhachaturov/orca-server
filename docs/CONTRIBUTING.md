<!-- prettier-ignore-start -->
<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
# Contributing

- [Requirements](#requirements)
- [Development workflow](#development-workflow)
  - [Where a change goes](#where-a-change-goes)
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
mise run up                   # applies the series to lib/orca, then copies our own files in on top
```

`lib/orca` is now a working Orca tree with our changes on it. It will show as dirty in `git status` and that is expected:
the changes live in `patches/` and `src/`, never in a commit inside the submodule.

To get back to pristine upstream, run `mise run down`, which pops the series and then runs `mise run overlay --clean`.
Both halves are needed: the overlay's copies are untracked files in the submodule, so popping the series leaves them
behind. `--clean` removes only the files the overlay owns, and refuses to delete one that upstream has started tracking,
so it will not take anything of yours or theirs with it. That is also how you compare behaviour against stock Orca, and it is faster and more honest
than keeping a second checkout around.

### Where a change goes

Two owners, and upstream decides which one you get.

A file that already exists in Orca is modified by a patch, with quilt. A file that does not exist upstream is ours
outright: a plain `.ts` or `.tsx` file under `src/`, committed like any other source, never `quilt add`ed and never
inside a patch.

`mise run overlay` copies `src/<path>` to `lib/orca/src/<path>`, so an import resolves the same whichever owner a
module has. It runs after `quilt push -a` and copies last, which is why no path may be owned by both:
`mise run overlay --check` asserts that and copies nothing. The series tests check it too, along with the reverse
case — a file in the submodule tree that belongs to neither owner.

This is the split Debian, OpenWrt and Yocto all use: patches for upstream files, an overlay for new ones. code-server
keeps its own product in `src/` for the same reason, but it can test that `src/` standalone because it wraps VS Code.
Ours has to run inside Orca's process, so the overlay is compiled and tested in the patched tree rather than on its own.

### Working on a patch

This is for files that exist upstream. Adding a file of ours is not a quilt operation at all — write it under `src/`.

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
behaviour it fixes is wrong without it, and how to check. Name, in backticks, the test file that covers it — usually one
the overlay owns, since a patch can no longer prove coverage by containing a new test.

Every patch leaves the build working on its own. Patches may depend on each other, but no intermediate state may be
broken, or the series cannot be bisected or reordered.

Patch names describe a capability. Order is data, and it lives in `patches/series`. Nothing is numbered, so nothing ever
has to be renumbered.

### Version updates to Orca

```bash
VERSION=v1.4.157 mise run bump
```

The task unapplies the series, moves the submodule to the new tag, then pushes each patch and refreshes it against the
new base. It stops at the first patch that will not apply. Resolve that one by hand:

```bash
quilt push -f     # force-apply; rejected hunks land in *.rej
# ...apply the rejects by hand...
quilt refresh
mise run bump     # re-run to continue through the rest
```

Only `patches/` restacks. Files in `src/` have no upstream version to conflict with, so a bump can never reject them;
what breaks them is an upstream API they call moving, and `mise run test:types` is what reports that, not quilt.

A patch applying is not a reason to keep it. Every bump is the moment to decide, for each patch, whether to keep it,
shrink it, merge it into another, or drop it because upstream has since shipped the behaviour. Record the decision in
`CHANGELOG.md`. The scheduled workflow opens a pull request for this and deliberately never merges it.

### Build

```bash
mise run build   # writes dist/orca-server-<tag>-x86_64.AppImage
```

The build applies the series, runs the overlay, reads the version off the submodule, and then runs Orca's own
`build:desktop`, which typechecks. That typecheck is what actually proves the series and the overlay still fit upstream.

## Test

```bash
mise run lint:shell    # shellcheck over every tracked shell script
mise run test:types    # typecheck the assembled tree
mise run test:series   # series integrity
mise run test:unit     # the acceptance tests the series and the overlay carry
mise run test:scope    # upstream's tests beside every file either of them touches
mise run test:e2e      # boot the built AppImage and fetch the web client
```

`mise run check` runs all of those except `test:e2e`, which is the set that gates a push.

`test:unit` and `test:scope` need the whole series applied and `pnpm install` run inside `lib/orca`. Both run the
overlay themselves, so the copy is never something you have to remember.

### Series tests

`test/scripts/series.bats` checks the things a reviewer cannot see by reading a diff: that every entry in `series`
resolves, that no patch applies with fuzz, that every patch carries a rationale header naming a test file that exists,
and that a `quilt refresh` of each patch changes nothing. That last one is the important one. It means a stale or
hand-edited patch fails CI instead of sitting in the tree until someone bumps upstream and cannot work out why the tree
no longer matches.

It also holds the two-owner rule from both ends: every file in the submodule tree has to belong to a patch or to the
overlay, and no file may belong to both.

### Acceptance tests

Ours run inside Orca's tree under Orca's own vitest. That is forced by what they test: RPC methods, surface builders,
ownership resolvers, none of which are reachable from outside the process.

They come from the same two owners the code does. A test for a file we added is a new file, so it lives in the overlay
next to what it tests; a test that extends one of upstream's test files is a modification, so it lives in the patch that
makes it. `test:unit` derives its list from both, so adding either kind picks it up without touching the runner.

`test:scope` runs a wider net: upstream's own tests sitting beside every file the series or the overlay touches. A
patch breaks tests it never names — one import at module scope took out 411 of them while the series' own tests stayed
green.

Overlay tests no longer restack on a bump. Patch-side ones still do, and in exchange a patch carries the test an
upstream pull request would need.

Upstream's full suite is not green under parallel load, even on a pristine tag. Before blaming a patch for a failure,
run `pnpm test` inside `lib/orca` with the series popped and compare.

### End-to-end tests

`test:e2e` extracts the built AppImage, starts it under Xvfb and D-Bus, and waits for `GET /web-index.html`. It also
asserts the listener is on loopback, because in trusted-proxy mode a bind to `0.0.0.0` means the mode silently did not
take effect. Linux only.

## Structure

Orca is a git submodule at `lib/orca`, pinned to a release tag. Our changes to files that exist there are patches in
[patches](../patches), applied with quilt; the files that do not exist there are ours outright and live in
[src](../src), copied into the tree at build time. The submodule commit is the only place the version is recorded; no
build file repeats it.

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

A patch has to be restacked on every upstream bump. Nothing else in this repository does, so the question for any change
is how little of it has to be a patch.

New code of ours is the common case, and the overlay is the answer to it. A file with no upstream counterpart cannot
conflict, so it costs nothing to carry; what stays in a patch is the call into it, the line in an upstream file that
imports or registers what we added.

Anything that does not need Orca's source at all should not reach `lib/orca` in the first place. The product rename is
the worked example. `ci/build/electron-builder.overlay.cjs` sets `appId` and `productName` through
electron-builder's own `extends`, which deep-merges over upstream's config at build time. Doing the same thing as a
patch would have added a fourteenth file to restack forever.
