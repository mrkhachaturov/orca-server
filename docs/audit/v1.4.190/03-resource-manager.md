# resource-manager — v1.4.190 re-derivation

## Problem

Resource Manager in the web tile showed all zeros. The web preload's `memory.getSnapshot` was an
empty-snapshot stub, so the tile reported the browser's nothing instead of the workspace host's
processes, RAM and CPU — the terminals and agents run on the server, not in the browser.

## Still present at v1.4.190

yes.

- `src/renderer/src/web/web-preload-api.ts:900-901` — `memory: { getSnapshot: () =>
  Promise.resolve(createEmptyMemorySnapshot()) }`, byte-identical to v1.4.188.
- `git diff v1.4.188..v1.4.190 -- src/renderer/src/web/web-preload-api.ts` is one line, at `:2846`
  (`ui.onToggleAgentDashboard`). Nothing in the memory region moved; `memory: {` is line 900 at both
  tags.
- `src/renderer/src/store/slices/memory.ts` and
  `src/renderer/src/components/status-bar/ResourceUsageStatusSegment.tsx` are unchanged between the
  tags. `memorySnapshotError` (`memory.ts:7,32`) and `daemonUnreachable`
  (`ResourceUsageStatusSegment.tsx:974`) still derive the banner exactly as the header describes.

## Who owns this logic now

Two owners, and they are on opposite sides of the wire.

**Producer — AppEnvironment.** `getAppMetrics()` (`src/shared/app-environment.ts:22-36`) is the
Electron-free replacement for `app.getAppMetrics()`. `src/main/memory/collector.ts:268` is its sole
non-test caller (`bucketElectronMetrics`); `collector.ts:29` imports the accessor, and the v1.4.188 →
v1.4.190 diff on that file is exactly the `app` → `getAppEnvironment()` swap plus the type
`ReturnType<AppEnvironment['getAppMetrics']>` at `:250`. The host half of the same snapshot moved to
**src/shared/child-process**: `host-memory.ts:88-97` and
`windows-process-resource-collector.ts:154-164` now call `runProcess` instead of `execFile`.

**Transport — no upstream owner.** AppEnvironment is a main-process port anchored at
`Symbol.for('orca.host.appEnvironment')`; it is not reachable from the renderer. The only wire from
the web client to that producer is the RPC our patch already calls:
`diagnostics.memory` (`src/main/runtime/rpc/methods/diagnostics.ts:5`) → `runtime.getMemorySnapshot()`
(`src/main/runtime/orca-runtime.ts:3840-3845`) → `collectMemorySnapshot(this.store)`
(`src/main/memory/collector.ts:51`) → `getAppEnvironment().getAppMetrics()`. It is on
`MOBILE_RPC_METHOD_ALLOWLIST` (`src/main/runtime/runtime-rpc.ts:212`) — read-only, already
phone-reachable.

So the patch is already routed into the block that owns the data. AppEnvironment is not a place the
patch can call; it is the reason the RPC's answer is correct.

## Verdict

keep — the stub is unchanged, the wire it routes into is unchanged, and the producer's move behind
AppEnvironment happened entirely on the far side of that wire, so there is nothing to shrink.

## Correct shape at v1.4.190

Identical to today's patch, restacked with no edit. One hunk in
`src/renderer/src/web/web-preload-api.ts`, replacing the `memory.getSnapshot` stub at `:900-901`
with the `requireActiveEnvironmentOrNull()` guard plus
`callRuntimeResult<MemorySnapshot>('diagnostics.memory')`.

Every symbol the patch depends on exists at the tag, unmoved:

- `requireActiveEnvironmentOrNull()` — `web-preload-api.ts:3783`; still the sibling-stub idiom
  (`:2795, 2967, 3427, 3436, 3470, 4029, 4088`).
- `callRuntimeResult<T>` — `web-preload-api.ts:3547-3556`; throws `response.error.message` on
  `ok:false`, which is the `memorySnapshotError` path the banner needs.
- `createEmptyMemorySnapshot()` — `web-preload-api.ts:4482`.
- `MemorySnapshot` type import — `web-preload-api.ts:40`; `src/shared/process-stats-types.ts` is
  untouched between the tags, so the runtime-side producer builds the same shape the tile parses.

No call site changes. Do not attempt to reach `getAppEnvironment()` from the preload — the accessor
throws when uninstalled and the renderer never installs it.

**One behavioural note for the report, not a patch change.** Under `orcad`, `getAppMetrics()` returns
`[]` (`src/main/orcad/orcad-entry.ts:61`, "there are no Chromium processes on this host to measure"),
so `bucketElectronMetrics` yields an all-zero `snapshot.app` while `snapshot.worktrees` and
`snapshot.host` stay real. That is honest, not a regression: orca-server ships `orca serve` from the
Electron AppImage, where the runtime *is* an Electron process and the app buckets are its real
server-side processes.

The patch's "empty snapshot means no environment connected" contract stays distinguishable from an
orcad answer: the preload's `createEmptyMemorySnapshot()` sets `host.totalMemory: 0`
(`web-preload-api.ts:4488`), whereas every runtime-side snapshot — including orcad's, and including
`collector.ts`'s internal `emptySnapshot()` failure fallback at `:99-110` — fills `host` from
`fallbackHostMemory()` / `collectHostMemory()` (`src/main/memory/host-memory.ts:14,32`), which reads
`os.totalmem()`. Zero total host memory is only ever the preload's answer.

