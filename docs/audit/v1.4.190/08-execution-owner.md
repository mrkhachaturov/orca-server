# execution-owner — v1.4.190 re-derivation

## Problem

In the tile the floating terminal, the Settings skill terminal and floating markdown notes all
failed as if no runtime existed ("Local PTYs are unavailable in the web client", "No runtime
worktree owns `<floating>/.orca/templates`") while the server showed Connected. The skill setup
card built its install command for the *viewer's* OS, so a Windows browser pasted
`cmd.exe /d /s /c "where.exe npx ..."` into a Linux shell. Ownership resolution reads "no
`runtimeEnvironmentId`" as "therefore this machine" — impossible in a browser the runtime serves.

## Still present at v1.4.190

yes.

- `src/renderer/src/lib/worktree-runtime-owner.ts:65-66` — `getRuntimeEnvironmentIdForWorktree`
  returns `null` for `FLOATING_TERMINAL_WORKTREE_ID`.
- `src/renderer/src/lib/worktree-runtime-owner.ts:167-168` — `getExecutionHostIdForWorktree`
  returns `'local'` for the same id; `:204` is the general `… : 'local'` terminator.
- `src/renderer/src/components/terminal-pane/pty-connection.ts:4047-4048` — the transport ternary
  still ends `: createIpcPtyTransport(transportOptions)`, i.e. "no named runtime ⇒ this machine".
- `src/renderer/src/web/web-preload-api.ts:595-597` — `getFloatingTerminalCwd` → `''`,
  `getFloatingMarkdownDirectory` → `''`, `pickFloatingMarkdownDocument` → `null`.
- `src/renderer/src/components/settings/CliSkillRuntimeSetup.tsx:257-259` —
  `getSkillCommandPlatform` still reads `window.api.platform.get().platform`;
  `isRemoteRuntimeEnvironmentFocused` (`:249`) is still the only guard and still does not gate
  `normalizeWindowsSkillUpdateCommand` (`:87,102`).
- `src/renderer/src/lib/client-creation-action-policy.ts:51-52,66,73` — floating still forces
  `{state:'hidden', FLOATING_BROWSER_UNAVAILABLE_MESSAGE}` and `runtimeEnvironmentId = null`.
  File byte-identical v1.4.188..v1.4.190.
- `src/renderer/src/runtime/runtime-worktree-selector.ts` — unchanged, still no browser-scoped
  variant; `web-runtime-session.ts:561` still passes `toRuntimeWorktreeSelector(args.worktreeId)`
  to `browser.tabCreate`.
- No `floatingWorkspace.*` RPC upstream: `git grep 'floatingWorkspace\.' v1.4.190 -- src/main/runtime/rpc`
  is empty.

20 of the 25 files this patch touches are byte-identical between the two tags. The five that
changed (`orca-runtime.ts`, `pty-connection.ts`, `web-runtime-session.ts`, `web-preload-api.ts`,
`CliSkillRuntimeSetup.tsx`) changed **outside** every hunk context this patch uses.

## Who owns this logic now

**no upstream owner** for "which host executes when nothing names one".

`unified-tab-host-ownership` is adjacent, not the owner. Its
`getActiveExecutionHostIdForWorktree` (`src/renderer/src/lib/unified-tab-host-ownership.ts:20-30`)
answers "which host id do I *stamp on a tab*", reading `state.activeWorkspaceExecutionHostId` — a
value set only from the argument a UI caller passes to `setActiveWorktree`
(`src/renderer/src/store/slices/worktrees/session/set-active-worktree.ts:189`) /
`setActiveFolderWorkspace` (`:104`). It has three non-test consumers:
`src/renderer/src/store/slices/tabs.ts:864,940` and `src/renderer/src/lib/ensure-simulator-tab.ts:42,62`.
None of them decides a PTY transport, a browser provider or a file-operation route — the three
things this patch decides. Its `?? LOCAL_EXECUTION_HOST_ID` is the same fiction in a different
question, so the patch cannot shrink into it.

`worktree-execution-host-alias` (`isExecutionHostAliasForWorktree`) is the correct comparison
primitive once a host id exists, and this patch already produces ids it accepts
(`toRuntimeExecutionHostId(env)`). It owns comparison, not resolution.

`AppEnvironment` owns the one thing the host half of this patch reaches for — see below.

## Verdict

keep — the symptom, the call sites and the upstream fallbacks are all unchanged at v1.4.190; no
new block absorbs the resolution, and one host-side hunk now needs re-routing through
`AppEnvironment` to stay inside the runtime-electron ratchet.

## Correct shape at v1.4.190

Same shape as today, with three concrete changes.

**1. Route the floating directory lookup through `AppEnvironment`, then keep the runtime import.**
`src/main/ipc/floating-workspace-directory.ts` still does `import { app } from 'electron'` (`:4`)
and uses it exactly twice — `app.getPath('home')` (`:26`) and `app.getPath('userData')` (`:72`).
Both are `AppEnvironment.getPath`. At v1.4.190 `config/runtime-electron-baseline.txt` is empty and
`check:runtime-electron-ratchet` is part of `pnpm lint`, with `src/main/runtime/orca-runtime.ts`
and `src/main/runtime/runtime-rpc.ts` as its two entry points. Two edges now reach that module
from inside the ratcheted graph:

- this patch's own hunk — `orca-runtime.ts` imports `ensureDefaultFloatingWorkspacePath as
  ensureDefaultFloatingWorkspacePathOnHost` for the `FLOATING_TERMINAL_WORKTREE_ID` branch of
  `resolveWorktreeSelector` (upstream `orca-runtime.ts:10498` region);
- the overlay RPC module `src/main/runtime/rpc/methods/floating-workspace.ts:5`, reached via
  `runtime-rpc.ts` → `rpc/dispatcher.ts:15` (`ALL_RPC_METHODS`) → `rpc/methods`.

Swap the two `app.getPath` calls for `getAppEnvironment().getPath(...)`
(`src/shared/app-environment.ts:79`) and drop the `electron` import. `./filesystem-auth` and its
two transitive imports (`filesystem-allowed-roots`, `filesystem-path-containment`) are already
electron-free, so that single edit makes the whole subtree portable and both edges legal. The
comment in `src/main/runtime/rpc/methods/floating-workspace.ts:3-4` ("imported from the ipc leaf
to keep the value off orca-runtime's import cycle") then stops being load-bearing.

**2. Collapse the duplicated overlay resolver.**
`src/renderer/src/lib/floating-workspace-runtime-owner.ts` exports
`getFloatingWorkspaceRuntimeEnvironmentId` and `getWebClientLocalFallbackEnvironmentId` with
*byte-identical* bodies. Keep one exported function and one re-export alias, or one function plus
a doc paragraph explaining the two roles. Call sites unchanged.

**3. Decide `getActiveExecutionHostIdForWorktree` deliberately, do not silently inherit it.**
New at this tag, so the patch has never faced it. In the tile, a `createUnifiedTab` on the active
worktree stamps `executionHostId: activeWorkspaceExecutionHostId ?? 'local'`
(`tabs.ts:863-864`, `:939-940`). Two outcomes:

- worktree row unstamped (`hostId` undefined): `isExecutionHostAliasForWorktree('local', wt)`
  compares `'local' === (undefined ?? 'local')` → true. Harmless, no change needed.
- worktree row stamped `runtime:<env>` while `activeWorkspaceExecutionHostId` is null: the alias
  check fails both arms and `isUnifiedTabOwnedByWorktree` returns false — the new tab is not
  recognised as belonging to its own worktree.

If the second case is reachable (see **Unverified**), the minimal fix is *not* to touch
`unified-tab-host-ownership.ts`: it is to make the caller pass the host id, or to have
`getActiveExecutionHostIdForWorktree` fall back to `getExecutionHostIdForWorktree(state, worktreeId)`
— this patch's already-corrected resolver — instead of the bare constant. That is one call-site
change in `unified-tab-host-ownership.ts:27-29`, and it fixes the desktop multi-host case too, so
it is contributable upstream rather than a divergence.

Everything else stays: the `worktree-runtime-owner.ts` floating branches, the `pty-connection.ts`
web-client floor, `terminal-worktree-route.ts`, `editor-file-operation-owner.ts`,
`floating-workspace-tab-creation.ts`, `browser.ts`, `settings.ts` catalog await,
`runtime-status.ts` `hydrateRuntimeEnvironmentCatalog`, `toRuntimeBrowserWorktreeSelector` and the
ten `runtimeWorktree: string | undefined` widenings in `browser-pane/stream-remote/**`. All of
their contexts are unchanged upstream.

**The `client-creation-action-policy` divergence is still necessary.** The file did not move
between the tags; upstream still hides the floating managed browser unconditionally. The
divergence's premise (upstream's web client is a laptop paired to a remote Orca; ours is served
*by* the runtime) is untouched by the host-port migration. Keep the patch's two rewritten tests
and their stated reason.

**The `web-runtime-session.ts` snapshot rewrite does not reach this patch.** The v1.4.190 change
(`applyFreshWebSessionTabsSnapshot` → `applyWebSessionTabsSnapshot` + `decideWebSessionTabsSnapshot`,
`applyWebSessionTabsStorePatch` gaining a frames parameter) is confined to
`refreshWebRuntimeSessionTabsSnapshot` at `web-runtime-session.ts:848-874`. This patch's two hunks
in that file are the import block (`:41`) and the `browser.tabCreate` params (`:559-561`). Neither
symbol is referenced by this patch. No decision point moved.

**Ownership resolution did not move inside `pty-connection.ts`.** The file grew +263 lines, but the
diff hunks nearest this patch's two sites are at old-`:3828` and old-`:4220`; this patch's sites at
old-`:3486` and old-`:3951` are in untouched regions and now sit at `:3558` and `:4047`. The
transport ternary is character-identical.

## Blocks this touches that other patches may share

- **AppEnvironment** — the fix in item 1 above. Suspected shared with any patch that resolves a
  host path. `floating-workspace-picker.diff` reaches the same module
  (`floatingWorkspace.resolveCwd` → `resolveFloatingTerminalCwd` → `resolveFloatingWorkspaceInput`
  → `app.getPath('home')`), so the two patches must not both edit it — one owns the port swap.
  Suspicion.
- **The runtime-electron ratchet** — anything adding an import to the `orca-runtime.ts` /
  `runtime-rpc.ts` graph. Confirmed co-touchers of `orca-runtime.ts`: `agent-cold-restore.diff`,
  `floating-workspace-picker.diff`, `usage-analytics.diff`, `headless-orchestration-delivery.diff`,
  `runtime-seeded-settings.diff`. Confirmed co-touchers of `rpc/methods` (i.e. `runtime-rpc.ts`'s
  graph via `ALL_RPC_METHODS`): `cli-registration.diff`, `floating-workspace-picker.diff`,
  `pairing-credentials.diff`, `open-in-browser-editors.diff`, `usage-analytics.diff`. Every one of
  those needs the same ratchet check; this is the highest-value cross-patch question at this bump.
- **unified-tab-host-ownership** — item 3. No other patch in `patches/series` mentions the file
  (`grep -l unified-tab-host-ownership patches/*.diff` is empty), so if the second outcome is
  reachable, this patch is the only candidate owner. Suspicion.
- **worktree-execution-host-alias** — this patch emits `toRuntimeExecutionHostId(env)` ids that
  only this helper compares correctly. No other patch mentions it. Suspicion: `workspace-restore.diff`
  and `agent-cold-restore.diff` reason about worktree host identity across a reconnect and may hit
  the same `===`-on-host-ids trap.
- **`src/main/ipc/*` → new module split** (the "cheapest way to make a desktop capability reachable
  from `orca serve`" pattern). This patch's `orca-runtime.ts` ← `ipc/floating-workspace-directory.ts`
  edge is exactly the shape upstream now extracts. Shared with `floating-workspace-picker.diff`
  (same module) and `usage-analytics.diff` (also greps `floating-workspace`). Suspicion.
- **`web-preload-api.ts` stub surface** — nine of the twelve patches edit this file:
  `cli-registration`, `runtime-seeded-settings`, `floating-workspace-picker`, `pairing-credentials`,
  `usage-analytics`, `resource-manager`, `workspace-restore`, `trusted-proxy-session` and this one.
  Confirmed by `grep -l`. Ordering and hunk collisions there are a series-wide question, not this
  patch's alone.
- **`MOBILE_RPC_METHOD_ALLOWLIST`** (`mobile-rpc-allowlist.test.ts`) — this patch adds
  `floatingWorkspace.markdownDirectory` to the runtime-only set. Co-touchers, confirmed:
  `cli-registration.diff`, `floating-workspace-picker.diff`, `pairing-credentials.diff`,
  `usage-analytics.diff`. The three assertion lists must merge, not conflict.
- **`store/slices/settings.ts`** — shared with `open-in-browser-editors.diff`, confirmed by
  `grep -l`. This patch inserts the catalog await inside `applyRuntimeStatus`'s staleness branch.
- **`RemoteFileBrowser.tsx`** — shared with `floating-workspace-picker.diff`, confirmed. That patch
  introduces the component's use; this one adds `selectableFileExtensions`. A merge candidate if the
  cross-patch pass wants one file-browser patch.
- **`pty-connection.ts`** — `agent-cold-restore.diff` names it in prose only; `grep -n '^Index:'`
  shows it does not modify the file. No collision.

## Unverified

- Nothing was executed. No build, no `vitest`, no `quilt push`, no `orca serve`. Every claim above
  is read from `git show v1.4.190:<path>` and from `patches/execution-owner.diff`.
- I did **not** run `node config/scripts/check-runtime-electron-ratchet.mjs` against the patched
  tree (the task is read-only and the script does not exist at the v1.4.188 pin). The ratchet
  claim in item 1 is a source-graph reading: `orca-runtime.ts` (patched) → `ipc/floating-workspace-directory.ts`
  → `electron`, and `runtime-rpc.ts` → `rpc/dispatcher.ts:15` → `rpc/methods` → overlay
  `methods/floating-workspace.ts:5` → the same module. I did not confirm that `rpc/methods/index`
  actually re-exports `FLOATING_WORKSPACE_METHODS` in the assembled tree, nor that esbuild's
  `metafile` collects it (an unreferenced re-export could be tree-shaken).
- I checked `filesystem-auth.ts`, `filesystem-allowed-roots.ts` and `filesystem-path-containment.ts`
  for `electron`. I did **not** check `registered-worktree-roots-cache.ts` or the `../persistence`
  type-only import, so "the whole subtree is portable" is unproven.
- Whether the second outcome in item 3 is reachable in the tile is **unverified**. It needs a
  worktree row whose `hostId` is `runtime:<env>` while `activeWorkspaceExecutionHostId` is null.
  What would prove it: in a served tile, activate a project worktree from the sidebar, then read
  `useAppStore.getState().activeWorkspaceExecutionHostId` and the matching row's `hostId` /
  `runtimeOwnerEnvironmentId`; open a new tab in that worktree and read its `executionHostId`. If
  the tab reads `local` while the row reads `runtime:…`, the defect is real. I did not trace which
  sidebar callers pass `executionHostId` to `setActiveWorktree`.
- Whether `ensure-simulator-tab.ts` (the other consumer of `getActiveExecutionHostIdForWorktree`)
  is reachable in the tile at all. `client-creation-action-policy.ts` hides `mobile-emulator`
  unconditionally in the web client, which suggests not, but I did not confirm that the hidden
  policy is the only entry point to `ensureSimulatorTab`.
- Whether the floating workspace uses `unifiedTabsByWorktree` / `createUnifiedTab` at all in the
  tile. If it does not, item 3 never touches the floating surface and concerns only real worktrees.
- Whether `mise run check` runs any equivalent of the upstream ratchet. I did not read `.mise/tasks/`.
- The 20 "byte-identical" files were established with `git diff --stat v1.4.188..v1.4.190 -- <paths>`
  over the exact list from `grep '^Index:' patches/execution-owner.diff`; a file absent from that
  diffstat is unchanged. I did not verify that every hunk still applies — only that its context
  region lies outside upstream's changed hunks.
