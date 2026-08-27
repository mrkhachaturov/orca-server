# runtime-seeded-settings — v1.4.190 re-derivation

## Problem

A freshly provisioned workspace cannot declare how its Orca looks or which features are on. Every
browser opening the tile starts at stock defaults, and the same toggles get re-clicked after every
workspace create. Writing the runtime's store changes nothing, because `settings.get` returns a
short key list that contains no appearance and no `experimental*` key.

## Still present at v1.4.190

yes.

- `getClientSettings()` — `src/main/runtime/orca-runtime.ts:3869-3920`. The `Pick` union and the
  returned object are byte-identical to v1.4.188 (`git diff v1.4.188..v1.4.190 --` on that file
  changes only `app.isPackaged` → `getAppEnvironment().isPackaged()` at `:3937`, inside
  `reconcileManagedAgentHooks`). Upstream added **zero** keys, so the overlap with our allowlist is
  zero and the allowlist shrinks by nothing.
- `settings.get` handler — `src/main/runtime/rpc/methods/client-ui.ts:19`. File unchanged between
  the tags.
- The web load path did **not** move. `getRuntimeBackedStoredSettings` —
  `src/renderer/src/web/web-preload-api.ts:3887-3943`, byte-identical. The whole file's
  v1.4.188→v1.4.190 diff is one line: `onToggleAgentDashboard: () => noopUnsubscribe` at `:2846`.
- `SETTINGS_STORAGE_KEY = 'orca.web.settings.v1'` at `:169`. `getStoredSettings()` (`:3812`) writes
  only when the raw key is already present (`:3836-3845`), so "key absent = this browser's first
  visit" still holds.
- `src/shared/global-settings-types.ts` unchanged between the tags (213 top-level keys). All 22 keys
  we seed still exist: `theme:76`, `leftSidebarAppearanceMode:78`, `leftSidebarTintColor:79`,
  `leftSidebarTintOpacity:80`, `uiLanguage:81`, `appIcon:82`, `appFontFamily:83`,
  `terminalThemeDark:133`, `terminalUseSeparateLightTheme:136`, `terminalThemeLight:137`,
  `openAgentTabsInChatByDefault:205`, `experimentalNativeChat:207`, `openInApplications:211`,
  `experimentalMobile:388`, `mobileEmulatorEnabled:390`, `experimentalPet:408`,
  `experimentalActivity:412`, `experimentalAgentDashboardPopout:414`,
  `experimentalTerminalAttention:422`, `experimentalAgentHibernation:424`,
  `agentHibernationIdleMs:426`, `experimentalEphemeralVms:430`.

## Who owns this logic now

**no upstream owner.** Three candidates checked, none of them owns it:

- `recordFeatureInteraction` (`src/main/runtime/orca-runtime.ts:3862`,
  `src/main/persistence/applying-settings/feature-interaction-recording.ts:21`) counts usage of
  catalog features (`src/shared/feature-interactions.ts`) into the runtime's persisted UI state for
  telemetry buckets and tours. Runtime-owned and shared by every client of that runtime, keyed on a
  fixed feature-id catalog — it cannot carry a setting and cannot tell one browser from another.
  `PersistedUIState` travels `ui.get`/`ui.set` (`client-ui.ts:63,68`) and is likewise shared, not
  per-browser.
- `tabSwitchKeybindingSeed?: 'pending' | 'done'` (`src/shared/global-settings-types.ts:458`,
  consumed at `src/main/index.ts:2623-2625`, seeded at
  `src/main/persistence/loading-store/store.ts:1658-1669`) is the nearest one-shot upstream has: a
  store-side cohort marker for one keybinding migration, written back to the same store. Not a
  defaults channel, and it predates v1.4.190 (file unchanged between the tags).
- The web client's own per-browser one-shot, `getStoredOnboarding()` (`web-preload-api.ts:4053`, key
  `orca.web.onboarding.v1` at `:172`), writes itself on its first read and carries onboarding flow
  state only. Not a general first-visit gate; nothing can be hung off it.

