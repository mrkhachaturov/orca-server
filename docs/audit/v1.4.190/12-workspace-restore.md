# workspace-restore — v1.4.190 re-derivation

## Problem

After a workspace restart the tile lands on Landing — "Select a workspace from the sidebar to
begin" — even though the sidebar lists every worktree. The paired web client's session read
restores the active workspace from `ui.lastActiveRepoId` / `ui.lastActiveWorktreeId`, and nothing
anywhere writes those two fields.

## Still present at v1.4.190

yes.

Reader unchanged: `src/renderer/src/web/web-preload-api.ts:4093-4098` still builds the paired
session from `getDefaultWorkspaceSession()` plus `ui.lastActiveRepoId` / `ui.lastActiveWorktreeId`.
`git diff v1.4.188..v1.4.190 -- src/renderer/src/web/web-preload-api.ts` is one line
(`onToggleAgentDashboard`, `:2846`).

No producer appeared. Every reference to either field at the tag:

| file:line | role |
| --- | --- |
| `src/shared/persisted-ui-state-types.ts:27-28` | type |
| `src/shared/constants.ts:461-462` | default `null` |
| `src/renderer/src/lib/startup-ui-hydration.ts:35-36` | startup-failure fallback, `null` |
| `src/main/orca-profiles/profile-project-source-removal.ts:32-36` | clears on repo removal |
| `src/main/runtime/rpc/methods/client-ui-schemas.ts:183-184` | `ui.set` accepts them |
| `src/renderer/src/web/web-preload-api.ts:4095-4096` | the reader |
| `src/main/persistence-settings-ui-defaults.test.ts:131` | asserts the default is `null` |

Outside `src`, only benchmark fixtures write them
(`tests/tools/benchmarks/startup-time-bench.mjs:304-305`,
`main-thread-jank-bench.mjs:133-134`) — synthetic profiles, not a production path.

The workspace session schema work at v1.4.190 is unrelated: `src/shared/workspace-session-schema.ts`
gained `executionHostId` on `tabSchema` (`:130`) and hoisted `executionHostIdSchema` (`:123-125`);
`src/shared/workspace-session-schema.sleeping-agent.test.ts` is a split-out test file. No
active-workspace pointer was added — `activeRepoId`, `activeWorktreeId`, `activeWorkspaceKey` and
`activeWorkspaceExecutionHostId` all already existed at v1.4.188.

Two facts found at the tag that change the shape of the fix:

1. `sanitizeWebRuntimeWorkspaceSession` (`src/renderer/src/web/web-workspace-session.ts:4-18`) is an
   allowlist of four fields and **keeps** `activeRepoId` / `activeWorktreeId`. The browser's own
   session copy already holds the pointer on every `session.set` / `setSync` write.
2. `session.patch` (`web-preload-api.ts:832-840`) uses `getStoredWorkspaceSession(hostId)` as its
   merge base. For a paired client that base is the `ui.lastActive*` rebuild, i.e. `null`, and
   `buildWorkspaceSessionPatch` (`src/renderer/src/lib/workspace-session-patch.ts:49-56`) emits
   `activeRepoId` / `activeWorktreeId` only when they changed. So the first partial patch after a
   write **erases** the pointer the browser copy was holding. That erasure, not the missing
   producer, is what the current patch's carry-forward logic is working around.

## Who owns this logic now

no upstream owner.

No block in `00-building-blocks.md` covers the active-workspace pointer; v1.4.190's new blocks are
host-port injection and tab/host ownership, none of which touch it.

The two upstream surfaces that would have to own it (neither is in `00-building-blocks.md`):

- **read side** — `getStoredWorkspaceSession` (`web-preload-api.ts:4079-4099`) plus
  `sanitizeWebRuntimeWorkspaceSession` (`web-workspace-session.ts:4-18`). Already carries the
  pointer; the reader discards it.
