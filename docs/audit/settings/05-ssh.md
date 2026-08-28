# ssh - what it needs to work in the browser

## State today

**Tile, published v4.190.1.** "SSH Hosts" is listed in the settings sidebar and in the Cmd+J
palette; selecting it leaves the content column empty - zero `[data-settings-section]` nodes.
Measured in phase 0 (`00-sections.md`), taken as fact here.

Phase 0 also measured `window.api.ssh.listTargets()` → `[]` on the live tile. That call is not a
local stub: it goes over the wire as `ssh.listTargetSummaries` and throws on a rejected envelope
(`web-preload-api.ts:3426-3434`, `callRuntimeResult:3553`). So `[]` proves the method dispatched and
the host answered an empty list - it does not prove the host has an SSH layer.

**Host, measured this pass over `coder ssh` (no browser, no writes):**

- The serve process is Electron, not orcad: `orca-ide --serve --serve-port --serve-trusted-proxy`
  (pid 793), children = 2 zygotes, `--type=gpu-process`, `--type=utility` NetworkService,
  `daemon-entry.js`, `computer-sidecar.js`, `parcel-watcher-process-entry.js`. **No `--type=renderer`
  child exists**, so no `BrowserWindow` was ever created.
- `~/.config/orca/orca-data.json` holds no key matching `ssh` (read for key *names* only, no values
  printed). No SSH target is persisted.
- No `~/.ssh/config` on the host.
- `~/.config/orca/logs/` (`daemon.log`, `main.trace.ndjson`) contains no line matching `ssh`.

**Desktop, for contrast** (`SshPane.tsx`): the host list, `Import` and `Add Target` in the header,
and per target `Connect` / `Disconnect` / `Test` / `Edit` / `Remove` / `End remote terminals` /
`Reset relay`, with live status from `sshConnectionStates`.

## Which gate, and why

**Gate 2 alone, then a wire.** Order: build the wire first, open gate 2 last.

- **Gate 1 - already open.** `useSettingsNavigationMetadata.ts` is rewritten by
  `patches/settings-nav-web-parity.diff`, shipped in v4.190.1. That is why the row is listed.
- **Gate 2 - closed, and this is the blank.** `Settings.tsx:1751` (pristine, verified;
  v4.190.1 shipped = `:1754`, the +3 confirmed from `pairing-credentials.diff`'s hunk header
  `@@ -1741,7 +1741,10 @@`. In *this* worktree it reads `:1745` - the uncommitted
  `settings-nav-web-parity.diff` opens gate 2 for `computer-use` and nets -6 above it; that is
  branch state, not the audited artifact):
  `{showDesktopOnlySettings ? <SettingsSection id="ssh"> … <SshPane
  addTargetIntentSignal={sshHostAddIntentSignal} /> … : null}`. The id is selectable via gate 1, the
  fallback at `Settings.tsx:1098` therefore does not fire, and nothing renders.
- **Gate 3** - not involved.
- **Gate 4 - not present.** No `isWebClientLocation()` in `SshPane.tsx`, `SshTargetCard.tsx`,
  `SshTargetForm.tsx`, `SshHostAdvancedFields.tsx`, `SshTargetDestructiveActions.tsx`,
  `SshDestructiveActionDialog.tsx`, `SshPassphraseDialog.tsx`, `ssh-*.ts`, `use-ssh-*.ts` (grepped
  across the shipped subtree). There is nothing pane-internal to open.

Opening gate 2 by itself does not leave the pane blank - it leaves it **lying**, which is the state
this audit exists to stop. See Verdict.

## What the pane actually needs

**First, the fact that changes every verdict below.** `ssh` is a **present** key in the web preload
(`web-preload-api.ts:926`, `createSshApi` at `:3423-3500`), and every member of it is explicitly
defined. `withFallback` / `createFallbackProxy` (`:4534-4594`) is **never reached for `ssh.*`** -
shared dependency #5 does not apply here. Each gap is a hand-written literal in the preload, and each
one is readable in the shipped tree. I verified the shipped `createSshApi` is byte-identical to
pristine: no patch in `patches/series` touches it.

