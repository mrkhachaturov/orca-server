# floating-workspace-picker — v1.4.190 re-derivation

## Problem

In the tile, Settings > Floating Workspace > Terminal Directory's folder button did nothing — no
picker, no error, no directory applied. The desktop feature is three host operations the browser
had a path for none of: a native OS dialog, the trust grant that dialog also performs, and a cwd
resolution that only returns a custom path once it is trusted.

## Still present at v1.4.190

yes.

- `src/renderer/src/web/web-preload-api.ts:595` `getFloatingTerminalCwd: () => Promise.resolve('')`
- `src/renderer/src/web/web-preload-api.ts:598` `pickFloatingWorkspaceDirectory: () => Promise.resolve(null)`
- No `floatingWorkspace.*` RPC exists: `git ls-tree v1.4.190 src/main/runtime/rpc/methods/` has no
  `floating-workspace.ts`, and `runtime-rpc.ts:179` `MOBILE_RPC_METHOD_ALLOWLIST` has no such member.
- The only entry points remain `ipcMain` handlers: `src/main/ipc/app.ts:317,321,325`.
- v1.4.188→v1.4.190 touched none of it: `git diff v1.4.188..v1.4.190` over
  `ipc/floating-workspace-directory.ts`, `ipc/filesystem-auth.ts`, `ipc/app.ts`,
  `FloatingWorkspacePane.tsx`, `preload/api/app-api.ts`, `rpc/methods/index.ts` = 0 changes;
  `web-preload-api.ts` = 1 insertion, unrelated.

The one thing that DID move is the host: `src/main/ipc/floating-workspace-directory.ts:4` still
`import { app } from 'electron'`, used at `:26` (`getPath('home')`) and `:72`
(`getPath('userData')`) — and nothing else. Those two lines are the module's entire Electron
surface.

## Who owns this logic now

Three halves, three different answers.

1. **Path resolution — `AppEnvironment`.** `getPath('home')` and `getPath('userData')` are exactly
   `AppEnvironment.getPath(name)` (`src/shared/app-environment.ts:22`, `AppPathName` at `:18`
   includes both). Accessor `getAppEnvironment()` (`:79`). Under `orcad`,
   `createNodeAppEnvironment` maps `home`→`homedir()` and `userData`→
   `$ORCA_USER_DATA` → `$XDG_DATA_HOME/Orca` → `~/.orca`
   (`src/main/orcad/orcad-entry.ts:22-29,54`).

2. **The trust grant — no upstream owner, and none needed.** `authorizeExternalPath`
   (`src/main/ipc/filesystem-auth.ts:32`) is a process-global LRU `Set<string>` (`:17`,
   `AUTHORIZED_EXTERNAL_PATHS_MAX = 4096` at `:16`). It is already Electron-free at v1.4.190, as is
   its whole transitive closure (`filesystem-allowed-roots.ts`, `filesystem-path-containment.ts`,
   `registered-worktree-roots-cache.ts`, `worktree-logic.ts`, `repo-worktrees.ts` — none import
   `electron`). Because it is process-global and orca-server collapses runtime and IPC handlers into
   one process, a grant recorded from the RPC path is visible to every reader. Its *persisted* half
   is `store.updateSettings({ floatingTerminalTrustedCwds })` — the runtime store, no port.

3. **The native dialog — no upstream owner, and it must not get one.** `dialog.showOpenDialog`
   (`src/main/ipc/app.ts:76-78`) has no port at v1.4.190 and no Node equivalent. It stays in the
   `ipcMain` handler layer, which is the desktop-only half by construction.

The block that decides whether this is a problem at all is **the runtime-electron ratchet**:
`config/runtime-electron-baseline.txt` is empty and "must stay that way", and both ratchet entry
points (`src/main/runtime/orca-runtime.ts`, `src/main/runtime/runtime-rpc.ts`) reach the module the
moment this patch lands. That is the one measured electron importer this patch contributes.

## Verdict

keep, shrink — the capability is still absent upstream, but the module it reuses must go through
`AppEnvironment` instead of `electron`, and one of the patch's three delivery routes is redundant.

## Correct shape at v1.4.190

**A. Make `src/main/ipc/floating-workspace-directory.ts` host-agnostic (this is the whole
Node-host fix, and it is upstream-shaped on its own).**

- Delete `import { app } from 'electron'` (`:4`); add
  `import { getAppEnvironment } from '../../shared/app-environment'`.
- `:26` `const home = app.getPath('home')` → `getAppEnvironment().getPath('home')`.
- `:72` `path.join(app.getPath('userData'), FLOATING_WORKSPACE_DIRNAME)` →
  `path.join(getAppEnvironment().getPath('userData'), FLOATING_WORKSPACE_DIRNAME)`.
