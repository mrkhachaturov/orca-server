# appearance — what it needs to work in the browser

Paths relative to `lib/orca/`. Line numbers are the assembled tree (`quilt push -a` + overlay) at
pin `v1.4.190`; no appearance file is touched by the series, so they equal pristine upstream.

## State today

`00-sections.md` measures the section on the deployed `v4.190.1` (Linux host, driven from a Mac
browser) as **renders partially**: listed, opens, three collapsible rows — Interface, Terminal,
Window & Sidebar — plus App Icon at the bottom.

Four `isWebClientLocation()` sites decide what is dropped (`AppearancePane.tsx:82,85,86,150`,
mirrored at `TerminalAppearanceSection.tsx:86`):

| row | tile | desktop on the deployed Linux host | desktop elsewhere |
| --- | --- | --- | --- |
| Warp theme import + YAML import | hidden | shown | shown |
| Minimize to tray on close | hidden | hidden — `getRendererAppPlatform() !== 'win32'` | Windows only |
| Show Menu Bar Icon | hidden | hidden — platform is not `darwin` | macOS only |

`isDesktopWindows` / `isDesktopMac` are `getRendererAppPlatform() === … && !isWebClient`
(`AppearancePane.tsx:85-86`), and `getRendererAppPlatform()` reads
`window.api.platform.get().platform`, which the web preload answers with the **browser's** platform
(`web-preload-api.ts:669-677`). So on this deployment the tray and menu-bar rows are absent from the
tile *and* from the Linux desktop, and **the only row the tile drops that the desktop shows is the
Warp import**.

Five further defects are established from the code path, not observed on the tile (see
**Unverified**):

- **Nothing the pane writes reaches the host.** Every control except UI Zoom calls `updateSettings` →
  `settings.set`, which writes localStorage and forwards an allowlist
  (`web-preload-api.ts:4302` `syncRuntimeBackedSettings`). The allowlist is six keys —
  `worktreeVisibilityDefaults`, `experimentalNewWorktreeCardStyle`, `compactWorktreeCards`,
  `minimaxGroupId`, `minimaxUsageModels`, `prBotAuthorOverrides` — none of them appearance.
  Independently, `SettingsUpdate` (`main/runtime/rpc/methods/client-ui-schemas.ts:128-167`,
  `.strict()`) declares **zero** appearance keys, so widening the preload alone would be rejected on
  the wire. The 36 keys the pane writes are: `theme`, `uiLanguage`, `appFontFamily`, `appIcon`,
  `showTitlebarAppName`, `minimizeToTrayOnClose`, `showMenuBarIcon`, `leftSidebarAppearanceMode`,
  `leftSidebarTintColor`, `leftSidebarTintOpacity`, `showTasksButton`, `showMobileButton`,
  `showAutomationsButton`, `showPinnedWorktreesInGroups`, `showGitIgnoredFiles`,
  `terminalFontFamily`, `terminalFontSize`, `terminalFontWeight`, `terminalFontWeightBold`,
  `terminalLineHeight`, `terminalLigatures`, `terminalPaddingX/Y`, `terminalCursorStyle`,
  `terminalCursorBlink`, `terminalCursorOpacity`, `terminalBackgroundOpacity`,
  `terminalDividerThicknessPx`, `terminalInactivePaneOpacity`, `terminalMouseHideWhileTyping`,
  `windowBackgroundBlur`, `terminalThemeDark`, `terminalThemeLight`,
  `terminalUseSeparateLightTheme`, `terminalColorOverrides`, `terminalCustomThemes`.
- **UI Zoom renders and scales nothing.** `UIZoomControl.tsx:20` calls `applyUIZoom`, whose only
  real effect is `window.api.ui.setZoomLevel` (`lib/ui-zoom.ts:10`) — `webFrame.setZoomLevel` on the
  desktop, a bare `zoomLevel = level` assignment in the web preload
  (`web-preload-api.ts:3004-3006`). The CSS variable it also sets, `--ui-zoom-factor`, has exactly
  one consumer in the tree: the traffic-light pad width (`assets/main.css:833`). The percentage
  changes; the interface does not.
- **UI Zoom is the one appearance control that *does* reach the host, and it is per-device.**
  `ui.set` forwards everything except three pinned pairing-local fields
  (`web-preload-api.ts:2914-2922`), `uiZoomLevel` is in `UiUpdateFields`
  (`client-ui-schemas.ts:213`), and `ui.set`'s handler writes `runtime.updateUIState`
  (`main/runtime/rpc/methods/client-ui.ts:69-78`) — one global UI state, not per-client. Two
  browsers on two screens overwrite each other's zoom.
