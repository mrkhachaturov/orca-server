# v1.4.190 building blocks

Shared vocabulary for the v1.4.188 → v1.4.190 audit. Every path is relative to `lib/orca/`
at tag `v1.4.190`; every line number is `git show v1.4.190:<path>`.

v1.4.190 finished the host-port migration: the runtime graph reaches zero `electron` imports
and boots on plain Node via `orcad`. Nine injection points replace what used to be direct
`electron` imports. Two throw when uninstalled, seven degrade.

## The port table

| Port | Interface | Accessor | Desktop impl | Absent behaviour |
| --- | --- | --- | --- | --- |
| AppEnvironment | `src/shared/app-environment.ts:20` | `getAppEnvironment()` | `src/main/host/electron-app-environment.ts:8` | **throws** |
| SecretStore | `src/shared/secret-store.ts:13` | `getSecretStore()` | `src/main/host/electron-secret-store.ts:8` | **throws** |
| MainHttpClient | `src/main/network/http-client.ts:22` | `getMainHttpClient()` | `src/main/host/electron-http-client.ts:11` | Node `globalThis.fetch` |
| RuntimeDesktopSurface | `src/main/runtime/runtime-desktop-surface.ts:18` | `getRuntimeDesktopSurface()` | `src/main/host/electron-runtime-desktop-surface.ts:5` | inert |
| RuntimeBrowserCommandsFactory | `src/main/runtime/runtime-browser-commands-factory.ts:19` | `createRuntimeBrowserCommands()` | `src/main/host/electron-browser-commands.ts:5` | rejecting Proxy |
| SpeechServiceFactories | `src/main/speech/speech-runtime-service.ts:24` | `getSpeechModelManager()` / `getSpeechSttService()` | `src/main/host/electron-speech-services.ts:6` | throws per call |
| PtyIpcSurface / PtyPowerSurface | `src/main/ipc/pty-host-bindings.ts:22,29` | `getPtyIpc()` / `getPtyPower()` | `ipcMain` / `powerMonitor`, `src/main/index.ts:892` | no-op |
| Default proxy session | `src/main/network/proxy-settings.ts:18` | internal `defaultProxySession()` | `() => session.defaultSession`, `src/main/index.ts:904` | `null` |
| WorktreeWatcherRemoval | `src/main/ipc/worktree-watcher-removal.ts:16` | `getWorktreeWatcherRemoval()` | `desktopWorktreeWatcherRemoval`, `src/main/ipc/filesystem-watcher.ts:1965` | inert |

Only two interfaces live in `src/shared/`. The other seven are `src/main/` modules whose
Electron-touching half moved to `src/main/host/` or stayed with the handler layer.

The desktop installs all nine in one block: `src/main/index.ts:885-912`, inside the
`hasSingleInstanceLock` guard, before anything resolves a path or reads a credential.
`orcad` installs two (`installOrcadHostAdapters`, `src/main/orcad/orcad-entry.ts:84`).

---

## AppEnvironment

Owns the host-process facilities Orca's core used to read off Electron's `app`: data paths,
version, packaged flag, app metrics, shutdown hook.

**Accessor** — `getAppEnvironment()` (`src/shared/app-environment.ts:79`), throws if
uninstalled. `hasAppEnvironment()` (`:75`) for callers legitimately running in a plain-Node
fork with no app root. `setAppEnvironment()` (`:67`).

**Methods** — `getPath(name)`, `getAppPath()`, `getVersion()`, `isPackaged()`,
`onWillQuit(handler)`, `exit(code?)`, `getAppMetrics()` (`src/shared/app-environment.ts:22-36`).
`AppPathName` = `'userData' | 'home' | 'appData' | 'temp' | 'downloads' | 'logs' | 'exe'` (`:18`).
`AppProcessMetric` (`:40`) is a loose structural mirror of Electron's `ProcessMetric`, so
`src/shared/**` stays Electron-free.

**Storage** — a realm-anchored global, `Symbol.for('orca.host.appEnvironment')` (`:54`), so
`vi.resetModules()` cannot silently un-install it.

**Consumers** (non-test, ~25 sites): `src/main/persistence/loading-store/user-data-path.ts:14,22,61`,
`src/main/runtime/orca-runtime.ts:3933,4246,5008,5226,5717` (+18 more in that file),
`src/main/cli/cli-installer.ts:96-97,100`, `src/main/terminal-history-paths.ts:13,17,22`,
`src/main/terminal-scrollback-snapshots.ts:30`, `src/main/telemetry/client.ts:56`,
`src/main/memory/collector.ts:268` (sole `getAppMetrics` caller),
`src/main/ipc/pty/runtime/spawn-preflight.ts:244,249,251`,
`src/main/ipc/pty/ipc/spawn-env-codex.ts:126,133,135`,
`src/main/ipc/pty/provider/local-configure.ts:58,60`,
`src/main/ipc/pty/delivery/debug-snapshot.ts:51`,
`src/main/orca-profiles/profile-storage-paths.ts:16,21`,
`src/main/pi/titlebar-extension-service.ts:77,126`, `src/main/mimo/hook-service.ts:57`,
`src/main/opencode/hook-service.ts:1099,1108`, `src/main/speech/stt-service.ts:485,567`,
`src/main/window/clipboard-image-temp-file.ts:42`,
`src/main/agent-hooks/wsl-hook-relay-launch.ts:46`.
`hasAppEnvironment()` guards: `src/main/computer/sidecar-client.ts:115`,
`src/main/ipc/parcel-watcher-entry-path.ts:11`,
`src/main/ai-vault/session-scanner-service-entry-path.ts:11`,
`src/main/ports/port-scan-command-client.ts:329`.

