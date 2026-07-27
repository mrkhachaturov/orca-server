---
name: orca-patch-author
description: >-
  Write an orca-server patch: diagnose a stubbed web-client capability in `lib/orca`, implement it,
  and land it — modifications to upstream files as a quilt patch, new files in the `src/` overlay.
  Run `orca-patch-audit` first to learn which patch already owns the area, and `orca-patch-verify`
  when done.
when_to_use: >-
  When adding or fixing a capability that works in desktop Orca and is dead in the browser tile.
  Triggers: "works on desktop, not in the tile", "No interfaces found", "unavailable", a stub in
  `web-preload-api.ts`, "add an RPC", "write a patch", "extend patch X".
---

# Author a patch

## Two owners, no overlap

- **`patches/`** — files that exist upstream. We modify them, with quilt.
- **`src/`** — files that do not exist upstream. Entirely ours, checked in as plain `.ts`/`.tsx`,
  never in a patch, never `quilt add`ed.

`src/<path>` is copied to `lib/orca/src/<path>`. The paths mirror, so imports read the same as if
the file had been written in place, and runtime is unchanged — the code still runs inside Orca's
process. Only where a file is stored between builds differs.

No path may have both owners. Build and test order is always `quilt push -a` →
`./ci/build/overlay.sh` → build or test; `build-appimage.sh`, `test-unit.sh` and `test-scope.sh`
each run the overlay themselves. `./ci/build/overlay.sh --check` asserts the separation without
copying, and names any path that has both owners.

## The quilt loop — modifying a file that exists upstream

```bash
quilt new <capability>.diff            # appends to patches/series after the current top
quilt add lib/orca/<file>              # BEFORE the first edit
# ...edit...
quilt refresh                          # writes the .diff
quilt header -e                        # rationale header, required by series.bats
```

**`quilt add` before every edit.** A change to a file that is not in the current patch is invisible
to `quilt refresh`.

**Add the file before you touch it, not after.** `quilt add` snapshots whatever is on disk as the
baseline, so adding a file you have already edited records your edit *as* the baseline and `quilt
refresh` captures nothing — no error, no warning, and the behaviour still works locally because
the edited file is sitting in the working tree. Recover by taking the file back to the state the
series produces, then adding it:

```bash
cp lib/orca/<file> /tmp/keep                                   # keep the edit
quilt pop -a && git -C lib/orca checkout -- <file> && quilt push -a
quilt add lib/orca/<file>                                      # records the real baseline
cp /tmp/keep lib/orca/<file> && quilt refresh
```

Verify the file actually landed in the patch — the count is the check, not the "Refreshed patch"
line:

```bash
grep -c '^+++ orca-server/lib/orca/<file>$' patches/<patch>.diff   # must be 1
```

## A file that does not exist upstream — the overlay

Write it at `src/<path>`, mirroring where it must land under `lib/orca/src/`. No quilt command
touches it; `quilt add` on an overlay path puts that path under two owners and `overlay.sh` fails.
Edit the file in `src/` — the copy under `lib/orca/src/` is output, and the next overlay run
overwrites it.

```bash
./ci/build/overlay.sh --check          # disjoint, and the count includes the new file
./ci/dev/test-unit.sh | grep Running   # a new *.test.ts raises the file count
```

`series.bats` check 10 enforces the general case: every file in the submodule tree must be owned by
a patch or by the overlay.

Extending an existing patch: `quilt pop <patch>.diff` to make it top, `quilt add`, edit, `quilt
refresh`, `quilt push -a`.

Merging: pop to the earlier patch, `quilt fold < patches/<later>.diff`, `quilt refresh`, then
`quilt delete -r <later>.diff`.

The header answers three things: the symptom without this patch, why the behaviour is wrong, and
how to check — naming its test files in backticks, `` `foo.test.ts` ``. A patch no longer proves
coverage by containing a test file, because new tests live in the overlay, so that naming is the
only link between a capability and the instrument that measures it. `series.bats` fails a patch
with no header, and one whose header names no test file or names a file that is not in the tree.

## The one fact behind every tile bug

Upstream's model has two roles on two machines: a *server* running `orca serve` that owns repos,
worktrees, terminals and agent processes, and a *client* that runs the UI and connects. orca-server
collapses both onto one host, so `LOCAL_EXECUTION_HOST_ID` is a fiction and headless drops every
window-bound subsystem.

**Every capability therefore needs a wire representation.** Orca's web client replaces the Electron
preload with `web-preload-api.ts` (`createWebPreloadApi()`), and upstream stubs it — empty lists,
`{available:false}`, no-op or throw — wherever no wire exists.