- Call `getAppEnvironment()` inside each function, not at module scope: the accessor throws until an
  entrypoint installs (`src/shared/app-environment.ts:79`), and this module is imported during
  bootstrap.
- Upstream test `src/main/ipc/floating-workspace-directory.test.ts:11-16` currently does
  `vi.mock('electron', () => ({ app: { getPath: appGetPathMock } }))`. Replace with
  `installFakeAppEnvironment({ getPath: appGetPathMock })` from
  `config/scripts/vitest-host-ports-setup.ts:49`. This hunk is what proves the module no longer
  needs Electron; without it the test keeps passing for the wrong reason.

That is all of it. After those two lines the module — and its whole transitive closure — is
Electron-free, the ratchet entry disappears, and the module is safe in the `orcad` bundle
(`config/scripts/build-orcad.mjs:72-91` is the stricter second gate).

**Does the port fully solve it? The path half, yes — completely.** What it does *not* solve, and
what stays outside `AppEnvironment`:

- The native dialog. Nothing moves; see B.
- The store cast (C) and the null-store silent no-op (D) below — both are runtime-store problems,
  not host-port problems.

**B. Keep the picker split; do not move the desktop path.** Desktop keeps
`dialog.showOpenDialog` in `src/main/ipc/app.ts`; the web path keeps `RemoteFileBrowser`
(`src/renderer/src/components/sidebar/RemoteFileBrowser.tsx`, which accepts
`runtimeEnvironmentId` and lists through `files.browseServerDir` — already on
`MOBILE_RPC_METHOD_ALLOWLIST`, `runtime-rpc.ts:213`). What the web path actually needs is a
directory *chooser on the server host* plus a grant; `RemoteFileBrowser` is exactly that and is
already wired. If we moved desktop onto it, desktop would lose the OS dialog's recents/favourites
sidebar, network volumes, per-window modality via `BrowserWindow.fromWebContents(event.sender)`
(`ipc/app.ts:71`) and the platform file-picker keyboard idioms — for nothing, since the desktop
grant already happens inside `pickFloatingWorkspaceDirectory` (`ipc/app.ts:83`).

**C. Drop the `window.api` route for the grant — this is the shrink.** The patch currently adds
four hunks to upstream files (`src/preload/api/app-api.ts` `AppApi.grantFloatingWorkspaceDirectory`,
`src/preload/index.ts:595`, `src/main/ipc/app.ts` `ipcMain.handle('app:grantFloatingWorkspaceDirectory')`,
and the web shim in `web-preload-api.ts`) solely because `createWebPreloadApi()` returns a
`Partial<AppApi>` and cannot carry a key `AppApi` does not declare. The desktop handler is dead code
— `shouldUseServerDirectoryBrowser` is `false` on desktop, so nothing ever invokes it there.

Upstream's own precedent for a renderer calling the runtime directly is
`src/renderer/src/runtime/runtime-server-directory-browser.ts:15-20`, which calls
`callRuntimeRpc({ kind: 'environment', environmentId }, 'files.browseServerDir', …)` — the very RPC
`RemoteFileBrowser` uses. Follow it:

- New overlay file `src/renderer/src/runtime/floating-workspace-directory-grant.ts` exporting
  `grantFloatingWorkspaceDirectoryOnRuntime(environmentId, path)`, calling
  `callRuntimeRpc<{ ok: boolean }>({ kind: 'environment', environmentId },
  'floatingWorkspace.grantDirectory', { path }, { timeoutMs: 15_000 })`
  (`src/renderer/src/runtime/runtime-rpc-client.ts:46`).
- `FloatingWorkspacePane.tsx`'s `grantAndApplyPickedDirectory` calls that instead of
  `window.api.app.grantFloatingWorkspaceDirectory(path)`. It already holds
  `activeRuntimeEnvironmentId`.
- Removes three upstream-file hunks: `src/main/ipc/app.ts`, `src/preload/index.ts`,
  `src/preload/api/app-api.ts`. The patch drops from 8 upstream files to 5.
- Keep `getFloatingTerminalCwd` on the `window.api` shim: `AppApi` already declares it
  (`src/preload/api/app-api.ts:58`) and the shared callers
  (`FloatingTerminalPanel.tsx:687`, `OnboardingInlineCommandTerminal.tsx:118`,
  `FloatingWorkspacePane.tsx:46`) are host-neutral. That one is a stub being filled, not a new key.

**D. Fix the runtime store adapter — the cast and the silent no-op.**

