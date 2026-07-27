<!-- prettier-ignore-start -->
<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
# Contributing

- [Where to start](#where-to-start)
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

## Where to start

This repository carries a patch series over an upstream that keeps moving, so it is built to tell you when you have
broken one of its rules. Run `mise run check` and let the gates teach you; none of them fail without naming the fix.

Good first work, in rough order of how much of the model it needs:

- Documentation — including the failure message that sent you to it.
- A covering test for a patch whose header names one but tests it thinly.
- Reproducing an [`upstream-gap`](https://github.com/mrkhachaturov/orca-server/labels/upstream-gap) issue against a
  desktop Orca, which is what decides who owns a bug.
- Shrinking a patch, or dropping one upstream has made unnecessary. This is the most valuable thing anyone can do here;
  see [Version updates to Orca](#version-updates-to-orca).

## Requirements

- `git`, with submodule support
- [`mise`](https://mise.jdx.dev), which pins the rest of the host toolchain
- `quilt` — not in the mise registry or the pkgx pantry, so install it from your package manager:
  `brew install quilt` on macOS, `apt-get install quilt` on Debian and Ubuntu
- Docker with buildx, to build the AppImage
- A Linux host, `x86_64` or `aarch64`, to run the end-to-end test

## Development workflow

```bash
git clone https://github.com/mrkhachaturov/orca-server.git
cd orca-server
git submodule update --init   # fetches Orca at the pinned tag into lib/orca
mise install
mise run up                   # applies the series to lib/orca, then copies our own files in on top
```

`lib/orca` will show as dirty in `git status`; that is expected. The changes live in `patches/` and `src/`, never in a
commit inside the submodule.

`mise run down` returns to pristine upstream: it pops the series and runs `mise run overlay --clean`. Both halves are
needed, because the overlay's copies are untracked files that survive popping the series. `--clean` removes only the
files the overlay owns and refuses to delete one upstream has started tracking.

### Where a change goes

A file that already exists in Orca is modified by a patch, with quilt. A file that does not exist upstream is a plain
`.ts` or `.tsx` under `src/`, committed like any other source, never `quilt add`ed and never inside a patch.

`mise run overlay` copies `src/<path>` to `lib/orca/src/<path>`, so an import resolves the same whichever owner a module
has. It runs after `quilt push -a` and copies last. No path may be owned by both: `mise run overlay --check` asserts
that and copies nothing. The series tests check it from both ends, including a file in the submodule tree that belongs
to neither owner.

### Working on a patch

For files that exist upstream only. Never edit a file in `patches/` by hand — let quilt write it.

```bash
quilt new my-capability.diff              # creates the patch and makes it current
quilt add lib/orca/src/main/some-file.ts  # BEFORE you touch the file
# ...edit the file...
quilt refresh                             # writes your changes into the current patch
```

`quilt add` saves the file as it was, so `refresh` can only ever produce that one patch's diff and cannot swallow
changes belonging to a later patch.

To change an existing patch, pop back to it first:

```bash
quilt pop my-capability.diff   # or: quilt pop -a && quilt push my-capability.diff
# ...edit...
quilt refresh
quilt push -a                  # confirm the rest of the series still applies
```

Three rules the tests enforce:

- Every patch opens with a rationale header — the free text above the first `Index:` line. Say what the patch does, why
  the behaviour is wrong without it, and how to check. Name the covering test file in backticks.
- Every patch leaves the build working on its own. Patches may depend on each other, but no intermediate state may be
  broken.
- Patch names describe a capability. Order is data and lives in `patches/series`; nothing is numbered.

### Version updates to Orca

```bash
VERSION=v1.4.157 mise run bump
```

The task unapplies the series, moves the submodule to the new tag, then pushes and refreshes each patch against the new
base. It stops at the first patch that will not apply. Resolve that one by hand:

```bash
quilt push -f     # force-apply; rejected hunks land in *.rej
# ...apply the rejects by hand...
quilt refresh
mise run bump     # re-run to continue through the rest
```

Only `patches/` restacks. A bump can never reject a file in `src/`; what breaks those is an upstream API they call
moving, and `mise run test:types` reports that, not quilt.

A patch applying is not a reason to keep it. Every bump decides, per patch: keep, shrink, merge into another, or drop
because upstream shipped the behaviour. Record the decision in `CHANGELOG.md`. The scheduled workflow opens a pull
request for this and never merges it.

### Build

```bash
mise run build   # writes dist/orca-server-<version>-<arch>.AppImage for this machine's architecture
```

The build assembles the tree, reads the version off the submodule, and runs Orca's own `build:desktop`, whose typecheck
proves the series and the overlay still fit upstream.

`linux/amd64` and `linux/arm64` are both release targets; the default is this machine's. Pass `--platform` to
cross-build under qemu, which is slow. CI builds each on a native runner.

## Test

```bash
mise run lint          # shell, markdown, yaml, toml, Dockerfile and workflows, through flint
mise run test:types    # typecheck the assembled tree
mise run test:series   # series integrity
mise run test:unit     # the acceptance tests the series and the overlay carry
mise run test:scope    # upstream's tests beside every file either of them touches
mise run test:e2e      # boot the built AppImage and fetch the web client
```

`mise run check` runs all of those except `test:e2e`.

`test:unit` and `test:scope` need `pnpm install` run inside `lib/orca`. They depend on `up`, so the tree is assembled
for you.

### Series tests

`test/scripts/series.bats` checks what a reviewer cannot see in a diff: that every entry in `series` resolves, that no
patch applies with fuzz, that every patch carries a rationale header naming a test file that exists, and that a
`quilt refresh` of each patch changes nothing. It also holds the two-owner rule from both ends: every file in the
submodule tree belongs to a patch or to the overlay, and none belongs to both.

### Acceptance tests

Ours run inside Orca's tree under Orca's own vitest, because what they test — RPC methods, surface builders, ownership
resolvers — is not reachable from outside the process.

A test for a file we added is a new file and lives in the overlay next to what it tests. A test that extends one of
upstream's test files is a modification and lives in the patch that makes it. `test:unit` derives its list from both.

`test:scope` runs upstream's own tests sitting beside every file the series or the overlay touches. A patch breaks tests
it never names: one import at module scope took out 411 of them while the series' own tests stayed green.

Upstream's full suite is not green under parallel load, even on a pristine tag. Before blaming a patch for a failure,
run `pnpm test` inside `lib/orca` with the series popped and compare.

### End-to-end tests

`test:e2e` extracts the built AppImage, starts it under Xvfb and D-Bus, and waits for `GET /web-index.html`. It asserts
the listener is on loopback: in trusted-proxy mode a bind to `0.0.0.0` means the mode did not take effect. Linux only.

## Structure

Orca is a git submodule at `lib/orca`, pinned to a release tag. Modifications to files that exist there are patches in
[patches](../patches), applied with quilt; files that do not exist there live in [src](../src) and are copied into the
tree at build time. The submodule commit is the only place the version is recorded.

The AppImage is built in a Docker image pinned by digest in the [Dockerfile](../Dockerfile). The glibc floor is 2.31 —
upstream's, enforced by an `afterPack` gate our overlay extends.

### Modifications to Orca

Orca is an Electron app whose UI talks to the main process over IPC. Its web client swaps that preload for one that
translates the same calls into runtime RPC, and upstream has only wired up part of it. Calls with no RPC behind them
fall through a proxy that returns `undefined`, so the feature does nothing and reports no error. Most of the series
closes one of those gaps.

Three patches instead exist because `orca serve` has no renderer, so anything the desktop computes in its store has to
be built from what the host itself knows. One patch, `trusted-proxy-session`, is specific to running behind an
authenticating proxy and has no upstream analogue.

### Keep changes out of the series when you can

A patch has to be restacked on every upstream bump; nothing else here does. New code of ours goes in the overlay, and
what stays in a patch is only the call into it — the line in an upstream file that imports or registers what we added.

That difference is also the review policy. A change in `src/` is reviewed like ordinary code. Anything landing in
`patches/` needs the maintainer, because every diff there is re-justified on every bump for as long as it exists — so
the smaller the patch half of a pull request, the faster it lands.

Anything that does not need Orca's source should not reach `lib/orca` at all. `build/electron-builder.overlay.cjs` sets
`appId` and `productName` through electron-builder's own `extends`, which deep-merges over upstream's config at build
time, instead of being a fourteenth file to restack forever.