To become upstream-owned this needs both halves added: keys on `getClientSettings()`'s `Pick` union,
and a client-side adopt-once rule in `getRuntimeBackedStoredSettings`. That is exactly the patch.

The one upstream block the patch must satisfy is **The runtime-electron ratchet** — see below.

## Verdict

keep — both halves are byte-identical upstream, no owner appeared, and the allowlist shrinks by zero
keys.

## Correct shape at v1.4.190

Unchanged in shape; nothing to reroute. Line numbers are pristine v1.4.190.

1. `src/main/runtime/orca-runtime.ts` — import `pickRuntimeSeededSettings` and
   `RuntimeSeededSettingKey` from `../../shared/runtime-seeded-settings`; widen the
   `getClientSettings()` return type at `:3869` with
   `& Partial<Pick<GlobalSettings, RuntimeSeededSettingKey>>`; spread
   `...pickRuntimeSeededSettings(settings)` as the **first** member of the returned object at
   `:3896`, so every explicit key below still wins.
2. `src/renderer/src/web/web-preload-api.ts` — in `getRuntimeBackedStoredSettings` (`:3887`) capture
   `window.localStorage.getItem(SETTINGS_STORAGE_KEY) === null` before `getStoredSettings()`
   (`:3888`); after the existing per-key copies and under that flag,
   `Object.assign(runtimeSettings, pickRuntimeSeededSettings(result.settings))`, still ahead of
   `mergeSettings(local, runtimeSettings)` (`:3936`) and `writeStoredSettings(next)` (`:3937`).
   `syncRuntimeBackedSettings` (`:3960-3990`) has a fixed write-back allowlist that contains none of
   the seeded keys, so the one-way property holds without an added guard.
3. Overlay `src/shared/runtime-seeded-settings.ts` — no change. `normalizeLeftSidebarAppearanceMode`
   stays ours: upstream still ships no normalizer, `LeftSidebarAppearanceMode` is a bare type at
   `src/shared/ui-chrome-types.ts:15` used only by
   `src/renderer/src/components/settings/LeftSidebarAppearanceSetting.tsx:3`. Its sibling
   normalizers all still exist (`src/shared/app-icon.ts`, `left-sidebar-appearance.ts`,
   `open-in-applications.ts`, `ui-language.ts`).
4. Ratchet obligation. The new import enters `src/main/runtime/orca-runtime.ts`, one of the two
   ratchet entry points (`config/scripts/check-runtime-electron-ratchet.mjs:35-38`), whose baseline
   `config/runtime-electron-baseline.txt` is empty and may only shrink. None of the five modules the
   overlay imports pulls `electron`, so the graph stays at zero; run
   `node config/scripts/check-runtime-electron-ratchet.mjs` after restacking rather than assuming it.
5. Correct the header's *To test* line. The file is the **active Orca profile's** store,
   `<userData>/profiles/<profileId>/orca-data.json`
   (`src/main/orca-profiles/profile-storage-paths.ts:40-45`, wired at `src/main/index.ts:2308-2309`),
   with the legacy `<userData>/orca-data.json` (`:57`) — not a per-workspace file. Under the
   AppImage's `orca serve` (Electron shim, `.mise/tasks/test/e2e.sh:55,66`) userData is
   `~/.config/orca`; under `orcad` it is `$ORCA_USER_DATA` → `$XDG_DATA_HOME/Orca` → `~/.orca`
   (`src/main/orcad/orcad-entry.ts:22-29`). The patch itself is unaffected either way — it reads
   `this.store.getSettings()`, never a path — so the fix is wording: say "the runtime profile's
   `orca-data.json`" and stop implying a per-workspace file.
6. Close a coverage gap while re-deriving: **no test asserts that `getClientSettings()` returns the
   seeded keys.** `src/shared/runtime-seeded-settings.test.ts` covers the pure picker;
   `src/renderer/src/web/web-preload-settings-seeding.test.ts` covers the load path against a
   hand-made `settings.get` result. The runtime-side spread is uncovered — add a case there and name
   it in the header.