**A patch should route into this when** it needs `userData`, the bundle root, the version, or
a shutdown hook — never `app.getPath` and never a hand-rolled path constant.

## SecretStore

Owns at-rest secret encryption (Electron `safeStorage` on the desktop) *and* the honest
description of how well it is actually protecting.

**Accessor** — `getSecretStore()` (`src/shared/secret-store.ts:53`), throws if uninstalled.
`hasSecretStore()` (`:63`), `setSecretStore()` (`:49`), `_resetSecretStoreForTests()` (`:68`).
Realm-anchored at `Symbol.for('orca.host.secretStore')` (`:37`).

**Methods** — `isEncryptionAvailable()`, `encryptString(plainText): Buffer`,
`decryptString(cipher): string`, `describeProtectionGap(): string | null`
(`src/shared/secret-store.ts:14-27`).

`describeProtectionGap()` is deliberately separate from `isEncryptionAvailable()`: on Linux
without a keyring Electron falls back to `basic_text`, which round-trips with a hardcoded
password. Reporting it unavailable would strand every already-sealed credential; reporting it
sealed is the lie the gap string exists to prevent
(`src/main/host/electron-secret-store.ts:29-35,63-67`).

**Consumers**: `src/main/protected-secret-persistence.ts:80,112,136`,
`src/main/integration-credential-file.ts:34,35,114,116`,
`src/main/jira/site-credential-store.ts:160,161`, `src/main/linear/linear-token-store.ts:36,37`,
`src/main/speech/openai-api-key-store.ts:56,57,80,85,86`,
`src/main/host/secret-protection-report.ts:53`.

**A patch should route into this when** it persists a credential — the sealing decision and
the "unsealed, and here is why" message are both already made here.

## MainHttpClient

Owns outbound HTTP for main-process integrations. The desktop uses Chromium's stack (follows
session/proxy state, avoids undici stale keep-alive after a VPN path change, sends a Chrome
UA that Jira's XSRF check depends on).

**Accessor** — `getMainHttpClient()` (`src/main/network/http-client.ts:39`).
`setMainHttpClient(client | null)` (`:35`); `null` restores the Node default (`:28-31`).
Never throws.

**Methods** — `fetch(url, init?): Promise<Response>`, `proxySession(): Session | null`
(`:23-25`).

**Consumers**: `src/main/jira/authenticated-request.ts:61` — the only non-test caller at
v1.4.190.

The port hands the `Response` straight through and never inspects it, so the undici
consume/cancel obligation stays with the caller (`:16-20`). The Node fallback is a real
behavioural difference (proxy from env, Node UA), not a transparent swap.

**A patch should route into this when** it makes an outbound HTTP call from the main process
— it is the seam that keeps proxy behaviour host-appropriate under `orca serve`.

## RuntimeDesktopSurface

Owns the three desktop facilities `OrcaRuntimeService` uses and a Node host does not have:
native notification, authoritative renderer window lookup, and one `ipcMain` channel
(`terminal:tabCreateReply`).

**Accessor** — `getRuntimeDesktopSurface()` (`src/main/runtime/runtime-desktop-surface.ts:40`).
`setRuntimeDesktopSurface(surface | null)` (`:36`); `null` restores `inertDesktopSurface`
(`:27-32`). Never throws.

**Methods** — `showNotification({title, body}): boolean`,
`findWindowById(id): BrowserWindow | null`, `onIpc(channel, listener)`,
`removeIpcListener(channel, listener)` (`:20-24`).

**Optional-when-absent semantics** (`:14-15`): with no renderer the tab-create fallback is
unreachable anyway — `createTerminal` already takes the background spawn branch when there is
no authoritative window. A missed notification is not a downgrade because the runtime already
routes to paired clients, which is the better destination.

**Consumers** — all in `src/main/runtime/orca-runtime.ts`: `showNotification` at `:14396`;
`onIpc`/`removeIpcListener` on `terminal:tabCreateReply` at `:28437,28449,28456` and
`:28808,28816,28828,28837`; `findWindowById(this.authoritativeWindowId)` at `:38650`.

**A patch should route into this when** it wants a toast, the authoritative window, or a
main↔renderer channel from inside the runtime — do not import `BrowserWindow`/`ipcMain`/
`Notification` into the runtime graph.

## RuntimeBrowserCommandsFactory

Owns how `OrcaRuntimeService` obtains browser-automation commands. Importing
`orca-runtime-browser.ts` for its *type* is free; constructing it pulls in 15 modules of
Chromium cluster (`BrowserWindow`, `session`, `webContents`, cookie jars).

**Accessor** — `createRuntimeBrowserCommands(host)`
(`src/main/runtime/runtime-browser-commands-factory.ts:36`).
`setRuntimeBrowserCommandsFactory(factory | null)` (`:25`).

**Shape** — `RuntimeBrowserCommandsFactory = (host: RuntimeBrowserCommandHost) => RuntimeBrowserCommands`
(`:19-21`).

**Absent behaviour** — a `Proxy` that throws `browser_unavailable: <method> needs a desktop
host` per call, with `then` returning `undefined` so an awaited value is not mistaken for a
thenable (`:42-52`). Construction still succeeds, so the runtime boots; the capability is
simply not advertised. Explicitly *not* a stub with silently-succeeding methods.