- **producer slot** — `usePersistedUIWriter` (`src/renderer/src/app-shell/use-persisted-ui-writer.ts`),
  the shared-renderer writer that mirrors store fields into the durable UI file via
  `window.api.ui.set`. Its second effect (`:64-70`, `activeView`) is the exact precedent: a small
  dedicated effect for a value that changes on every switch, kept off the 150 ms multi-MB debounce.
  Downstream of it the transport already exists end to end: web `createWebUiApi().set`
  (`web-preload-api.ts:2729-2741`) writes localStorage, strips pairing-local fields and forwards
  over `ui.set`, swallowing failure for unpaired clients; `ui.set` is registered at
  `src/main/runtime/rpc/methods/client-ui.ts:57-65`; `UiUpdateFields` already accepts both keys
  (`client-ui-schemas.ts:183-184`); `lastActive*` is not in `PAIRING_LOCAL_UI_FIELDS`
  (`src/shared/pairing-local-ui-fields.ts:8-12`), so it crosses the pairing boundary in both
  directions.

## Verdict

shrink — the stated symptom is fixed by two lines in the reader, and the 60-line
`rememberWebActiveWorkspace` producer both duplicates the local-write-then-`ui.set` transport that
`createWebUiApi().set` already owns and sits in the web adapter rather than in the shared renderer
where the value lives.

## Correct shape at v1.4.190

Two independent halves. The first is the fix; the second is only needed if restore on a
cleared-storage or second browser stays in scope.

**1. Reader fallback — `src/renderer/src/web/web-preload-api.ts`, `getStoredWorkspaceSession`
(`:4093-4098`).** Keep exactly the change the current patch already makes there:

```ts
activeRepoId: ui.lastActiveRepoId ?? localSession.activeRepoId,
activeWorktreeId: ui.lastActiveWorktreeId ?? localSession.activeWorktreeId,
```

This is self-sustaining and needs nothing else: because `session.patch` merges onto
`getStoredWorkspaceSession`, the fallback makes the base carry the unchanged half forward, which
is the entire job of the current patch's `known` / carry-forward branch. Switching worktree within
a repo keeps the repo for the same reason. Drop `rememberWebActiveWorkspace`, the
`WebActiveWorkspacePointer` type, the `rememberedActiveWorkspace` memo, and the four call sites in
`session.set` / `patch` / `setSync` and `stageBeforeUnloadSync`.

Do **not** move this fallback to the UI copy instead. `ui.get` merges host over local
(`mergeHostWebUIState` → `mergeWebUIState`, `:4138-4185`, incoming spread last) and
`runtime.getUIState()` returns a full `PersistedUIState` whose `lastActive*` default to `null`
(`src/shared/constants.ts:461-462`), so any host that has not been told the pointer clobbers the
browser's UI copy with `null` on the next `ui.get`. The session copy is not on that path.

**2. Producer, if kept — `src/renderer/src/app-shell/use-persisted-ui-writer.ts`.** Add a second
dedicated effect modelled on the `activeView` one (`:64-70`):

```ts
const activeRepoId = useAppStore((s) => s.activeRepoId)
const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
useEffect(() => {
  if (!persistedUIReady) return
  void window.api.ui.set({ lastActiveRepoId: activeRepoId, lastActiveWorktreeId: activeWorktreeId })
}, [activeRepoId, activeWorktreeId, persistedUIReady])
```

Both are top-level `AppState` fields (`src/renderer/src/store/slices/repos.ts:1832,2054`;
`s.activeWorktreeId` is read that way throughout the renderer). This form drops every piece of
bespoke machinery the current patch carries: no change memo (React identity plus the
`persistedUIReady` gate dedupe), no `normalizeExecutionHostId` / `LOCAL_EXECUTION_HOST_ID` guard
(the `ui` slice is not host-partitioned, unlike `session`), no `requireActiveEnvironmentOrNull()`
gate and no `.catch` that resets a memo (web `ui.set` already writes localStorage first and
swallows the RPC failure for unpaired clients), and no `'activeRepoId' in session` key inspection
(the store always has both values). It also fills upstream's declared gap on desktop and web at
once, which is the version an upstream maintainer would take.

Note it must be a separate effect, not a field on the existing 150 ms `useShallow` payload: that
writer is the "multi-MB durable-state" save `#9002` deliberately kept `activeView` off, and the
active workspace changes at the same rate.