## Blocks this touches that other patches may share

- **The runtime-electron ratchet** — the patch adds an import to `src/main/runtime/orca-runtime.ts`,
  a ratchet entry point with an empty baseline. Other patches editing that file:
  `floating-workspace-picker.diff`, `execution-owner.diff`, `headless-orchestration-delivery.diff`,
  `usage-analytics.diff`, `agent-cold-restore.diff`. Suspicion: any of them adding an import to the
  runtime graph carries the same zero-baseline obligation, and the gate is per-graph, not per-patch —
  the failure surfaces on whichever patch is on top.
- **orcad — the plain-Node runtime entrypoint** — the seed reads `store.getSettings()`; orcad boots a
  real `Store` (`orcad-entry.ts:124-127`), so the seed works, but the userData root moves.
  Suspicion: `trusted-proxy-session.diff` (owns how `serve` is launched) and
  `headless-orchestration-delivery.diff` (headless runtime behaviour) share the "which host boots
  the runtime" question if orca-server ever moves off the Electron `serve` path.
- **`getClientSettings` / `settings.get` and `MOBILE_RPC_METHOD_ALLOWLIST`** — not a section name in
  `00-building-blocks.md`; naming it because the cross-patch pass needs it. `settings.get` is on the
  mobile allowlist (`src/main/runtime/runtime-rpc.ts:179,384`), so widening `getClientSettings()`
  widens what a phone-scope credential receives. **Confirmed, not suspicion:**
  `open-in-browser-editors.diff` (07) depends on this patch — it seeds `openInApplications` through
  our allowlist, adds `url` to `OpenInApplication` in `src/shared/open-in-applications.ts` and
  `src/shared/ui-chrome-types.ts` (both imported by our overlay module), strips `openInApplications`
  from the mobile payload in `client-ui.ts`, and names `runtime-seeded-settings.test.ts` in its own
  coverage list. Suspicion: `pairing-credentials.diff`, `cli-registration.diff`,
  `floating-workspace-picker.diff`, `execution-owner.diff` and `usage-analytics.diff` all patch
  `src/main/runtime/mobile-rpc-allowlist.test.ts`, so they share the allowlist invariant even though
  none of them touches settings.
- **The web client's localStorage settings blob (`orca.web.settings.v1`)** — also not a
  `00-building-blocks.md` section. Ours is the only patch touching `getStoredSettings` /
  `writeStoredSettings` / `getRuntimeBackedStoredSettings` (grepped all twelve `.diff` bodies, no
  other hit). Suspicion of hunk-context contention only, not of logic:
  `trusted-proxy-session.diff`, `pairing-credentials.diff`, `resource-manager.diff`,
  `cli-registration.diff`, `floating-workspace-picker.diff`, `execution-owner.diff`,
  `usage-analytics.diff` and `workspace-restore.diff` all edit `web-preload-api.ts`.

## Unverified

- Nothing was executed. No `mise run up`, no `quilt push`, no `vitest`, no `serve`. Every claim is
  read from git at the two tags plus the patch and overlay sources in this worktree.
- Whether the patch still applies cleanly on the moved pin — not restacked; read-only task.
- Whether any renderer code outside `web-preload-api.ts` reads a seeded key before
  `getRuntimeBackedStoredSettings()` resolves. I verified only that `getStoredSettings()` cannot
  create the localStorage blob, not the full renderer boot order.
- I did not enumerate all 213 `GlobalSettings` keys looking for a **new** key that ought to join the
  allowlist. I verified only that the 22 we seed still exist and that upstream added none to
  `getClientSettings()`.
- Patch 07 read as header plus its `client-ui.ts` hunk, not in full; the coupling above is what those
  two show.
- Whether orca-server intends to move from Electron `orca serve` to `orcad`. If it does, I did not
  check that `startOrcad`'s store bootstrap reaches the same settings defaults as
  `src/main/index.ts`.