- **Ghostty import is shown and can never find anything.** `useGhosttyImport.ts:35` calls
  `window.api.settings.previewGhosttyImport`, which the web preload's `settings` object
  (`web-preload-api.ts:757-833`) does not define. `withFallback` hands back a `createFallbackProxy`,
  and `getFallbackResult` has a branch built for this exact name shape:
  `name.startsWith('preview')` → `{ found: false, diff: {}, unsupportedKeys: [] }`
  (`web-preload-api.ts:4978-4980`). It resolves, so the modal reports "no config found" rather than
  erroring.
- **Font pickers fall back to a curated list.** `Settings.tsx:476` calls
  `window.api.settings.listFonts()`, hardcoded to `Promise.resolve([])` in the web preload
  (`web-preload-api.ts:832`). `requestFontSuggestions` latches after the first empty answer
  (`Settings.tsx:481`), so IDE Font and Terminal Font offer only `getFallbackTerminalFonts()`.

## Which gate, and why

**Gate 4 only.** `appearance` is ungated in gate 1 (the nav builder lists it unconditionally and
`settings-nav-web-parity.diff` leaves that alone) and ungated in gate 2 — it is not one of the 11
`showDesktopOnlySettings` JSX blocks; its `<SettingsSection id="appearance">` is at
`Settings.tsx:1621` outside them. Gates 1, 2 and 3 need no change for this section.

The gate-4 sites, and the two that must move together:

| site | drops | axis it uses | axis it should use |
| --- | --- | --- | --- |
| `AppearancePane.tsx:82` `isWebClient` | feeds the three below | — | — |
| `AppearancePane.tsx:85,86` tray / menu bar | two rows | renderer platform **and** not-web | correct as it stands |
| `AppearancePane.tsx:150` `showWarpImport: !isWebClient` | Warp search entries | client | **host** |
| `TerminalAppearanceSection.tsx:86` `showWarpThemeImport` | the Warp button and modal | client | **host** |
| `useSettingsNavigationMetadata.ts` `getAppearancePaneSearchEntries({showWarpImport})` | search hits | client | **host** — must move with the two above |

The nav copy is inside `settings-nav-web-parity.diff`'s hunk at `:497` and its comment already says
the Warp axis is wrong and defers the move to whoever verifies the wire. That is this report.

## What the pane actually needs

| wire | today | how established |
| --- | --- | --- |
| `settings.get` / `settings.update` (`CLIENT_UI_METHODS`, `main/runtime/rpc/methods/client-ui.ts:17,34`) | exists; `get` returns the whole client settings object, `update` accepts **no** appearance key | read `client-ui.ts` and the `SettingsUpdate` object at `client-ui-schemas.ts:128-167`; the object is `.strict()`, so an unlisted key rejects the whole payload |
| the web `settings` preload namespace | real, partial — `get`, `getSync`, `set`, `setActiveRuntimeEnvironmentPreference`, `updatePRBotAuthorOverride`, `listFonts`, `onChanged`, cast `as unknown as WebSettingsApi` | read `web-preload-api.ts:757-833` |
| `settings.previewGhosttyImport` over the wire | **absent.** No such RPC: the `settings.*` family is exactly `get`, `update`, `getTerminalQuickCommands`, `updateTerminalQuickCommands`, `updatePRBotAuthorOverride` (+ ours, `updateSharingCapabilities`) | listed every `settings.` method name under `main/runtime/rpc/`; the only host entry point is `ipcMain.handle('settings:previewGhosttyImport')` at `main/ipc/settings.ts:303` |
| `settings.previewWarpThemeImport` over the wire | **absent**, same registry | same |
| `settings.listFonts` over the wire | **absent**; the preload stubs it to `[]` | same registry read + `web-preload-api.ts:832` |
| **AppEnvironment** / host filesystem for the import readers | present and Electron-free for Ghostty: `main/ghostty/index.ts` imports only `node:fs/promises`, `node:os` and sibling modules — it is directly callable from an RPC handler today | read its import block |
| **Modules split out of `src/main/ipc/*`** (building block) for Warp | needed. `main/warp-themes/index.ts` is import-clean apart from `manual-warp-theme-files.ts`, which imports `BrowserWindow, dialog` from `electron` at runtime (`:3`). `resolveThemeSource`'s `auto` branch reaches only `auto-discovered-theme-files.ts`, which is Electron-free | read both files' import blocks; `resolveThemeSource` at `warp-themes/index.ts:33-58` |
| `desktopOnly` on the Warp preview | **modelled and produced by nobody.** `WarpThemeImportPreview.desktopOnly` (`shared/terminal-custom-themes.ts:36`) is read by `WarpThemeImportModal.tsx:106,269` to hide exactly the two window-bound buttons (Choose File / Choose Folder) and keep the auto-scan path; no main-process file ever sets it | grepped every non-test occurrence — four consumers, zero producers |
| a font source for the browser | **wrong axis, not a missing wire.** On the desktop the host's installed fonts *are* the rendering device's. In the tile the rendering device is the viewer's browser, so a host `listFonts` RPC would suggest fonts that cannot render. The device-side answer is `queryLocalFonts()` (Local Font Access, permission-gated) or the curated fallback already in place | read `Settings.tsx:370-376,468-492` and `web-preload-api.ts:832` |
| a consumer for `appIcon` in the browser | **absent.** Every non-test consumer is main-process: `applyAppIcon` (`main/index.ts:2401`), `createMainWindow.ts:300`, `tray/system-tray.ts:244`. Nothing in the renderer sets a document favicon from it | grepped `appIcon` across `lib/orca/src`, and `favicon` — the only favicon hits are browser-*pane* tab icons in `web-session-tabs-sync.ts` |
| **RuntimeDesktopSurface**, **SecretStore**, **MainHttpClient** | not needed by this pane | — |