Tests: `src/renderer/src/web/web-workspace-restore.test.ts` and
`src/renderer/src/web/web-preload-api-active-workspace-pointer.test.ts` both assert the current
shape and would be rewritten. The reader-only half needs one test — patch, then reload, restores
the workspace with `ui.lastActive*` absent — plus the existing "never takes the active workspace
from a non-local host partition" case, which the reader change preserves because non-local hosts
return early at `:4080-4084`. The `web-preload-api-active-workspace-pointer.test.ts` case "writes
the pointer into localStorage before any RPC, with no active environment" disappears with the
producer; if the producer is kept in `usePersistedUIWriter`, its test moves to the shared renderer
and stops needing the web preload harness.

## Blocks this touches that other patches may share

This patch touches no block named in `00-building-blocks.md`. Listed below are the blocks it is
adjacent to and the shared surfaces that are not blocks. All cross-patch links are suspicions
unless marked verified.

- **`worktree-execution-host-alias`** — the current patch's host guard is a raw
  `normalizeExecutionHostId(hostId) ?? LOCAL_EXECUTION_HOST_ID` equality, which is the comparison
  that block exists to replace. The shrink removes the guard entirely, so the conflict goes away.
  Suspected shared with `execution-owner.diff` (verified: it rewrites host-id resolution across
  the renderer and `web-preload-api.ts`).
- **`unified-tab-host-ownership`** — `getActiveExecutionHostIdForWorktree` keys off
  `state.activeWorktreeId`, the value this patch restores at boot; a restored worktree with no
  `activeWorkspaceExecutionHostId` takes that block's `LOCAL_EXECUTION_HOST_ID` fallback.
  Suspected shared with `execution-owner.diff` and `floating-workspace-picker.diff`.
- **`host-session-mirror-hydration`** and **`host-live-terminal-probe`** — both are consumed by
  `web-session-tabs-sync.ts`, which mirrors tabs for the workspace that is active at boot. Which
  workspace that is, is what this patch decides. Suspected shared with `agent-cold-restore.diff`
  (same acceptance walkthrough: restart the workspace, open the pane in the tile).
- Not a block — **`src/renderer/src/web/web-preload-api.ts`**. Verified shared with eight other
  patches: `trusted-proxy-session`, `pairing-credentials`, `resource-manager`, `cli-registration`,
  `floating-workspace-picker`, `runtime-seeded-settings`, `execution-owner`, `usage-analytics`.
  The shrink reduces this patch's footprint there to two lines inside `getStoredWorkspaceSession`,
  which no other patch touches.
- Not a block — the **`ui.set` RPC** (`src/main/runtime/rpc/methods/client-ui.ts`, schema in
  `client-ui-schemas.ts`). Verified shared with `open-in-browser-editors.diff`, which patches
  `client-ui.ts` and its test. Neither half of the correct shape adds a schema field, so the
  overlap is file-level only.
- Not a block — **`src/renderer/src/app-shell/use-persisted-ui-writer.ts`**, the proposed producer
  site. No patch in `patches/series` touches it today (verified by enumerating every
  `lib/orca/src/...` path in `patches/*.diff`), so half 2 would open a new shared surface.

## Unverified

- Nothing was executed. Every claim is read from upstream source at `v1.4.190` and from
  `patches/workspace-restore.diff`; no build, no `vitest`, no live `orca serve`.
- Whether the reader-only half actually restores the tile in practice — the erasure chain
  (`session.patch` base → `buildWorkspaceSessionPatch` partial) is read from source, not observed.
- Whether `persistedUIReady` is set before the first `activeRepoId` / `activeWorktreeId` store
  write on a paired boot. If it were not, the proposed producer effect could publish a `null`
  pointer over a good one. I did not trace the hydration ordering.
- Whether the "browser with cleared storage" acceptance step in the patch header is a requirement
  the project holds, or scope the patch added to its own symptom. That decision picks between
  shrink-to-half-1 and shrink-to-both-halves.
- Whether any renderer path other than `createSessionWriteSubscriber` writes
  `activeRepoId` / `activeWorktreeId` through `window.api.session`. I enumerated the callers of
  `patchWorkspaceSessionByHost` / `persistWorkspaceSessionByHost` / `persistWorkspaceSessionByHostSync`
  only.
- Upstream's intent for `ui.lastActive*` on desktop. Desktop restores from its own session store,
  so the field may be dead there by design; I found no upstream doc or comment stating either way.