- `RuntimeStore` (`orca-runtime.ts:1270`) declares an explicit field list for `getSettings()`
  (`:1327-1368`) and does **not** list `floatingTerminalCwd` / `floatingTerminalTrustedCwds`, which
  is why the patch writes `(store?.getSettings?.() ?? {}) as unknown as GlobalSettings`. Add
  `floatingTerminalCwd?: GlobalSettings['floatingTerminalCwd']` and
  `floatingTerminalTrustedCwds?: GlobalSettings['floatingTerminalTrustedCwds']` to that return type
  — the list is upstream's own mechanism for "what the runtime reads" — and delete the cast. A cast
  here is exactly the class AGENTS.md names: vitest transpiles it away, typecheck never sees the
  mismatch.
- Then narrow the helper signatures instead of introducing `FloatingWorkspaceDirectoryStore` as a
  two-method interface: `resolveFloatingTerminalCwd`, `grantFloatingWorkspaceDirectory` and
  `sanitizeFloatingWorkspaceDirectorySetting` only ever read `floatingTerminalTrustedCwds` and only
  ever write it, so
  `store: { getSettings(): Pick<GlobalSettings, 'floatingTerminalTrustedCwds'>;
  updateSettings(updates: Pick<GlobalSettings, 'floatingTerminalTrustedCwds'>): unknown }`
  keeps the real desktop `Store` structurally assignable and needs no new exported name. (Upstream's
  own test already passes a structural `TestStore`, `floating-workspace-directory.test.ts:29-33`,
  so the `Store` annotation was never load-bearing.)
- `grantFloatingWorkspaceDirectory` on the runtime currently does `store?.updateSettings?.(updates)`
  — with no store (`orca-runtime.ts:3003` allows `RuntimeStore | null`; `orcad-entry.ts:124-127`
  says persistence-backed RPC must throw `runtime_unavailable` without one) the grant is silently
  dropped and `floatingWorkspace.grantDirectory` still answers `{ ok: true }`. The pane then stores a
  path the host never trusted, `resolveCwd` answers the default directory, and the terminal opens
  somewhere else — the exact failure the patch header says it exists to prevent. Throw
  `runtime_unavailable` when `this.store` is null, and cover it in
  `src/main/runtime/rpc/methods/floating-workspace.test.ts`.

**E. Unchanged and still correct.** `floatingWorkspace.resolveCwd` and
`floatingWorkspace.grantDirectory` stay off `MOBILE_RPC_METHOD_ALLOWLIST` (`runtime-rpc.ts:179`) —
both authorize an external path and one writes a trust grant into settings. The
`mobile-rpc-allowlist.test.ts` hunk that enforces it stays.

**Rationale header, rewritten for v1.4.190.** The header should no longer claim only "the browser
had a path for none of these". It should claim: upstream's floating-workspace helpers are the right
implementation but are pinned to Electron by two `app.getPath` calls, so they cannot be reached from
the runtime graph (the ratchet baseline is empty) or from `orcad`. The patch routes them through
`AppEnvironment` — the migration upstream already performed on ~25 other modules — and then exposes
them over two runtime-scope RPC methods, because the web tile's floating terminals run on the
server. The native dialog deliberately stays desktop-only; the web picker is the existing
`RemoteFileBrowser` over `files.browseServerDir`. *To test* is unchanged, plus: the module has no
`electron` import and `node config/scripts/check-runtime-electron-ratchet.mjs` passes.

## Blocks this touches that other patches may share

- **AppEnvironment** — this patch's two `getPath` calls. Suspected shared with
  `cli-registration.diff` (04): the building-blocks doc lists `src/main/cli/cli-installer.ts:96-97,100`
  as an AppEnvironment consumer, and patch 04 pulls `src/main/ipc/cli.ts` into the runtime graph.
  Possibly `usage-analytics.diff` (10) via `src/main/telemetry/client.ts:56`. Both suspicions,
  not verified.
- **The runtime-electron ratchet** — *confirmed* shared. The patch pulls
  `src/main/ipc/floating-workspace-directory.ts` into the ratchet's two entry points. The other
  electron importer our series adds is `src/main/ipc/cli.ts` (`import { ipcMain } from 'electron'`,
  `:1`), from `cli-registration.diff` (04). **And `execution-owner.diff` (08) imports
  `ensureDefaultFloatingWorkspacePath` from the same module into `orca-runtime.ts`
  (`patches/execution-owner.diff:96,121`) — so fix A is required by patch 08 even if patch 05 were
  dropped, and dropping patch 05 alone does not clear the ratchet.**