**Consumers**: `src/main/runtime/orca-runtime.ts:38173` (`private readonly browserCommands`),
imported at `:660`.

**Capability pairing** — the runtime filters `browser.screencast.v1` on
`hasRenderer || hasOffscreen` and adds `BROWSER_HEADLESS_RUNTIME_CAPABILITY` /
`BROWSER_CERTIFICATE_TRUST_RUNTIME_CAPABILITY` at
`src/main/runtime/orca-runtime.ts:6101-6121`, so clients never offer the affordance.

**A patch should route into this when** it adds a browser-pane capability: install a factory,
do not import the browser cluster from the runtime, and add the matching capability flag so
clients degrade instead of failing.

## SpeechServiceFactories

Owns construction of `ModelManager` (downloads models through Electron's streaming
`net.request` — byte-range resume, progress events, manual idle timeout) and `SttService`
(resolves paths inside the packaged app).

**Accessors** — `getSpeechModelManager(store)` (`src/main/speech/speech-runtime-service.ts:46`),
`getSpeechSttService(store)` (`:55`). Both lazily construct and memoise.
`setSpeechServiceFactories(next | null)` (`:33`) resets both caches.

**Methods** — `createModelManager(customModelsDir: string | undefined): ModelManager`,
`createSttService(models: ModelManager): SttService` (`:25-26`).

**Absent behaviour** — `requireFactories()` throws
`speech_unavailable: this host has no speech services` (`:39-44`). Per call, not at install.

**Consumers**: `src/main/ipc/speech.ts:21,39,69,75,76,85,103,151,173,202,211`;
`src/main/runtime/orca-runtime.ts:14429,14463,14483,14484,14543,14569,14636,14660,14687,14702`.

**A patch should route into this when** it touches dictation or STT — the desktop factory is
`electronSpeechServiceFactories` (`src/main/host/electron-speech-services.ts:6`); a web host
needs its own factory pair, not a stub.

## PtyIpcSurface / PtyPowerSurface

Owns what the PTY handlers register against. Everything else in the PTY module was already
host-agnostic; a static `ipcMain` / `powerMonitor` import was the only thing pinning it to
Electron.

**Accessors** — `getPtyIpc()` (`src/main/ipc/pty-host-bindings.ts:62`), `getPtyPower()` (`:66`).
`setPtyHostBindings({ipc?, power?})` (`:54`); missing members fall back to
`noopPtyIpcSurface` / `noopPtyPowerSurface` (`:34-43`).

**Methods** — `PtyIpcSurface`: `handle`, `on`, `removeHandler`, `removeAllListeners` (`:23-26`).
`PtyPowerSurface`: `on('suspend' | 'resume', listener)` (`:30`). Rest args are `any[]` on
purpose, matching Electron's own `IpcMain` signature.

**Consumers**: `src/main/ipc/pty/register-handlers.ts:70`, `src/main/ipc/pty/ipc/inspect.ts:43`,
`ipc/resize-visibility.ts:37`, `ipc/serialize-buffer.ts:22`, `ipc/snapshot.ts:24`,
`ipc/spawn.ts:6`, `ipc/write.ts:11`, `delivery/debug.ts:52` (`getPtyPower`).
Test harness: `src/main/ipc/pty-ipc-suite-environment.ts:112`.

**Install site note** — installed at process level in `src/main/index.ts:892`, not per window.
Doing it in `attachMainWindowServices` meant `orca serve` registered its PTY handlers against
no-ops before any window attached, so a paired desktop owner never received them
(`src/main/index.ts:887-891`).

**A patch should route into this when** it adds a PTY IPC channel — register through
`getPtyIpc()`, never a direct `ipcMain` import in the PTY tree.

## Default proxy session resolver

Owns the one Electron value `src/main/network/proxy-settings.ts` needed:
`session.defaultSession`.

**Accessor** — `setDefaultProxySessionResolver(resolve | null)`
(`src/main/network/proxy-settings.ts:18`); read internally by `defaultProxySession()` (`:22`),
which answers `null` when no resolver is installed. `setSessionProxyIfPresent` skips the apply
entirely on `null` (`:27-35`).

**Why a resolver and not a Session** — `session.defaultSession` throws until the app is ready,
and this installs during pre-ready bootstrap (`:13-17`).

**Consumers**: installed at `src/main/index.ts:904`; imported there at `:379`.

**A patch should route into this when** it needs proxy state — on a Node host the environment
variables are the whole answer.

## WorktreeWatcherRemoval

Owns removal-time coordination for the renderer-facing filesystem watchers: close the watcher
holding a worktree directory open, then restore it (removal failed) or drop the snapshot
(removal succeeded).

**Accessor** — `getWorktreeWatcherRemoval()` (`src/main/ipc/worktree-watcher-removal.ts:40`).
`setWorktreeWatcherRemoval(next | null)` (`:36`); `null` restores `inert` (`:25-32`).

**Methods** — `closeLocal(worktreePath, deadline?)`, `restoreLocal(worktreePath)`,
`forgetLocal(worktreePath)`, `closeRemote(connectionId, worktreePath)`,
`restoreRemote(connectionId, worktreePath)`, `forgetRemote(connectionId, worktreePath)` (`:17-22`).

**Desktop impl** — `desktopWorktreeWatcherRemoval`, `src/main/ipc/filesystem-watcher.ts:1965`;
installed at `src/main/index.ts:912`.

