# headless-orchestration-delivery — v1.4.190 re-derivation

## Problem

Push-on-idle orchestration delivery is leaf-shaped: every resolver reaches the pane through the
renderer graph. A pane served by `orca serve` exists only as a PTY record, so nothing resolved and
nothing was pointed — a coordinator's run mail sat unread in the tile until someone told that agent
to check its own inbox.

## Still present at v1.4.190

**yes.** Neither producer of leaves exists on a headless host, and every delivery resolver still
reads only the leaf graph.

- `src/renderer/src/web/web-preload-api.ts:1430` — `syncWindowGraph: async (_graph) =>
  getRemoteRuntimeStatus()`. The web client discards the graph; a browser publishes no leaves.
- `src/main/index.ts:3237` — the serve path publishes `syncWindowGraph(HEADLESS_RUNTIME_WINDOW_ID,
  { tabs: [], leaves: [] })`, commented "headless servers have no renderer graph publisher". The
  graph is ready and permanently empty.
- `syncWindowGraph` is not an RPC. Its only non-test callers are `src/main/ipc/runtime.ts:30-44`
  (an `ipcMain` handler carrying a local renderer `sender`) and `src/main/index.ts:3237`. A *paired*
  desktop client therefore cannot publish leaves into our runtime either.
- `src/main/runtime/orca-runtime.ts:6959-6974` — the syncWindowGraph leaf loop, one of the two
  push-on-idle triggers, iterates `this.leaves.values()`.
- `src/main/runtime/orca-runtime.ts:11865-11902` — the OSC-title trigger iterates
  `getLeavesForPty(ptyId)` (`:32975`, backed by `leavesByPtyId`, `:3130`).
- The three delivery deps are still bound straight to the graph:
  `getLeaf: (leafKey) => this.leaves.get(leafKey)` (`:3183`, `:3205`),
  `getTerminalHandleForLeafKey: (leafKey) => this.handleByLeafKey.get(leafKey)` (`:3185`, `:3210`),
  `getLiveLeafForHandle: (handle) => this.getLiveLeafForHandle(handle).leaf` (`:3207`, `:3221`).
  `getLiveLeafForHandle` (`:35034`) throws `terminal_handle_stale` when `this.leaves` has no entry.
- `src/main/runtime/orchestration/*.ts` is byte-identical between the tags:
  `git diff --stat v1.4.188..v1.4.190 -- src/main/runtime/orchestration` reports only
  `db-heartbeat-straggler-guard.test.ts` (+40) and `db.test.ts` (-11). The delivery implementation
  (`mailbox-pointer-delivery.ts`), the mailbox owner (`mailbox-owner.ts`, which still declares
  `OrchestrationMailboxLeaf`) and `getLeavesForPty` are unmoved.

`orcad` is worse, not better: `src/main/orcad/orcad-entry.ts` never calls `syncWindowGraph` at all,
so `graphStatus` never reaches `'ready'` and `getLiveLeafForHandle` (`orca-runtime.ts:35034`) throws
`runtime_unavailable` at its own `assertGraphReady()` before it ever consults the leaf map.
Upstream's own headless daemon delivers no push mail.

## Who owns this logic now

**no upstream owner.**

`RuntimeDesktopSurface` does not own it, and cannot. Its four members are `showNotification`,
`findWindowById`, `onIpc`, `removeIpcListener` (`src/main/runtime/runtime-desktop-surface.ts:18-25`);
none concerns the leaf graph. Decisively: `src/main/index.ts:896` installs
`electronRuntimeDesktopSurface` unconditionally inside the `hasSingleInstanceLock` block, which
`orca serve` executes — so on our host the surface is the *desktop* implementation while
`this.leaves` is empty. Installed-vs-inert and has-leaves-vs-none are independent, so the seam
cannot discriminate the case this patch exists for.

`getDesktopWindowStatus` is not the discriminator either. It is a constructor option
(`orca-runtime.ts:3726`, default `() => 'openable'` at `:3778`), published at `:6127` as
`hasRenderer ? 'available' : this.getDesktopWindowStatusFn()`. `orcad` passes `() => 'blocked'`
(`orcad-entry.ts:146`), but the Electron `--serve` host we ship passes `getDesktopWindowStatus`
(`index.ts:2708`), which reads the serve activation gate (`index.ts:762-765`) and returns
`'ready' → 'openable'`, `'initializing'`, or `'blocked'`. `'blocked'` there means "no persistent
PTY provider, promotion to desktop is unsafe" (`src/main/startup/serve-desktop-activation.ts:19-27`),
not "no renderer". A daemon-backed `orca serve` — the normal case — reports `'openable'` with zero
leaves, so gating idle push on `=== 'blocked'` would deliver nothing on our host.

What upstream *does* own, and what the patch already routes into:

- `OrchestrationMailboxLeaf` (`orchestration/mailbox-owner.ts:4-13`) — a structural shape, not
  `RuntimeLeafRecord`. It is the seam that lets a non-renderer record feed the one delivery
  implementation, with its in-flight serialization, waiter filtering, sequence guard and submit
  deadline (`mailbox-pointer-delivery.ts`, `mailbox-pointer-submit.ts`).