- **Modules split out of `src/main/ipc/*` to keep the runtime graph Electron-free** — the named
  upstream pattern. Patch 05 does **not** need it (the whole module becomes clean). Patch 04 almost
  certainly does: `ipc/cli.ts` holds `ipcMain`, so its runtime-reachable half wants extraction the
  way `plugin-client-list.ts` was split out of `ipc/plugins.ts`. Suspicion for 04.
- **vitest-host-ports-setup** — fix A rewrites `vi.mock('electron')` in
  `src/main/ipc/floating-workspace-directory.test.ts` as `installFakeAppEnvironment`. Any other
  patch whose tests mock `electron` for a path shares this; suspected in 04 and 10, unverified.
- **orcad** — `userData` is where `floating-workspace/` lands, so orcad's
  `$ORCA_USER_DATA`/`$XDG_DATA_HOME` mapping decides the default note directory. Shared with any
  patch that resolves a userData-relative path; suspected 10 (`usage-analytics`), unverified.
- **`src/renderer/src/web/web-preload-api.ts`** (not a named block, but the most contended file in
  the series). Also touched by 01 `trusted-proxy-session`, 02 `pairing-credentials`,
  03 `resource-manager`, 04 `cli-registration`, 06 `runtime-seeded-settings`, 08 `execution-owner`,
  10 `usage-analytics`, 12 `workspace-restore`. Fix C reduces this patch's footprint there to one
  stub (`getFloatingTerminalCwd`).
- **`src/main/runtime/rpc/methods/index.ts`** — `ALL_RPC_METHODS`. Also touched by 02, 04, 10; every
  one appends a `*_METHODS` array to the same list, so all four conflict on the same two lines.
- **`src/main/runtime/mobile-rpc-allowlist.test.ts`** — also touched by 02, 04, 08, 10. Patch 08
  *edits the assertions this patch adds* (`patches/execution-owner.diff:57-83`), adding
  `floatingWorkspace.markdownDirectory` to both lists.
- **`src/main/runtime/rpc/methods/floating-workspace.ts`** (overlay, `src/`) — this patch creates it
  with `resolveCwd` and `grantDirectory`; patch 08 owns the third method,
  `markdownDirectory`. The overlay file is shared by two patches with no marker saying so, and
  `mise run owner` reports only "overlay".
- **`src/main/runtime/orca-runtime.ts`** — also touched by 06, 08, 09, 10, 11. Patch 08's import
  hunk is a superset of this patch's (`patches/execution-owner.diff:92-98`), so the two must be
  restacked together.

## Unverified

- I did not run anything. No build, no `vitest`, no
  `node config/scripts/check-runtime-electron-ratchet.mjs`. The claim that fix A empties this
  patch's ratchet contribution is read from source (the module's only `electron` import is line 4,
  used at `:26` and `:72`) plus the given measurement, not from a gate run.
- I did not verify that `getAppEnvironment()` is installed before the first
  `resolveFloatingTerminalCwd` call on either host. Desktop installs at
  `src/main/index.ts:885-912` inside `hasSingleInstanceLock`; orcad at
  `orcad-entry.ts:84` before any dynamic import. Both look ordered correctly, but I did not trace
  an actual first call.
- Whether `getAppEnvironment()`'s throw-on-uninstalled would break the desktop `--serve` path if the
  helpers are reached before `installHostAdapters`. Not traced.
- I did not verify the transitive closure of `filesystem-auth.ts` exhaustively — I checked its four
  direct importees plus `worktree-logic.ts` and `repo-worktrees.ts` for `from 'electron'` and found
  none. Deeper levels not walked; a grep returning nothing is not proof.
- **Not part of this patch, but adjacent and unowned:** `sanitizeFloatingWorkspaceDirectorySetting`
  is wired only into the `ipcMain` settings handler (`src/main/ipc/settings.ts:13,146`).
  `settings.update` over RPC (`rpc/methods/client-ui.ts:22`) uses `SettingsUpdate` from
  `client-ui-schemas.ts`, which has no `floatingTerminal*` member (grep, v1.4.190), and the web
  preload never puts `floatingTerminalCwd` into `runtimeUpdates`. So in the tile the *path* stays
  client-local while the *trust* is host-side. That split looks deliberate and correct for a
  multi-host client, but I did not confirm it against a running tile, and I did not check whether a
  typed (rather than picked) path is ever sanitized on the web path.
- Whether the `AppApi` excess-property constraint I use to justify fix C actually errors — I read
  that `createWebPreloadApi()` returns `Partial<…>` and reasoned from it; I did not compile a
  counter-example.
- Cross-patch claims marked "suspicion" above (04, 10 sharing AppEnvironment / vitest-host-ports /
  orcad userData) were inferred from the building-blocks consumer lists and each patch's touched-file
  set, not from reading those patches' bodies.