The seed direction already works. `patches/runtime-seeded-settings.diff`
(`src/shared/runtime-seeded-settings.ts`) carries host → browser, first visit only, for `theme`,
`appIcon`, `appFontFamily`, `uiLanguage`, `leftSidebarAppearanceMode`, `leftSidebarTintColor`,
`leftSidebarTintOpacity`, `terminalThemeDark`, `terminalThemeLight`,
`terminalUseSeparateLightTheme` — applied at `web-preload-api.ts:4276` behind
`isFirstVisit`. Its doc comment states the split this section was asked to establish, and the split
is right: *look and capability may seed; per-device ergonomics (zoom, bounds, font sizes) must not,
because the same runtime is driven from several screens.*

Measured against that rule, the pane's keys divide as:

- **Correctly browser-local, no host wire wanted** — `uiZoomLevel`, `terminalFontSize`,
  `terminalLineHeight`, `terminalPaddingX/Y`, `terminalFontWeight`, `terminalFontWeightBold`,
  `windowBackgroundBlur`, `terminalBackgroundOpacity`, and the two desktop-window rows
  (`minimizeToTrayOnClose`, `showMenuBarIcon`), which a browser tab genuinely has no analogue for.
  `uiZoomLevel` is the one that violates the rule today, in the direction nobody chose.