- `resolvePtyTuiIdleWaiters` (`orca-runtime.ts:35422`, called at `:11840`) — upstream's own
  PTY-record-level idle edge, resolving through `handleByPtyId`. The patch's idle trigger sits
  directly beside it and mirrors it.
- `getPtyRecordForPaneKey` (`:34543`), `getLivePtyForHandle` (`:35054`), `parsePaneKey` (imported
  `:533`), `findHandleForPtyRecord` (`:35283`) — all present and unmoved.

The only alternative that would have an upstream owner is publishing a real graph from the host:
have the serve path synthesize leaves into `syncWindowGraph` instead of `{tabs: [], leaves: []}`.
Rejected as larger, not smaller. `syncWindowGraph` also sets `authoritativeWindowId`,
`markGraphReady`, `rendererGeneration`, `writable` (`:6814`), drives handle adoption, exit waiters,
mobile-snapshot coalescing and `getLiveLeafForHandle`'s staleness contract; it is published once at
startup while PTYs appear later, so it would need a continuous host-side graph publisher fanning out
on every OSC title frame. Upstream's comment at `index.ts:3236` states the opposite design
explicitly.

## Verdict

**keep** — no upstream owner appeared, both leaf producers are still absent headless, the whole
orchestration delivery tree is byte-identical between the tags, and the two upstream seams the brief
proposed (`RuntimeDesktopSurface`, `getDesktopWindowStatus`) are provably the wrong discriminators
for our host.

## Correct shape at v1.4.190

Unchanged in substance from what the patch does today. Written fresh against this tag it is:

1. `ptyOrchestrationMailboxLeaf(pty: RuntimePtyWorktreeRecord): OrchestrationMailboxLeaf | null` in
   `src/main/runtime/orca-runtime.ts` — project the PTY record onto upstream's structural leaf type
   via `parsePaneKey(pty.paneKey)`. Every field it reads still exists on `RuntimePtyWorktreeRecord`
   at this tag: `ptyId`, `connected`, `lastAgentStatus`, `lastAgentStatusObservedLive`,
   `lastOscTitle`, `managementTitle`, `title`.
2. Widen `deliverPendingMessagesForLeaf` (`:34907`) from `RuntimeLeafRecord` to
   `OrchestrationMailboxLeaf`. `RuntimeLeafRecord` is structurally assignable, so the three existing
   upstream call sites (`:6973`, `:11900`, `:19141`) are untouched.
3. Redirect exactly three delivery deps, each graph-first so a desktop pane keeps every answer it
   had and no terminal is reached twice:
   - `:3183` and `:3205` `getLeaf` → `this.leaves.get(leafKey)` else
     `ptyOrchestrationMailboxLeaf(getPtyRecordForPaneKey(paneKeyForLeafKey(leafKey)))`.
   - `:3185` and `:3210` `getTerminalHandleForLeafKey` → `handleByLeafKey.get(leafKey)` else
     `handleByPtyId.get(pty.ptyId) ?? findHandleForPtyRecord(pty.ptyId)` (the pair, because a
     handle pre-allocated at spawn is not in `handleByPtyId` until the record adopts it; `:9414`
     and `:35251` use the same pair).
   - `:3207` and `:3221` `getLiveLeafForHandle` → `getLivePtyForHandle(handle)` projection first,
     then `getLiveLeafForHandle(handle).leaf`. PTY-first is safe: `getLivePtyForHandle` (`:35054`)
     requires `record.tabId.startsWith('pty:')`, which a renderer leaf handle never satisfies.
   All three are load-bearing on different entry paths — `getTerminalHandleForLeafKey` gates
   `OrchestrationMailboxOwner.resolve` and `PointerDelivery.deliver`; `getLeaf` gates
   `redeliverAfterProbe` and `settle`; `getLiveLeafForHandle` gates `deliverForHandle` and the
   notification coordinator's `resolveArrivedMailboxes`. Dropping any one drops a delivery path.
4. A `paneKeyForLeafKey` helper: `getLeafKey` (`:35769`) joins with `::`, a pane key with `:`.
   Upstream's dep signatures pass only the joined string, so the conversion is forced.
5. The idle trigger beside `resolvePtyTuiIdleWaiters` (`:11840`), gated on
   `getLeavesForPty(ptyId).length === 0` plus the same live-idle edge the leaf loop uses
   (`prevStatus !== 'idle' || !prevObservedLive`, mirroring `:11902`). `getLeavesForPty` emptiness is
   the only accurate discriminator available: it is per-PTY, always true on our host, always false
   for a published desktop pane.

Two things that should change when the patch is restacked at v1.4.190:

- `src/main/runtime/headless-orchestration-delivery.test.ts:9-14` still calls `vi.mock('electron', …)`.
  At v1.4.190 the runtime graph has zero `electron` importers (`config/runtime-electron-baseline.txt`
  is empty), and `vitest-host-ports-setup` installs `AppEnvironment`/`SecretStore` globally
  (`config/vitest.config.ts:22-25`). Delete the mock; use `installFakeAppEnvironment({ getPath: … })`
  if a path override is still needed. It is the only test in `src/` that mocks electron.