**Second, the root cause on the host.** `SSH_METHODS` reads
`src/main/ssh/ssh-target-registry.ts`, whose store is installed by exactly one non-test line:
`setSshTargetRegistryStore(new SshConnectionStore(store))` at `ipc/ssh.ts:968`, **inside**
`registerSshHandlers` (`:955`). `registerSshHandlers`'s only non-test caller is
`attach-main-window-services.ts:159`, reached from `index.ts:1591` on the window-creation path, and
it takes `getMainWindow: () => BrowserWindow | null`. `orca serve` boots Electron with no window
(measured above: no renderer process), so `attachMainWindowServices` never runs, `sshStore` stays
`null`, and the handler slots stay `null`. Consequences, straight from the registry source:

- `listRegisteredSshTargets()` → `sshStore?.listTargets() ?? []` → **always `[]`**
  (`ssh-target-registry.ts:54-56`).
- `connectRegisteredSshTarget()` → **throws `ssh_handlers_not_registered`**
  (`ssh-target-registry.ts:40-47`).

So the "real half" of the `ssh` preload is real code against an empty registry.

| operation | pane call site | preload today | host today | verdict |
| --- | --- | --- | --- | --- |
| list targets | `SshPane.tsx:55` | **real** - `ssh.listTargetSummaries` (`:3426`) | `SSH_METHODS` `rpc/methods/ssh.ts:46` | **stubbed by absence.** Method dispatches; registry empty. Also returns `SshTargetSummary = Pick<SshTarget,'id'\|'label'>` (`shared/ssh-types.ts:59`) deliberately - "SSH addresses, jump chains, and credentials remain HUB-private" (`rpc/methods/ssh.ts:48`) - and the preload casts it to `SshTarget[]`. `host`, `port`, `username`, `identityFile`, `jumpHost`, `source`, `portForwards` all arrive `undefined` |
| auto-sync `~/.ssh/config` on open | `SshPane.tsx:79` | **stub** - `{targets: [], repoReadoptions: []}` (`:3449`) | no RPC method | **absent.** Never leaves the browser |
| Import button | `SshPane.tsx:301` | same stub | no RPC method | **absent.** Toasts "~/.ssh/config already in sync" without asking the host |
| add target | `SshPane.tsx:116` | **rejects** - "SSH target management is unavailable in the web client." (`:3444`) | no RPC method | **absent** |
| update target | `SshPane.tsx:114` | **rejects** (`:3446`) | no RPC method | **absent** |
| remove target | `ssh-target-remove.ts:36` | **stub** - `Promise.resolve()` (`:3448`) | no RPC method | **absent.** Silent success; the pane then toasts "Target removed" |
| end remote terminals | `ssh-session-termination.ts:5,14` | **stub** (`:3467`) | no RPC method | **absent** |
| connect | `SshPane.tsx:195`, `ssh-session-termination.ts:13` | **real** (`:3459`) | `ssh.connect` `rpc/methods/ssh.ts:28` | **stubbed by absence.** Throws `ssh_handlers_not_registered`, caught and remapped to the generic `getPublicSshError` string |
| disconnect | `SshPane.tsx:208` | **stub** (`:3466`) | no RPC method | **absent** |
| reset relay | `SshPane.tsx:239` | **stub** (`:3468`) | no RPC method | **absent** |
| test connection | `SshPane.tsx:263` | **hardcoded failure** - `{success:false, error:'Unavailable in the web client.'}` (`:3480`) | no RPC method | **absent** |
| live connection status | store, not IPC - `SshPane.tsx:27-30` reads `sshConnectionStates` | n/a (`ssh.onStateChanged` at `:3485` is a noop and is **not** what the pane uses) | **real wire**: `runtime.clientEvents` snapshot `{sshStates}` (`client-events.ts:50-55`) + push via `currentRuntime.notifySshStateChanged` (`ipc/ssh.ts:428`) | **stubbed by absence.** The snapshot is built from `listRegisteredSshTargets()` |
| passphrase prompt | `SshPassphraseDialog.tsx:69,88` (app-level, not in the pane) | **noops** - `onCredentialRequest`/`onCredentialResolved`/`submitCredential` (`:3496-3498`) | host side is `registerCredentialHandler(getCurrentMainWindow)` (`ipc/ssh.ts:972`), window-bound | **absent.** A connect to a passphrase-gated key is unanswerable from the tile |