- **Workspace-carried, and already seeded** — the ten keys above.
- **Workspace-carried and NOT seeded** — `terminalCustomThemes` and `terminalColorOverrides` (a Warp
  or Ghostty import's whole output), plus the Window & Sidebar visibility toggles
  (`showTasksButton`, `showMobileButton`, `showAutomationsButton`, `showPinnedWorktreesInGroups`,
  `showGitIgnoredFiles`, `showTitlebarAppName`). A theme imported in one browser exists in that
  browser's localStorage and nowhere else.
- **No direction makes it work** — `appIcon` in the browser: seeded, but with no renderer consumer
  it changes nothing, and written back it would set the headless host's dock icon.

## Verdict

**Works partially. Missing:**

1. Warp theme import — hidden on the client axis when it is a host-filesystem capability. `auto`
   needs no window; the modal already models `desktopOnly` for the two that do.
2. Ghostty import — shown, and permanently "not found", because no RPC carries it. The two are the
   same capability treated in opposite, both-wrong ways.
3. UI Zoom — renders, changes a number, scales nothing; and it is the only control here that writes
   to the host, into a single global UI state, which is where a per-device value should never land.
4. App Icon — writes a key with no browser consumer.
5. Font suggestions — empty from the host by design; the browser-device source is unwired.
6. No appearance setting can be written to the workspace at all. `SettingsUpdate` is `.strict()` and
   declares none of them, so this is a schema decision, not a preload one.

Not a verdict on the capability, but worth recording: 4 and 5 are the two places where a *smaller*
pane is the honest answer, and neither is a nav change.

## Size of the work

**A. Ghostty and Warp import over the wire** — the substantive piece.

- New RPC methods beside `CLIENT_UI_METHODS`
  (`main/runtime/rpc/methods/client-ui.ts`), or a small `settings-theme-import.ts` in the same
  directory: `settings.previewGhosttyImport` (params `null`) and `settings.previewWarpThemeImport`
  (params fixed to `{kind:'auto'}`). Handlers call the existing
  `previewGhosttyImport(store)` (`main/ghostty/index.ts:103`) unchanged, and an auto-only Warp
  entry point.
- Warp needs the **Modules split out of `src/main/ipc/*`** move one level down: extract
  `previewWarpThemeImportFromAutoDirectories` into `main/warp-themes/auto-preview.ts`, importing
  `auto-discovered-theme-files.ts` but not `manual-warp-theme-files.ts`, and have both
  `warp-themes/index.ts` and the new RPC import it. Without the split the runtime graph gains
  `BrowserWindow`/`dialog` and the Electron ratchet fails.
- Web preload: add `previewGhosttyImport` and `previewWarpThemeImport` to the `settings` object
  (`web-preload-api.ts:757`), the latter returning `desktopOnly: true` for a non-`auto` source so
  the modal hides Choose File / Choose Folder instead of offering a dialog that cannot open.
- Gate 4: flip `TerminalAppearanceSection.tsx:86` and `AppearancePane.tsx:150` off `isWebClient`,
  and the nav's `showWarpImport` with them. Three sites, one commit, or the search box gains a hit
  that leads to a hidden button.
- Neither import writes to the host, so `terminalCustomThemes` still lands in localStorage. Say so
  in the header rather than implying the import is shared.

**Ownership.** `AppearancePane.tsx` and `TerminalAppearanceSection.tsx` are unmodified upstream
(`mise run owner` on both: *unmodified. Changing it means a patch: quilt add first*). The nav file is
owned by `settings-nav-web-parity.diff`, and the `showWarpImport` line is inside a hunk that patch
already carries. Options: extend `settings-nav-web-parity.diff` (it already holds the comment
deferring this decision), or a new `appearance-theme-import.diff` that takes the two pane files plus
`web-preload-api.ts` and `client-ui.ts` and leaves the nav line to the existing patch. **Prefer the
new patch** — `settings-nav-web-parity.diff` is the contended file per shared dependency 7, and this
change is a capability, not a nav decision. `main/warp-themes/auto-preview.ts` is new upstream-shaped
source and goes in `src/`, not in a patch.

**Tests.** `AppearancePane.test.tsx` (663 lines) already covers the pane's rows, including
*"shows and updates the menu bar icon preference only on desktop macOS"*. New tests live in the
overlay at `src/renderer/src/components/settings/`, and the patch header must name them in
backticks (`series.bats` enforces it). From the *To test* symptom: with `__ORCA_WEB_CLIENT__` set,
the Warp import button renders and `previewWarpThemeImport` resolves through the runtime caller, not
through `createFallbackProxy`.

**B. UI Zoom** — one decision, then a small change. Either implement `applyUIZoom` for the web
client as a root `zoom`/`transform` (`lib/ui-zoom.ts` is upstream, so a patch), or drop the row in
the tile at gate 4 and let the browser's own zoom serve. Separately, stop a web client from putting
`uiZoomLevel` on `ui.set` (`web-preload-api.ts:2920`) — a one-key omission beside the existing
`omitPairingLocalUiFields` call — or accept the bleed deliberately and record why.

**C. Writing appearance to the workspace** — the largest, and it is a decision before it is work.
It needs `SettingsUpdate` widened in `client-ui-schemas.ts:128` **and** the
`syncRuntimeBackedSettings` allowlist widened to match; either alone is a silent no-op or a rejected
payload. `settings.update` is on `MOBILE_RPC_METHOD_ALLOWLIST`, so every key added is
phone-reachable — for `theme`, `appFontFamily` and the terminal theme keys that is neither
host-mutating nor credential-minting, so the invariant holds, but the test that enforces it must be
re-read before adding anything. Not required for A or B.

## Blocks this shares with other sections

From `00-sections.md`'s shared-dependency list:

- **(3) `syncRuntimeBackedSettings` / `getRuntimeBackedStoredSettings`** — shared with `browser`,
  `notifications`, `advanced`, `input`, `artifacts`, `share-skills`. Anyone widening the allowlist
  touches the same two functions; appearance is the section with the most keys behind it (36).
- **(4) `SettingsUpdate` is `.strict()`** — shared with `browser` (its four `browser*` keys are in
  the schema but not the allowlist) and `advanced` (its three keys are in neither). Appearance is
  the third case: **in neither**, like `advanced`.
- **(5) `withFallback` / `createFallbackProxy`** — the `preview` branch at
  `web-preload-api.ts:4978` exists solely for this pane's two import calls. Any section reasoning
  about "the call resolved, so it worked" is reasoning about this function.
- **(7) `patches/settings-nav-web-parity.diff`** — owns the nav's `showWarpImport` line. Its
  in-flight header explicitly defers the Warp decision to a verified answer.

Found here, not in that list:

- **`general` shares `settings.listFonts`.** `Settings.tsx:1389` passes the same
  `terminalFontSuggestions` into `GeneralPane`. A fix for the font source fixes both; leaving it
  fixes neither.
- **`setup-guide` / onboarding shares the Ghostty wire.** `components/onboarding/ThemeStep.tsx:83,132`
  calls `previewGhosttyImport` too. Building the RPC gives the onboarding theme step a real answer
  in the browser; it is silently `{found:false}` there today.
- **The `terminal` section does not share the Warp gate, contrary to `00-sections.md`.** That table
  attributes `TerminalAppearanceSection.tsx:86` to `terminal`; the only renderer of
  `TerminalAppearanceSection` in the tree is `AppearancePane.tsx:248`. `Settings.tsx:1519` renders
  `TerminalPane` for `terminal`. Whatever makes `terminal` partial is a different site, unexamined
  here — but the Warp import is `appearance`'s, and a fix there does not touch `terminal`.
- **`experimental` shares `runtime-seeded-settings.diff`.** The seed schema carries eleven
  experimental flags beside appearance's ten keys; widening either half edits one file
  (`src/shared/runtime-seeded-settings.ts`) and one test.
- **`floating-workspace` shares the gate-4 pattern exactly** — nav description and pane both call
  `isWebClientLocation()`, kept in step by `floating-workspace-picker.diff`. That is the shape the
  Warp fix must copy: move all sites or none.

## Unverified

- **Nothing was driven in a browser and nothing was assembled or run.** No `quilt push`, no
  `mise run up`, no `vitest`, no build, no live probe. The tile state is `00-sections.md`'s
  measurement plus source reading on top of it.
- **Five "State today" claims are code-path, not observation**: UI Zoom scaling nothing, UI Zoom
  reaching the host, Ghostty reporting not-found, empty font suggestions, and no write reaching the
  host. Each is traced end to end in source, but none was seen in the tile. Probes that would settle
  them without a browser, in one pass: over the RPC, `settings.get` before and after a tile edit to
  `theme` (expect unchanged), and `ui.get` before and after a zoom click (expect `uiZoomLevel`
  changed). The two that need the tile: whether the App Icon grid and the Ghostty modal render their
  empty/not-found states rather than erroring.
- **Whether `previewGhosttyImport` finds anything on this host.** `~/.config/ghostty` on the Coder
  workspace was not checked; a wired RPC could answer `{found:false}` honestly and still be correct.
- **`queryLocalFonts()` availability.** Named as the device-side font source from its Chromium API
  shape; not checked against the tile's browser, its permission prompt, or the `--trusted-proxy`
  origin's permissions policy.
- **`terminalCustomThemes` is absent from every host-bound path.** Established by reading the three
  lists (seed schema, sync allowlist, `SettingsUpdate`) — absence in three places I read, not a
  grep-returns-nothing claim, but a fourth path I did not look for would not have shown up.
- **The `desktopOnly` producer.** Concluded absent from a grep over `lib/orca/src` for the
  identifier; a value assembled dynamically would not have matched.
- **`MOBILE_RPC_METHOD_ALLOWLIST`'s test** was not read. The claim that appearance keys are safe to
  add there is reasoning about the invariant's wording, not about what the test asserts.
- **`patches/settings-nav-web-parity.diff` and `CHANGELOG.md` are uncommitted in this tree**
  (another agent's in-flight work). The nav comment quoted above is from that working copy, not from
  the `v4.190.1` artifact.