## Three failure shapes — decide which before writing code

| # | Shape | Tell | Fix |
|---|---|---|---|
| 1 | **No wire.** The capability only existed as Electron IPC (`webContents.send` + `ipc/*.ts`) | hardcoded return in `web-preload-api.ts`; no matching namespace in `ALL_RPC_METHODS` | add the RPC, or route to an existing one, mirroring `ipc/*.ts` 1:1 |
| 2 | **Wrong locality.** "no `runtimeEnvironmentId`" read as "therefore this machine" | `=== null` on a runtime id, `'local'`, `LOCAL_EXECUTION_HOST_ID`, `isWebClient` | fix at the resolver every surface routes through, not at the call site |
| 3 | **Renderer-graph-driven.** Wired and locality-correct, but the trigger reads the window graph | logic keyed on `getLeavesForPty`, `handleByLeafKey`, `getLiveLeafForHandle` | add the PTY-record counterpart, gated on leaf-emptiness so desktop never double-fires |

One patch often answers more than one shape.

**Shape 3 mechanism:** `serve` publishes one empty graph (`HEADLESS_RUNTIME_WINDOW_ID`,
`main/index.ts`), `syncWindowGraph` is a stub, and there is no `graph.*` RPC — a browser cannot
publish leaves, so `this.leaves` stays empty for the process lifetime. Such a terminal still carries
a real pane identity on its PTY record, so `terminal.list` returns real `tabId`/`leafId` and looks
leaf-backed. The discriminator is the `orphaned` field from `buildPtyTerminalSummary`.
`headless-orchestration-delivery.diff` is the worked example.

**Shape 2 recurs the most.** Correct for a laptop driving a remote runtime; wrong for a browser the
runtime itself serves, where every local affordance is a stub. `execution-owner.diff` is the worked
example: it fixes ownership at the resolvers rather than at the surfaces.

Before designing a new RPC, check whether the runtime already holds the data and merely fails to
project it: field allowlists drop values that are present. Enumerate every writer of a map before
concluding a producer does not exist.

## Diagnose

0. **Ask upstream first.** Some tile gaps are documented, deliberate headless omissions — building a
   patch for one is work upstream will not take. Read `lib/orca/docs/reference/`, starting with
   `headless-linux-server.md`.
1. **Confirm it is a stub.** Grep the error string or `window.api.<ns>` in `web-preload-api.ts`.
2. **Read the desktop contract:** `src/preload/index.ts`, `api-types.ts`, `src/main/ipc/*.ts`.
   Mirror names and shapes 1:1 so the renderer stays untouched.
3. **Look for an existing RPC** in `src/main/runtime/rpc/methods/` and `ALL_RPC_METHODS`. If one
   exists the fix is routing the stub through `callRuntimeResult('<method>')`.
4. **Add one otherwise.** A host probe or operation reuses `ipc/*.ts` directly. Credential
   mint/revoke authorises through the `trustedMobilePairing` context, runtime-scope only, fail
   closed, strict zod params.
5. **Scope.** New methods stay out of `MOBILE_RPC_METHOD_ALLOWLIST` unless phones need them;
   anything mutating the host or minting credentials is never phone-reachable. Add the
   not-allowlisted and registered assertions to `mobile-rpc-allowlist.test.ts`.
6. **UI.** Branch on `isWebClientLocation()`, hide desktop-only affordances, and keep the advertised
   address server policy (`--pairing-address`).

A capability that needs the stock phone or desktop client to change belongs upstream, not here.

## ⚠️ Imports from hub modules

`orca-runtime.ts` sits in an import cycle with the RPC tree. Every `rpc/` file that references it
uses `import type`, which TypeScript erases, so no runtime edge exists.

1. **From a hub module use `import type`.** Need the value? Put it in a leaf under `src/shared/` —
   where the overlay already keeps `open-in-url-template`, `runtime-seeded-settings` and
   `runtime-usage-providers`, and the series patches upstream's `open-in-applications` — and
   re-export from the hub. A bare `export type { X } from …` leaves `X` out of local scope; add a
   companion `import type`.
2. **Nothing crossing a cycle may be evaluated at module scope.** Schemas, `z.enum`, frozen maps,
   computed constants go inside the handler or behind a lazy getter.

One value import at module scope cost 29 test files and 411 tests, while `orca serve` survived on
import-order luck. Check both owners before refreshing:

```bash
grep -rn "from '\.\./\.\./orca-runtime'" src/main/runtime/rpc/ lib/orca/src/main/runtime/rpc/
# every hit: import type
```