**Inert is correct, not a stub** — every entry in those maps arrives through an `ipcMain`
handler carrying a renderer `sender`, so a host with no renderer has nothing to close (`:11-14`).

**A patch should route into this when** worktree removal must stop watchers — it is the seam
that lets removal work identically with and without a renderer.

---

## orcad — the plain-Node runtime entrypoint

`src/main/orcad/orcad-entry.ts` (270 lines). Executable shim: `src/main/orcad/main.ts`.
Bundled by `config/scripts/build-orcad.mjs` → `out/orcad/orcad.js`
(`pnpm run build:orcad`, `package.json:33`).

**Installs** (`installOrcadHostAdapters`, `:84-87`) — exactly two ports, the two that throw:

- `setAppEnvironment(createNodeAppEnvironment())` (`:31-63`). userData = `$ORCA_USER_DATA` →
  `$XDG_DATA_HOME/Orca` → `~/.orca` (`:22-29`). `getPath`: `home`→`homedir()`, `temp`→`tmpdir()`,
  everything else → userData (`:54`). `getAppPath()` = `process.cwd()` (`:55`).
  `getVersion()` = `$ORCA_VERSION ?? '0.0.0-orcad'` (`:56`). `isPackaged()` = `true` (`:57`).
  `onWillQuit` collects handlers drained on SIGTERM/SIGINT (`:36-52,58`). `getAppMetrics()` = `[]` (`:61`).
- `setSecretStore(createNodeSecretStore())` (`:70-82`). `isEncryptionAvailable()` = `false`;
  `encryptString`/`decryptString` throw `orcad_secret_sealing_unavailable`;
  `describeProtectionGap()` returns the "no OS keyring, pair from a desktop" string.

**Deliberately NOT installed** (`:8-12`) — `RuntimeDesktopSurface`, `RuntimeBrowserCommandsFactory`,
`SpeechServiceFactories`, `MainHttpClient`, the proxy resolver, `WorktreeWatcherRemoval`, and
the PTY IPC/power bindings. Each degrades per its own port. The renderer window is the single
exception: `registerPtyHandlers` takes a non-null `BrowserWindow`, so
`registerHeadlessPtyRuntime` fakes one that reports `isDestroyed() === true`
(`src/main/ipc/pty/register-headless-runtime.ts:29-37`).

**Capability downgrades passed to `new OrcaRuntimeService(store, undefined, {...})`** (`:132-147`):

| Option | orcad value | Constructor default | Consequence |
| --- | --- | --- | --- |
| `getLocalProvider` | `() => getLocalPtyProvider()` (lazy) | `null` (`orca-runtime.ts:3773`) | eager reference would freeze the pre-daemon provider |
| `getSshProvider` | `(id) => getSshPtyProvider(id)` | `null` (`:3774`) | destructive worktree removal refuses to run without one |
| `canRecoverPersistentLocalPtys` | `() => false` | `() => true` (`:3758`) | orcad runs no terminal daemon; default would claim a capability it lacks. Read at `:4375,4700` |
| `getDesktopWindowStatus` | `() => 'blocked'` | `() => 'openable'` (`:3778`) | `'openable'` powers serve→desktop promotion, impossible on Node. Published at `:6127` as `hasRenderer ? 'available' : fn()` |

`RuntimeDesktopWindowStatus = 'available' | 'openable' | 'initializing' | 'blocked'`
(`src/shared/runtime-types.ts:48`). Option declarations: `orca-runtime.ts:3694,3695,3716,3726`.

**Boot sequence** (`startOrcad`, `:106-218`) — all imports are dynamic, after the adapters are
installed: `initOrcaProfilePaths()` → `ensureActiveOrcaProfile(userDataPath)` → real `Store`
(without one, persistence-backed RPC throws `runtime_unavailable` and read paths quietly answer
empty, `:124-127`) → `initSshHostKeyStoreFile(profile.dataFile)` (`:130`) → runtime →
`registerHeadlessPtyRuntime(runtime, undefined, () => store.getSettings(), undefined, store)`
(`:156`; codex-home and Claude-auth preparation left unset on purpose, `:153-155`) →
`refreshRestoredOrchestrationAuthority()` + `reconcileLegacyWorkerTerminals()` (`:160-161`) →
`OrcaRuntimeRpcServer` with `enableWebSocket: true, exposeNetworkByDefault: true` (`:163-170`)
→ pairing offer (`:176-186`) → `ServeReadinessPublisher().publish(...)` (`:208`).

**`OrcadOptions`** (`:89-94`) — `port?: number`, `json?: boolean`, `noPairing?: boolean`,
`pairingAddress?: string`. Parsed from `--port` (integer 0-65535), `--json`, `--no-pairing`,
`--pairing-address <value>`; any other argument throws `Unknown argument` (`:220-248`).

**`OrcadHandle`** (`:96-99`) — `{ readiness: ServeReadiness, stop(): Promise<void> }`.

**Readiness** (`:188-206`) — mirrors the desktop `--serve` contract byte for byte;
`managedWslCliReconciliation: 'settled'` because orcad never runs the WSL CLI reconciliation
barrier; `pairing.qr` is always `null`.

**Not installed and therefore reported honestly**: `reportSecretProtectionGap` is a desktop-only
call (`src/main/index.ts:2312`); orcad never invokes it. *Unverified* whether that is deliberate.

**A patch should route into this when** it needs a headless boot path — do not add a second
Node entrypoint; extend `startOrcad`/`OrcadOptions`.

## RuntimeDesktopSurface — the declared "no desktop" seam