Also worth knowing when reading a failure: `collectMemorySnapshot` swallows sweep errors and returns
`emptySnapshot()` (`collector.ts:59-66`). The only runtime-side rejection is
`getMemorySnapshot()`'s `runtime_unavailable` when there is no store
(`orca-runtime.ts:3841-3843`). The banner therefore fires on transport failure, `ok:false`, or a
store-less runtime — not on a failed process sweep.

## Blocks this touches that other patches may share

- **AppEnvironment** — this patch's producer depends on it (`collector.ts:268`). Suspected shared:
  `trusted-proxy-session` (edits `src/main/index.ts`, where all nine ports are installed at
  `:885-912`); `cli-registration` (`src/main/ipc/cli.ts`, and `cli-installer.ts:96-100` is an
  AppEnvironment consumer); `usage-analytics` (`telemetry/client.ts:56` is a consumer, and the patch
  edits `orca-runtime.ts`); every `orca-runtime.ts` patch — `execution-owner`,
  `runtime-seeded-settings`, `agent-cold-restore`, `headless-orchestration-delivery`,
  `floating-workspace-picker` — since that file holds ~23 `getAppEnvironment()` sites. All
  suspicions; I did not diff their hunks against the consumer line numbers.
- **orcad — the plain-Node runtime entrypoint** — `getAppMetrics: () => []` (`orcad-entry.ts:61`) is
  what degrades this tile's `app` section. Suspected shared: `trusted-proxy-session` (owns the
  `serve` CLI spec and launch path, `src/cli/specs/serve.ts`, `src/cli/runtime/launch.ts`);
  `headless-orchestration-delivery` (headless runtime behaviour). Suspicion.
- **src/shared/child-process — the spawn chokepoint** — the host half of this snapshot now spawns
  through `runProcess` (`host-memory.ts:88`, `windows-process-resource-collector.ts:154`). Suspected
  shared: `cli-registration` (`src/main/ipc/cli.ts` installs a binary) and `open-in-browser-editors`
  (`src/shared/open-in-applications.ts` launches an editor). Suspicion — I did not check whether
  either currently spawns or is on the import allowlist.
- **The runtime-electron ratchet** — `collector.ts` is inside the runtime graph
  (`orca-runtime.ts:733` imports it), and the baseline is empty. Any patch adding an `electron`
  importer reachable from `orca-runtime.ts` or `runtime-rpc.ts` fails `pnpm lint`. Suspected shared:
  all six `orca-runtime.ts`/`runtime-rpc.ts` patches listed above, plus `pairing-credentials`
  (`runtime-rpc.ts`, `rpc/core.ts`, `rpc/dispatcher.ts`).
- **vitest-host-ports-setup** — not used by this patch's test today (`web-resource-manager.test.ts`
  is renderer-only), but any test that exercises `collector.ts` needs
  `installFakeAppEnvironment({ getAppMetrics: ... })` rather than `vi.mock('electron')`. Flagging it
  for whichever patch's test reaches the main-process producer.

Not a block in `00-building-blocks.md`, but the sharpest collision surface for this patch, so
recording it here: **`src/renderer/src/web/web-preload-api.ts`** is edited by eight other patches —
`trusted-proxy-session`, `pairing-credentials`, `cli-registration`, `floating-workspace-picker`,
`runtime-seeded-settings`, `execution-owner`, `usage-analytics`, `workspace-restore`. Ours is the
only single-file, single-hunk one. Likewise **`MOBILE_RPC_METHOD_ALLOWLIST`**
(`runtime-rpc.ts:179-...`) already carries `diagnostics.memory` upstream, so this patch adds nothing
there — but `pairing-credentials` and `trusted-proxy-session` edit that file, and four patches edit
`mobile-rpc-allowlist.test.ts`.

## Unverified

- Nothing was executed. No build, no `quilt push`, no `vitest`, no live tile. Every claim is read
  from `git show v1.4.190:<path>` in `lib/orca`.
- I did not run `mise run test:series` or otherwise confirm the patch still applies; I compared the
  v1.4.188 and v1.4.190 texts of the target region and they are identical, which is not the same as
  a clean push through the two patches ahead of it in the series.
- I did not read `src/renderer/src/web/web-resource-manager.test.ts` to confirm the header's *To
  test* symptom is still what it asserts, nor that it still fails without the patch.
- I did not verify what the Resource Manager pane renders for an all-zero `snapshot.app` with a real
  `snapshot.host` — the orcad case. `ResourceUsageStatusSegment.tsx` is unchanged between the tags,
  but I did not trace its zero-value rendering.
- Whether orca-server ever runs `orcad` rather than the Electron `orca serve` path: I read this from
  `AGENTS.md` and the launch contract, not from a running host.
- The other-patch suspicions in the section above are from the file lists in `patches/*.diff` only. I
  did not open any sibling patch's hunks.
- `collector.ts:72` still holds `promisify(exec)` from `node:child_process` while the sibling files
  moved to `runProcess`. I did not check whether it is on
  `__fixtures__/child-process-import-allowlist.txt` or why it was left behind.
