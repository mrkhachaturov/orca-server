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

Owners and assembly order: `AGENTS.md`. `build`, `test:unit` and `test:scope` run the overlay
themselves.

## The quilt loop — modifying a file that exists upstream

```bash
quilt new <capability>.diff            # appends to patches/series after the current top
quilt add lib/orca/<file>              # BEFORE the first edit
# ...edit...
quilt refresh                          # writes the .diff
quilt header -e                        # rationale header, required by series.bats
```

**`quilt add` before every edit, and before you touch the file, not after.** A change to a file not
in the current patch is invisible to `quilt refresh`. `quilt add` snapshots whatever is on disk as
the baseline, so adding an already-edited file records your edit *as* the baseline and captures
nothing — no error, and the behaviour still works locally from the working tree. Recover:

```bash
cp lib/orca/<file> /tmp/keep                                   # keep the edit
quilt pop -a && git -C lib/orca checkout -- <file> && quilt push -a
quilt add lib/orca/<file>                                      # records the real baseline
cp /tmp/keep lib/orca/<file> && quilt refresh
```

Verify the file landed in the patch — the count is the check, not the "Refreshed patch" line:

```bash
grep -c '^+++ orca-server/lib/orca/<file>$' patches/<patch>.diff   # must be 1
```

## A file that does not exist upstream — the overlay

Write it at `src/<path>`, mirroring where it must land under `lib/orca/src/`. No quilt command
touches it; `quilt add` on an overlay path puts that path under two owners and `mise run overlay`
fails. Edit the file in `src/` — the copy under `lib/orca/src/` is output and gets overwritten.

```bash
mise run overlay --check           # disjoint, and the count includes the new file
mise run test:unit | grep Running  # a new *.test.ts raises the file count
```

Extending an existing patch: `quilt pop <patch>.diff` to make it top, `quilt add`, edit, `quilt
refresh`, `quilt push -a`.

Merging: pop to the earlier patch, `quilt fold < patches/<later>.diff`, `quilt refresh`, then
`quilt delete -r <later>.diff`.

The header answers three things: the symptom without this patch, why the behaviour is wrong, and
how to check — naming its test files in backticks, `` `foo.test.ts` ``. `series.bats` fails a patch
with no header, and one whose header names no test file or a file not in the tree.

## Three failure shapes — decide which before writing code

Orca's web client replaces the Electron preload with `web-preload-api.ts`
(`createWebPreloadApi()`), stubbed — empty lists, `{available:false}`, no-op or throw — wherever no
wire exists.

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

**Shape 2 recurs the most** — correct for a laptop driving a remote runtime, wrong for a browser the
runtime itself serves. `execution-owner.diff` is the worked example: it fixes ownership at the
resolvers rather than at the surfaces.

Before designing a new RPC, check whether the runtime already holds the data and merely fails to
project it: field allowlists drop values that are present. Enumerate every writer of a map before
concluding a producer does not exist.

## Diagnose

0. **Ask upstream first.** Some tile gaps are documented, deliberate headless omissions. Read
   `lib/orca/docs/reference/`, starting with `headless-linux-server.md`.
1. **Confirm it is a stub.** Grep the error string or `window.api.<ns>` in `web-preload-api.ts`.
2. **Read the desktop contract:** `src/preload/index.ts`, `api-types.ts`, `src/main/ipc/*.ts`.
   Mirror names and shapes 1:1 so the renderer stays untouched.
3. **Look for an existing RPC** in `src/main/runtime/rpc/methods/` and `ALL_RPC_METHODS`. If one
   exists, route the stub through `callRuntimeResult('<method>')`.
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

`orca-runtime.ts` sits in an import cycle with the RPC tree. Every `rpc/` file referencing it uses
`import type`, which TypeScript erases, so no runtime edge exists.

1. **From a hub module use `import type`.** Need the value? Put it in a leaf under `src/shared/` —
   where the overlay keeps `open-in-url-template`, `runtime-seeded-settings` and
   `runtime-usage-providers` — and re-export from the hub. A bare `export type { X } from …` leaves
   `X` out of local scope; add a companion `import type`.
2. **Nothing crossing a cycle may be evaluated at module scope.** Schemas, `z.enum`, frozen maps,
   computed constants go inside the handler or behind a lazy getter.

Check both owners before refreshing:

```bash
grep -rn "from '\.\./\.\./orca-runtime'" src/main/runtime/rpc/ lib/orca/src/main/runtime/rpc/
# every hit: import type
```