Covered in the port table above; restating what item 2 of the audit asks precisely:

- **Optional**: all four members. The type is not optional — the *installation* is.
- **When absent**: `inertDesktopSurface` (`src/main/runtime/runtime-desktop-surface.ts:27-32`) —
  `showNotification` returns `false` (callers can say so), `findWindowById` returns `null`,
  `onIpc`/`removeIpcListener` are no-ops. Inert rather than throwing, for the same reason as the
  PTY bindings: a host with no desktop legitimately has nothing here, and that is not a downgrade
  (`:22-25`).
- **Consumed by**: `OrcaRuntimeService` only — `src/main/runtime/orca-runtime.ts:736` (import),
  `:14396`, `:28437-28456`, `:28808-28837`, `:38650`.
- The file header names the three sites and states why the tab-create fallback is unreachable
  without a renderer (`:6-12`, referencing upstream #10333).

## The runtime-electron ratchet

**Two entry points** (`config/scripts/check-runtime-electron-ratchet.mjs:35-38`):
`src/main/runtime/orca-runtime.ts` and `src/main/runtime/runtime-rpc.ts` — "the two module
graphs a Node backend would have to boot".

**Mechanism** — esbuild bundle with `write: false`, `metafile: true`, `platform: node`,
`target: node20`, `format: cjs` (`:66-81`). Externals: `electron`, `node-pty`,
`@parcel/watcher`, `better-sqlite3`, `keytar`, `fsevents`, `cpu-features` (`:42-50`), plus an
`onResolve` plugin marking every `.node` external (`:58-63`) — resolving ssh2's `cpu-features`
prebuilt made the gate pass locally and hard-fail on CI. Any input whose imports include
`electron` or `electron/*` is collected (`:83-90`).

**What fails the gate** (`main()`, `:123-162`):

- `added.length > 0` → exit 1, message "put the Electron facility behind a port in
  `src/main/host/`" (`:136-147`).
- `removed.length > 0` → **also exit 1**, demanding the baseline be re-tightened with `--write`
  (`:149-159`). The baseline may only shrink.
- `--write` regenerates the baseline and returns without checking (`:127-131`).

**Baseline** — `config/runtime-electron-baseline.txt` is **six comment lines and no entries**
(355 bytes, all lines start with `#` or are blank). Its own text: "This list is EMPTY and must
stay that way." So at v1.4.190 the runtime + RPC graph reaches zero `electron` importers, and
*any* new one fails CI.

**Wiring** — `package.json:32` `check:runtime-electron-ratchet`, part of `pnpm lint`
(`package.json:14`); CI step at `.github/workflows/pr.yml:120`. A companion smoke test boots
orcad and round-trips a terminal (`.github/workflows/pr.yml:125-126`,
`package.json:34` `smoke:orcad-terminal`, `config/scripts/runtime-serve-terminal-smoke.mjs`,
which takes `--target electron|orcad`).

**`build-orcad.mjs` is a second, stricter gate** — it scans its own bundle for `electron`
importers and exits 1 on any (`config/scripts/build-orcad.mjs:72-91`). It can exceed the
ratchet because the orcad entry also imports `ipc/pty` directly, which the ratchet's two entry
points do not reach (`:87-90`). Externals there are only `electron`, `node-pty`,
`@parcel/watcher`, `fsevents` (`:29`), target `node18` (`:56`); the browser-pane and speech
clusters are excluded because they are the only static `node:sqlite` importers, which is what
keeps the Node floor at 18 (`:5-8`).

**Referenced design doc** — `docs/design/node-only-runtime-backend.html` is cited by the ratchet
(`:6`), by `orcad-entry.ts:6`, and by `build-orcad.mjs:5`, but **does not exist in either
v1.4.188 or v1.4.190** (`git ls-tree -r v1.4.190 -- docs` returns nothing matching). Verified.

**A patch should route into this when** it adds an import to the runtime graph: run
`node config/scripts/check-runtime-electron-ratchet.mjs` before assuming a patch is portable.

## unified-tab-host-ownership

`src/renderer/src/lib/unified-tab-host-ownership.ts` (57 lines, new in v1.4.190). Decides which
worktree/host a unified tab belongs to when the same worktree id can appear under more than one
host.

**Exports** (three, no accessor indirection — plain imports):

1. `findAmbiguousWorktreeIds(worktrees): ReadonlySet<string>` (`:6-18`) — ids appearing more than
   once in the list. Fallback: an empty set when every id is unique.
2. `getActiveExecutionHostIdForWorktree(state, worktreeId): ExecutionHostId | undefined` (`:20-30`)
   — returns a host id only for `state.activeWorktreeId`; **fallback** to `LOCAL_EXECUTION_HOST_ID`
   when `activeWorkspaceExecutionHostId` is null/undefined, and `undefined` for any other worktree.
3. `isUnifiedTabOwnedByWorktree(tab, worktree, ambiguousWorktreeIds): boolean` (`:32-44`) —
   `false` when there is no tab or `tab.worktreeId !== worktree.id`; delegates to
   `isExecutionHostAliasForWorktree` when the tab carries an `executionHostId`; **fallback** for a
   tab with no host stamp: owned iff the worktree id is *not* ambiguous (`:43`).
4. `getUnifiedTabPaletteExecutionHostId(tab, worktree): ExecutionHostId | undefined` (`:46-57`) —
   **fallback** `worktree.hostId` when there is no tab, and again when the tab's `executionHostId`
   is not an alias of this worktree (`:52-56`). Note `worktree.hostId` may itself be `undefined`.

(Four exports; item 5 of the brief says "every exported function" — all four are listed.)

**Consumers**: `src/renderer/src/store/slices/tabs.ts`,
`src/renderer/src/lib/workspace-tab-palette-entry-builder.ts`,
`src/renderer/src/lib/workspace-tab-palette-results.ts`,
`src/renderer/src/lib/browser-palette-page-entries.ts`,
`src/renderer/src/lib/simulator-palette-search.ts`,
`src/renderer/src/lib/ensure-simulator-tab.ts`.

**A patch should route into this when** it asks "does this tab belong to this worktree on this
host" — the unstamped-tab and ambiguous-id fallbacks are the part hand-rolled checks get wrong.

## worktree-execution-host-alias

`src/renderer/src/lib/worktree-execution-host-alias.ts` (17 lines, new).
`isExecutionHostAliasForWorktree(executionHostId, worktree): boolean` (`:8-16`) — true when the
id equals `worktree.hostId ?? LOCAL_EXECUTION_HOST_ID`, **or** equals
`toRuntimeExecutionHostId(worktree.runtimeOwnerEnvironmentId.trim())`.

That second arm is the whole point for orca-server: the same worktree is reachable as "local"
and as "runtime environment N", and only this function treats the two ids as the same host.

**Consumers**: `unified-tab-host-ownership.ts:4`, `src/renderer/src/lib/palette-repo-resolution.ts`,
`src/renderer/src/lib/ensure-simulator-tab.ts`.

**A patch should route into this when** comparing an `executionHostId` against a worktree —
`===` on host ids is wrong wherever a runtime owner exists.

## host-session-mirror-hydration

`src/renderer/src/runtime/host-session-mirror-hydration.ts` (120 lines, new). Tells "the host
reported no PTY" apart from "the host has not answered yet" for mirrored `web-terminal-*` panes.
Misreading that gap relaunched agents the host was still running (codex
`-32600 already has an active writer`, `:6-8`).

**Exports** — `hasHostSessionMirrorHydrated(environmentId, worktreeId): boolean` (`:33`);
`markHostSessionMirrorHydrated(environmentId)` (`:67`, whole environment, full inventory only);
`markHostSessionMirrorWorktreeHydrated(environmentId, worktreeId)` (`:77`, single-worktree frame);
`clearHostSessionMirrorHydration(environmentId)` (`:94`);
`parkUntilHostSessionMirrorHydrates(environmentId, worktreeId, run)` (`:104`);
`resetHostSessionMirrorHydrationForTests()` (`:116`).

**Generation-scoped** — every verdict is stamped with
`getRuntimeEnvironmentConnectionGeneration(environmentId)`; a host restart bumps it, so a
pre-restart verdict is discarded (`:24-31`). Waiters deliberately survive `clear` (`:90-93`).
Waiters drain synchronously from a snapshot, so marking hydrated *before* the frame is applied
to the store re-runs recovery against state that does not exist yet (`:50-58,61-66`).

**Consumers**: `src/renderer/src/runtime/web-session-tabs-sync.ts`,
`src/renderer/src/lib/host-mirrored-pane-liveness.ts`,
`src/renderer/src/lib/resume-sleeping-agent-session.ts`.

**A patch should route into this when** it decides a mirrored pane is dead. The two
granularities are not interchangeable: a full inventory speaks for every worktree; a
single-worktree frame says nothing about a background workspace (`:9-12`).

## host-live-terminal-probe

`src/renderer/src/runtime/host-live-terminal-probe.ts` (109 lines, new). Answers the one
question the session-tab mirror cannot: a live host that has not published yet returns the same
empty inventory as a host with no terminals.

**Export** — `probeHostLiveTerminals(environmentId, call?, connectionGeneration = 0)`
returning `Promise<HostLiveTerminalProbeVerdict>` (`:86`), plus
`clearHostLiveTerminalProbesForTests()` (`:107`).
`HostLiveTerminalProbeVerdict = 'live' | 'none' | 'unverifiable'` (`:15`).

**Mechanism** — RPC `terminal.list` with `limit: 1`, `requireFreshPtyLiveness: true`,
`includeVisualLayouts: false`, `timeoutMs: 15_000` (`:57-70`). `terminal.list` reads the PTY
controller (`ptysById` plus the cross-generation daemon inventory), not the mirror (`:8-11`).
Deduped by `environmentId\0connectionGeneration` while in flight (`:28,91-104`).

**`unverifiable` is a verdict, never a synonym for `none`** (`:12-13`). Returned on: RPC failure
or malformed result (`:71-73`), any `hostScope.omittedHostIds.length > 0` (`:74-79`), and any
thrown error (`:97`).

**Consumers**: `src/renderer/src/runtime/web-session-tabs-sync.ts`.

**A patch should route into this when** the web client must decide whether a host-owned PTY is
really gone — loss of contact is not evidence of exit.

## host-mirrored-pane-liveness

`src/renderer/src/lib/host-mirrored-pane-liveness.ts` (48 lines, new).
`findUnhydratedHostMirrorForPane(record, state): UnhydratedHostMirror | null` (`:24`) — the
mirror a pane is still waiting on, or `null` when its remote liveness is already decidable.

Returns `null` when: the record has no tab id or it is not a `web-terminal-*` surface id
(`:28-31`); the mirror has already retracted the tab (`:32-37`); a PTY handle is published for
the tab (`:38-42`); or the environment has hydrated (`:43-46`). Otherwise
`{ environmentId }`, where `environmentId` is `null` when no paired runtime claims the workspace
(`:10-13`).

**Consumers**: `src/renderer/src/lib/resume-sleeping-agent-session.ts`.

**A patch should route into this when** resume logic reads an empty local PTY handle map — an
empty map is "unverifiable", never "exited".

## agent-resume-host-authority-capability

`src/renderer/src/runtime/agent-resume-host-authority-capability.ts` (45 lines, new).
`agentResumeHostAuthorityCapability(agent): RuntimeCapability | undefined` (`:36`).

Owns the version-skew guard for `ensureAgentSession`: an agent added to `RESUMABLE_TUI_AGENTS`
after `agent-session.host-authority.v1` widens the host's enum, and an older host answers the
unknown member with `invalid_argument`, which `runRemoteAgentSessionLaunch` does not treat as a
fallback signal — the pane dies instead of degrading (`:9-14`).

The table is `satisfies Record<ResumableTuiAgent, RuntimeCapability | undefined>` (`:34`), so the
next agent added is a compile error until its gate — or a deliberate `undefined` — is declared.
Gated today: `omp` → `AGENT_SESSION_OMP_RESUME_PATH_RUNTIME_CAPABILITY`,
`kimi` → `AGENT_SESSION_KIMI_RESUME_RUNTIME_CAPABILITY` (new at v1.4.190,
`src/shared/protocol-version.ts`).

**A patch should route into this when** it adds a resumable agent — the exhaustive Record is the
mechanism that stops silent skew.

## project-group-owner-routing

`src/renderer/src/store/slices/project-group-owner-routing.ts` (94 lines, new). Routes project
group mutations to the row's **owner** host instead of whichever host has focus — the sidebar
lists groups from every host (`:69-70`).

**Exports** — `getProjectGroupHostId(group)` (`:23`, normalizes ids that predate host stamping,
falling back to `toSshExecutionHostId(connectionId)` then `LOCAL_EXECUTION_HOST_ID`);
`catalogOwnsHost(catalogHostId, rowHostId)` (`:32`, local catalog owns anything whose parsed kind
is not `runtime`); `projectGroupMatchesOwnerHost(group, groupId, ownerHostId)` (`:39`);
`resolveProjectGroupOwnerHostId(state, groupId, hostId?)` (`:50`, returns `null` for an unstamped
row so focus behaviour is kept rather than assuming local, `:62-65`);
`settingsForProjectGroupOwner(state, groupId, hostId?)` (`:71`, rewrites
`activeRuntimeEnvironmentId` to the owner's environment, or nulls it for direct-SSH/local groups
that live in the local main-process catalog, `:86-92`).

Explicitly "mirrors `settingsForRepoOwner`" (`:70`).

**A patch should route into this when** a renderer mutation must reach the owning host under a
multi-host catalog.

## src/shared/child-process — the spawn chokepoint

`src/shared/child-process/run-process.ts` (300 lines, new) — "the single place Orca starts a
child process" (`:10`). Six decisions per spawn that POSIX forgives and Windows punishes
differently: console visibility, argument quoting, `.cmd` interpretation, binary resolution,
timeout policy, tree termination (`:12-18`).

**Exports** — `resolveSpawn(spec, platform): ResolvedSpawn` (`:79`, pure and exported so the
Windows branch is testable from macOS/Linux); `spawnProcess(spec): ChildProcess` (`:119`,
caller owns the streams *and* their `error` events); `runProcess(spec): Promise<ProcessResult>`
(`:157`); `runProcessSync(spec): ProcessResult` (`:277`);
`DEFAULT_PROCESS_TIMEOUT_MS = 30_000` (`:53`); `DEFAULT_MAX_OUTPUT_BYTES = 8 MiB` (`:54`);
types `ProcessSpec` (`:24`), `ProcessResult` (`:44`), `ResolvedSpawn` (`:66`).

`resolveSpawn` sets `windowsHide: true` unconditionally and `shell: false` always (`:81-93`), and
on Windows routes `.cmd`/`.bat` through `ComSpec` with `windowsVerbatimArguments: true` (`:99-108`).

**Siblings** — `windows-command-line.ts` (new): `quoteWindowsArgument` (`:67`),
`quoteWindowsCmdArgument` (`:79`), `buildWindowsCmdShimCommandLine` (`:98`),
`isCmdInterpretedProgram` (`:119`). `windows-system-binary.ts` (new):
`windowsPowerShellPath(env?)` (`:19`), `windowsSystem32Binary(fileName, env?)` (`:23`) — absolute
System32 paths, because Orca's PATH under Electron is not the user's.

**Enforcement** — `child-process-import-boundary.test.ts` walks the tree and fails any non-test
file outside `src/shared/child-process` that imports `node:child_process` unless it is on
`__fixtures__/child-process-import-allowlist.txt` (162 lines). The allowlist **only shrinks**
(`:11-16`).

**A patch should route into this when** it spawns anything. Adding an allowlist entry is a
ratchet regression; call `runProcess`/`spawnProcess` instead.

## src/shared/source-scan/source-tree-scan

`src/shared/source-scan/source-tree-scan.ts` (282 lines, new). One file walk for the ratchet
guards, after four guards grew their own copies and drifted — one skipped dot-directories and
three did not, so the WSL separator guard scanned `tests/e2e/.cross-version-checkouts/` and
reported 21 offenders that were copies of shipped releases (`:6-13`).

**Exports** — `isTestFile(relativePath)` (`:18`), `ScannedFile` (`:26`),
`scanSourceTree(root, {includeTests?})` (`:34`, skips `node_modules|dist|out|build|.git`, every
dot-directory, and `__fixtures__`, `:15,41`), `readAllowlist(fixturePath)` (`:64`),
`stripComments(source)` (`:81`), `blankStringContentsDesynced(source)` (`:153`),
`blankStringContents(source, reportDesync?)` (`:201`).

**A patch should route into this when** adding a tree-level guard test — do not hand-roll a
walker or an allowlist reader.

## Modules split out of `src/main/ipc/*` to keep the runtime graph Electron-free

A repeated v1.4.190 pattern, worth naming because it is the cheapest way to make an existing
capability reachable from `orca serve`: the logic moves to a new module, the `ipcMain`
registration stays behind and imports from it.

| New module | Split out of | Why |
| --- | --- | --- |
| `src/main/preflight/agent-detection.ts` (304 lines) | `ipc/preflight.ts` | the runtime calls `detectInstalledAgentsWithShellPathHydration` / `detectRemoteAgents` during normal operation (`:1-7`) |
| `src/main/ssh/ssh-target-registry.ts` (89 lines) | `ipc/ssh.ts` | `ipc/ssh.ts` owns `ipcMain`, `powerMonitor` and a `BrowserWindow` accessor; four thin accessors dragged all of Electron in (`:5-18`) |
| `src/main/plugins/plugin-client-list.ts` (17 lines) | `ipc/plugins.ts` | so `plugins.list` RPC reaches it without `ipcMain` — names the same reason (`:6-10`) |
| `src/main/browser/browser-error.ts` (16 lines) | `browser/cdp-bridge.ts` | seven lines with no dependencies, but `cdp-bridge.ts` imports `webContents`; the runtime catches this type on non-CDP paths (`:1-8`) |
| `src/main/ipc/worktree-watcher-removal.ts` | `ipc/filesystem-watcher.ts` | see the port section above |

`ssh-target-registry.ts` is a settable registry, not a direct handle, on purpose: SSH providers
register after construction and may reconnect, so callers must resolve the current generation
(`:14-17`). Accessors: `setSshTargetRegistryStore` / `getSshTargetRegistryStore` (`:24,28`),
`setSshTargetRegistryHandlers({connect, getState})` (`:32`),
`connectRegisteredSshTarget(targetId)` (`:40`).

**A patch should route into this when** a capability exists on the desktop but its only entry
point is an `ipcMain` handler. Extract the logic to a new module and have both the handler and
the runtime import it — that is upstream's own move, so it merges rather than conflicts.

## registerHeadlessPtyRuntime

`src/main/ipc/pty/register-headless-runtime.ts` (47 lines, new). The headless entry point for
PTY handler registration, re-exported from `src/main/ipc/pty.ts:38`.

**Signature** (`:13-24`) — `(runtime, getSelectedCodexHomePath?, getSettings?, prepareClaudeAuth?,
store?, prepareCodexSessionResume?, lifecycle?)`, where `lifecycle` carries
`onCodexHomePtySpawned?` and `onPtyExit?`.

Constructs the fake `BrowserWindow` with `isDestroyed: () => true` and a matching
`webContents.isDestroyed` (`:29-37`) — every renderer-liveness guard reads both, and a *missing*
method reads as "alive" (`:28`). Then calls `registerPtyHandlers`
(`src/main/ipc/pty/register-handlers.ts:61`).

Used by `orcad` (`orcad-entry.ts:156`) and by desktop `--serve`.

**A patch should route into this when** it registers PTY handlers on a host with no renderer —
never call `registerPtyHandlers` with a hand-made window.

## vitest-host-ports-setup

`config/scripts/vitest-host-ports-setup.ts` (67 lines, new). A global vitest `setupFiles` entry
(`config/vitest.config.ts:24`) that installs benign `AppEnvironment` and `SecretStore` defaults
in a `beforeEach`, because both accessors throw until an entrypoint installs them — which would
otherwise fail ~70 suites (`:8-13`).

**Exports** — `fakeAppEnvironment(overrides?: Partial<AppEnvironment>): AppEnvironment` (`:35`),
`installFakeAppEnvironment(overrides?)` (`:49`).

The fake userData is one `mkdtempSync` directory per test *environment* (per file), removed in
`afterAll` (`:19-23`). The fake secret store seals with a `vitest-sealed:` prefix and its
`decryptString` throws on ciphertext it did not produce (`:27,55-66`) — deliberately not a
plaintext passthrough, so a test that forgot to seal fails.

A suite installing its own port wins, because this runs first (`:11-12`).

**A patch should route into this when** its test needs a host port. Call
`installFakeAppEnvironment({ getPath: ... })`, do not restate all seven members and do not
`vi.mock('electron')`.

---

## Not verified

- `docs/design/node-only-runtime-backend.html` is referenced by three v1.4.190 files and is
  absent from both tags. Verified absent from `docs/`; **unverified** whether it exists outside
  the repo.
- Whether `orcad` deliberately skips `reportSecretProtectionGap`, or whether that is an
  oversight. The call exists only at `src/main/index.ts:2312`.
- Whether `getWorktreeWatcherRemoval()` has any consumer other than the worktree removal path —
  not enumerated.
- Runtime behaviour of every port under `orca serve` on our patched tree: this inventory is read
  from upstream source at v1.4.190 only. Nothing here was executed.