**Building blocks by name (`00-building-blocks.md`):**

- **Modules split out of `src/main/ipc/*`** → `src/main/ssh/ssh-target-registry.ts` (89 lines).
  **Exists**, and it is the seam. Today it carries only the store plus `{connect, getState}`
  (`:24-38`); the management half has no slot.
- `SshConnectionStore` (`src/main/ssh/ssh-connection-store.ts`) - owns target CRUD, removed-target
  tombstones and `listRemovedTargetLabels`. **Exists**, constructed only inside
  `registerSshHandlers`.
- `SSH_METHODS` (`src/main/runtime/rpc/methods/ssh.ts`) - **exists**, five methods, all reads plus
  `connect`.
- `MOBILE_RPC_METHOD_ALLOWLIST` (`runtime-rpc.ts:179`) - all five current `ssh.*` methods are on it
  (`:388-392`), enforced at `:1656` against `device.scope === 'mobile'`.

**Does not apply:** `syncRuntimeBackedSettings` (`:3960`) and `SettingsUpdate`
(`client-ui-schemas.ts:128`). No SSH state is a settings key - targets persist through
`SshConnectionStore` over the profile store. This pane does not collide with shared dependencies

## 3 or #4

### Verdict

**Needs a wire built first.**

Opening gate 2 alone gives a pane that renders and reports host state it never read: the empty-state
card "No SSH targets configured." (`SshPane.tsx:376-382`), an `Import` button that toasts
"~/.ssh/config already in sync" without a round trip, an `Add Target` form whose Save rejects with
"SSH target management is unavailable in the web client.", and a `Remove` that toasts "Target
removed" having done nothing. That is a worse failure than the blank pane, not a smaller one.

The capability itself is not browser-hostile. Every operation is host-side work the host already
implements in `src/main/ipc/ssh.ts`; none of it needs a local filesystem, a native dialog, or a
window. Two things are missing: the SSH layer is never installed under `orca serve` at all, and the
management half has no runtime RPC. Both are ordinary wiring.

### Size of the work

Three pieces, in this order. The first is not settings work and is worth doing on its own.

**1. Install the SSH layer under `orca serve`.** One hunk in `src/main/index.ts`: call
`registerSshHandlers(store, () => null, runtime)` at process level when `isServeMode` (`:518`),
beside the `setPtyHostBindings({ ipc: ipcMain, power: powerMonitor })` install at `:892`. Upstream's
comment on that exact line is this bug, for PTY: *"Installing this in attachMainWindowServices meant
`orca serve` registered its PTY handlers against no-ops before any window attached, so a paired
desktop owner never received them."* Same move, same file, same reason - tier 1 of the quality bar.
`registerSshHandlers` is already re-entrant (it removes its own `ipcMain` channels first, `:961-964`,
because macOS re-activation re-calls it) and its broadcast path is already null-window-safe and
already fans out to paired clients (`broadcastSshState:423-428`). This alone makes `listTargets`,
`getState`, `connect` and the `clientEvents` `sshStates` snapshot answer real data - and it fixes
SSH-backed repos, workspaces and terminals on orca-server, not just this pane.

**2. The management half over the wire.**

- `src/main/ssh/ssh-target-registry.ts` - widen the handler record past `{connect, getState}` to
  carry `addTarget` / `updateTarget` / `removeTarget` / `importConfig` / `testConnection` /
  `disconnect` / `terminateSessions` / `resetRelay`. `disconnectRegisteredSshTarget` and
  `removeRegisteredSshTarget` are already exported from `ipc/ssh.ts` (`:125,132`) but importing that
  module into the runtime graph is what the split exists to prevent, so they go through the registry.
- `src/main/ipc/ssh.ts` - install them at the existing `setSshTargetRegistryHandlers` call (`:1121`).
  The file is 1807 lines; the change is at its two registration points, not through it.