- Keep the patch header's *To test* symptom and its backticked test filename — `series.bats`
  requires both, and the test file is in the overlay, not in the patch.

## Blocks this touches that other patches may share

- **RuntimeDesktopSurface** — touched only as the seam this audit ruled out; the patch imports
  nothing from it. No other patch in `patches/series` references it: `grep -l
  'RuntimeDesktopSurface\|getRuntimeDesktopSurface\|showNotification\|findWindowById' patches/*.diff`
  returns nothing. Verified.
- **The runtime-electron ratchet** — the patch edits `src/main/runtime/orca-runtime.ts`, one of the
  ratchet's two entry points. It adds one type-only import from an existing orchestration module, so
  it cannot regress the empty baseline. **Shared with**: `floating-workspace-picker.diff` (05),
  `runtime-seeded-settings.diff` (06), `execution-owner.diff` (08), `usage-analytics.diff` (10),
  `agent-cold-restore.diff` (11) — all carry an `Index:` line for `orca-runtime.ts`. Verified none
  of them adds a `from 'electron'` import line. Their hunk regions do not overlap this patch's
  (`3181-3250`, `11841-11890`, `34901-34990`); nearest neighbours are usage-analytics at `~3753-3845`
  and agent-cold-restore at `~8937-9007` / `~29091-29175`. **Suspicion**: 05, 06, 08, 10 and 11 all
  need re-checking against the ratchet independently — I only checked import lines, not their full
  transitive graphs.
- **orcad — the plain-Node runtime entrypoint** — the same gap exists there and is the natural
  upstream beneficiary if this is ever contributed back. **Suspicion**: `cli-registration.diff` (04)
  and `pairing-credentials.diff` (02) also mention "headless" in their headers and may reason about
  the same boot path; not read.
- **registerHeadlessPtyRuntime** — the producer of the PTY records this patch projects. Called from
  `src/main/index.ts:3218` on the serve path and `orcad-entry.ts:156`. **Suspicion**:
  `agent-cold-restore.diff` (11) is the strongest overlap — it creates the headless agent pane this
  patch then delivers mail to, so a pane it cold-restores must carry a `paneKey`,
  `lastAgentStatusObservedLive` and an adopted handle for delivery to resolve. `execution-owner.diff`
  (08) resolves ownership for panes with no local machine and may touch the same records. Neither
  patch's runtime hunks were read.
- **vitest-host-ports-setup** — this patch's overlay test is the only file in `src/` that calls
  `vi.mock('electron')` (verified across all 22 overlay test files), so the cleanup is isolated to
  patch 09. Listed here because every patch's test gains the global `AppEnvironment`/`SecretStore`
  install at this tag and may be able to drop local scaffolding.

## Unverified

- **Nothing was executed.** No `quilt push`, no `mise run up`, no `vitest`, no orcad boot. This is a
  read of upstream source at both tags plus the patch text.
- **Whether the patch still applies at v1.4.190.** The `series=12/12` in the session banner is at the
  *current* pin, v1.4.188. I checked only that no `v1.4.188..v1.4.190` hunk in `orca-runtime.ts`
  overlaps this patch's eight hunk regions — a lead, not proof. The nearest upstream change is
  `@@ -1561,7 +1563,6 @@ type TerminalCreateOptions`, ~26 lines after this patch's `@@ -1532,6`
  insertion; that will shift offsets.
- **The drop-proof was not run.** What would prove upstream owns this: boot `orcad`, spawn an agent
  terminal, register a coordinator run and send run mail while the agent's OSC title reports idle,
  and observe a pointer written to the PTY with no `orchestration check` from the agent. I predict it
  does not, from `orcad-entry.ts` never calling `syncWindowGraph` — but that is source inference, not
  a run.
- **Whether the shipped AppImage's `orca serve` reaches `index.ts:3237`.** Inferred from
  `isServeMode` (`index.ts:518`) and the launch shim contract in `AGENTS.md`; not traced through
  `.mise/tasks/test/e2e.sh` and not observed on a live server.
- **Whether `deliverPendingMessagesForLeaf` at `:19141`** (the restored-foreground-agent path) needs
  the same PTY-record treatment. It walks `getLeavesForPty(ptyId)`, so it is dead headless for the
  same reason, but I did not determine whether that path can fire on our host or whether the OSC-idle
  trigger already covers its cases.
- **Whether `detachedPreAllocatedLeaves`** (`:3139`, `:35331`) can ever hold an entry on a host that
  never published a leaf. `rememberDetachedPreAllocatedLeaves` only re-remembers leaves that already
  existed, so I read it as unreachable headless — not confirmed by a run.
- **Cross-patch hunk collisions** were checked by hunk-header arithmetic on v1.4.188 line numbers
  only. I did not restack the series to see actual conflicts.