- `src/main/runtime/rpc/methods/ssh.ts` - the matching `defineMethod`s with zod params.
- `src/main/runtime/runtime-rpc.ts` - **leave `MOBILE_RPC_METHOD_ALLOWLIST` untouched.** Host-mutating
  SSH methods on a phone-reachable list is the escalation the invariant names.
- **The detail read is a decision, not a detail.** Editing a target needs the whole `SshTarget`, and
  `listTargetSummaries` withholds it by design. A detailed method must be scope-gated: orcad mints
  its offer with `scope: 'runtime'` (`orcad-entry.ts:185`) and the dispatcher already discriminates
  on `device.scope` (`runtime-rpc.ts:1656`). `SshTarget` carries no secret material - host, port,
  username, identity-file *paths*, `ProxyCommand`, `ProxyJump` - but it is host-identifying, so
  widening it to runtime-scope clients is a deliberate call to make in the patch header.

**3. The preload and gate 2.** `web-preload-api.ts` `createSshApi` (`:3423-3500`) - replace the
eleven literals with `callRuntimeResult` calls. `Settings.tsx:1751` - gate 2, with gate 1 left open.

**Patch ownership.**

- `Settings.tsx` and `useSettingsNavigationMetadata.ts` → `patches/settings-nav-web-parity.diff`,
  the only patch that may own them (`00-sections.md` #1, #7). The `ssh` block at `:1751` sits four
  lines after `pairing-credentials.diff`'s `Settings.tsx` hunk at `:1741-1747` - adjacent hunks,
  watch the context lines.
- Everything else → a **new patch**, `ssh-host-management.diff`, shaped like
  `plugins-web-bridge.diff` (same problem: a preload namespace whose write half has no runtime
  method). No patch in `patches/series` carries an `Index:` line for any `ssh` path, and the `src/`
  overlay holds no `ssh` file - so `ipc/ssh.ts`, `ssh-target-registry.ts`, `rpc/methods/ssh.ts` and
  `createSshApi` are unowned. `createSshApi` is byte-identical to pristine, verified by diff.
- **`src/main/index.ts` is already owned by three patches** - `trusted-proxy-session.diff`
  (`:1953`, `:1980`, `:3164`), `usage-analytics.diff` (`:47`, `:2543`) and `web-share-surfaces.diff`
  (`:39`, `:2847`). None touches the process-level install block inside `hasSingleInstanceLock`
  (`:880-900`, where `setPtyHostBindings` sits), so step 1's hunk has no overlapping context; the
  new patch stacks after `web-share-surfaces.diff`, last in `series`.
- Tests live in the overlay (`src/`), and the header must name them in backticks or `series.bats`
  fails: one that the management RPCs reach `SshConnectionStore`, and one that asserts every new
  `ssh.*` write method is **absent** from `MOBILE_RPC_METHOD_ALLOWLIST`. Write them from the *To
  test* symptom - add a target in the tile, reload, see it listed - not from the implementation.

### Blocks this shares with other sections

- **`Settings.tsx:343` and its 11 JSX gates, owned by `patches/settings-nav-web-parity.diff`**
  (`00-sections.md` #1, #2, #7). Shared with `computer-use`, `orca-account`, `mobile`, `browser`,
  `plugins`, `mobile-emulator`, `developer-permissions`, `voice`, `notifications`, `advanced`. The
  ssh hunk cannot be authored independently of theirs; one patch owns the file.
- **`MOBILE_RPC_METHOD_ALLOWLIST` (`runtime-rpc.ts:179`).** Shared with `plugins`, whose missing
  write half (`install` / `refresh` / `remove`) faces the identical "must not be phone-reachable"
  constraint, and with `mobile`, which is what the allowlist is for.
- **Modules split out of `src/main/ipc/*`** (`00-building-blocks.md`). `ssh-target-registry.ts` here,
  `plugin-client-list.ts` for `plugins`, `preflight/agent-detection.ts` elsewhere. Same seam, same
  technique, and it is upstream's own move so it merges rather than conflicts.
- **NEW - carry this back to phase 0: registries populated only by `attachMainWindowServices`.**
  `orca serve` runs Electron with no `BrowserWindow` (measured: no `--type=renderer` in the live
  process tree), so `attach-main-window-services.ts` never runs and every registry it installs stays
  null. Of the five v1.4.190 split-out modules, **only `ssh-target-registry` is populated there** -
  `plugin-client-list.ts` takes its `PluginService` as an argument and holds no state, and
  `preflight/agent-detection.ts` is pure functions, so `plugins` and the preflight paths are *not*
  affected by this. What is affected beyond this pane: **the sidebar's Add Remote Host dialog**
  (`add-remote-host-ssh-actions.ts:28-32` calls `addTarget` / `listConfigHosts` / `resolveConfigHost`
  / `importConfig`), and **SSH-backed repos, workspaces and terminals** on orca-server generally.
  Step 1 above fixes all of them at once.
- **Explicitly NOT shared:** `syncRuntimeBackedSettings` / `SettingsUpdate` (#3, #4) - no SSH state
  is a settings key, so this pane is not one of the panes that renders and never reaches the host for
  that reason; and `withFallback` / `createFallbackProxy` (#5) - `ssh` is a present namespace at
  `web-preload-api.ts:926`, so nothing here resolves through the proxy. `browser`, `notifications`,
  `advanced` and `appearance` collide on #3; `plugins` and `speech` collide on #5. `ssh` collides
  with neither, and its failure mode is different in kind: hand-written stubs plus an uninstalled
  host layer.

### Unverified

- **Whether `SshPane` renders correctly once gate 2 opens.** Read from source, not built and not run.
  Predicted: it renders, with the empty-state card. Probe that would settle it: open gate 2 locally,
  `mise run up`, mount `SshPane` in vitest against the web preload.
- **Whether every path inside `registerSshHandlers` tolerates `() => null` for the window.**
  `broadcastSshState` was traced and does (`:423-428`). `registerCredentialHandler(:972)`,
  `registerAdvertisedUrlRefresh(:970)`, `registerPowerMonitorReconnect` and
  `registerSshBrowseHandler` were **not** traced. This is the main risk in step 1.
- **The registry-never-populated claim** rests on source (`setSshTargetRegistryStore` has exactly one
  non-test call site, inside a window-bound function) plus the live process tree (no renderer
  process). It is **not distinguishable over the wire**: `ssh.connect` maps both
  `ssh_handlers_not_registered` and "no such target" to the same `getPublicSshError` string
  (`rpc/methods/ssh.ts:33-36`), so no client-side probe separates them. No connect probe was made.
- **No live probe of `window.api.ssh.*` was run in this pass, and no browser was started.** The stub
  verdicts are read from the shipped `lib/orca/src/renderer/src/web/web-preload-api.ts`, verified
  byte-identical to pristine for `createSshApi`. Phase 0's `listTargets() → []` is the one measured
  call. Probe that would add most, if someone drives the tile: on a host where step 1 has landed and
  one target exists, `await window.api.ssh.listTargets()` - a result with `host`/`port`/`username`
  `undefined` confirms the summary-only narrowing is what breaks the edit form.
- **`HostRemoveDialog`'s workspace-aware removal path** (`SshPane.tsx:427-439`) was not traced. It
  removes repos and worktrees, not just an SSH target, and may need wires outside the `ssh`
  namespace.
- **Whether SSH execution hosts surface in the `servers` section** or elsewhere in the tile, and what
  else in the app is dead for the same `attachMainWindowServices` reason, was not enumerated beyond
  the Add Remote Host call sites.
- **`ipc/ssh.ts` was read at its registration points only** (`:955-975`, `:1121-1124`, `:412-440`,
  `:1798-1800`). A window dependency in one of the ~25 other `getCurrentMainWindow` sites would not
  appear in this report.
- Nothing was assembled, built or run: no `quilt push`, no `mise run up`, no vitest, no build. The
  tree was read with the series applied, as found. Nothing on the host was written; the store was
  read for key *names* only.
