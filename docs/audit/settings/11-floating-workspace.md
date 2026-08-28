# floating-workspace - what it needs to work in the browser

Paths relative to `lib/orca/`. Line numbers are pristine `v1.4.190` unless marked *shipped* (the
assembled tree: pin + series + overlay). Audited against the published `v4.190.1` (repo tag =
`1555391`), not against the uncommitted `settings-nav-web-parity.diff` in the working tree.

## State today

The pane is **reachable and every row draws** in the tile. The nav row is present (ungated in gate
1), the render block is ungated in gate 2, and all three rows mount: Enable Floating Workspace,
Terminal Directory (read-only input + folder button), Toggle Button Location.

This corrects the `renders partially` classification in `00-sections.md`. `includeBrowser =
!isWebClientLocation()` (`FloatingWorkspacePane.tsx:40`) feeds exactly two things — the pane's
`keywords` array (`:97`) and `getFloatingWorkspaceSearchEntries` (`:78`). It gates **no row**. Read
in full: shipped `FloatingWorkspacePane.tsx:62,135,154`. Nothing in this pane's rendered output is
dropped on the web client.

What the operator actually gets that the desktop does not:

1. **The folder button is a silent no-op whenever no Active Server has been chosen.**
   `shouldUseServerDirectoryBrowser` (shipped `:47-55`, added by `floating-workspace-picker.diff`)
   reads `settings.activeRuntimeEnvironmentId` **raw** (shipped `:66`). The web preload defaults that
   key to `null` for a web client (shipped `web-preload-api.ts:4193`, in `readStoredSettings`'s merge
   base beside `floatingTerminalEnabled: false`), and it is written only by an explicit choice —
   shipped `RuntimeEnvironmentsPane.tsx:724` (Settings > Remote Orca Servers) or shipped
   `useComposerState.ts:3418`. So on a fresh browser it is `null`, `useServerDirectoryBrowser` is
   `false`, and the button falls through to `window.api.app.pickFloatingWorkspaceDirectory()`, which
   the web preload leaves as `() => Promise.resolve(null)` (shipped `web-preload-api.ts:648`) — the
   call returns, nothing opens, no error. That is the exact symptom
   `floating-workspace-picker.diff` was written to remove, resurfacing in the case
   `execution-owner.diff` later established as this product's *normal* state ("with no Active Server
   chosen…" — that patch's own *To test*).

   Corroborating live measurement, taken over `coder ssh`, no browser: the host store
   `~/.config/orca/orca-data.json` on `ceo/pink-planarian-96` has **no `floatingTerminalTrustedCwds`
   key at all** — its `settings` object holds only `experimentalActivity`,
   `experimentalAgentDashboardPopout`, `experimentalNativeChat`, `experimentalPet`,
   `openAgentTabsInChatByDefault`, `openInApplications`, `theme`. No directory has ever been granted
   on this deployment, so the picker's success path has never run here.

2. **The search index and the nav row's description deny a browser tab the tile now has.**
   `execution-owner.diff` rewrote `client-creation-action-policy.ts` (pristine hunk at `:48-58`,
   shipped `:57-67`) so the floating workspace's managed browser takes the streaming runtime instead
   of being hidden. Its precondition is `browser.screencast.v1`, advertised when the offscreen
   backend is installed (shipped `orca-runtime.ts:6160-6172`; installed at shipped `index.ts:3253`,
   gated on `ensure-virtual-display.ts:112-113`). **Measured on the deployed host:** the Electron
   main process (pid 780) runs with `DISPLAY=:99`, `Xvfb :99` is alive (pid 777) and
   `/tmp/.X99-lock` is present. So the floating browser tab is enabled on this deployment while
   `includeBrowser` is `false` — the sidebar row reads "Global terminal and markdown tabs."
   (`useSettingsNavigationMetadata.ts:467-470`) and `browser` is dropped from the search keywords
   (`floating-workspace-search.ts:37-42`).

3. **The section header contradicts the sidebar row on the same screen.** `SettingsSection`'s
   `description` for this id is the hardcoded "Global terminal, browser, and markdown tabs."
   (`Settings.tsx:1619-1622`), rendered unconditionally at `SettingsSection.tsx:78`. Upstream's own
   inconsistency; for us the header is now the accurate half.

4. **Nothing this pane writes reaches the host.** `floatingTerminalCwd`, `floatingTerminalEnabled`
   and `floatingTerminalTriggerLocation` are absent from `syncRuntimeBackedSettings` (shipped
   `web-preload-api.ts:4302-4331` — upstream's six keys plus the two that travel on
   `settings.updateSharingCapabilities`), absent from `SettingsUpdate`
   (`rpc/methods/client-ui-schemas.ts:128`, `.strict()`; key-searched), and absent from
   `RUNTIME_SEEDED_SETTING_SCHEMA` (`src/shared/runtime-seeded-settings.ts:43-87`). They live in this
   browser's localStorage only. Consequence, not defect: each browser picks its own start directory,
   while the **trust grant** it produces is host-wide and persistent
   (`floatingWorkspace.grantDirectory` → `floatingTerminalTrustedCwds`).

Desktop, for contrast: the same three rows; the folder button opens a native OS dialog which
performs the trust grant as a side effect; the browser tab is client-local via `<webview>`; and the
settings land in the host's own store because there is no wire between them.

## Which gate, and why

**Gate 4 only** — `FloatingWorkspacePane.tsx:40` `includeBrowser = !isWebClientLocation()`, plus one
mirror of the same axis outside the pane at `useSettingsNavigationMetadata.ts:462,471-473`
(`includeBrowser: showDesktopOnlySettings`, itself `!isWebClient` at `:148` over
`isWebClientLocation()` at `:715` — the same predicate, `web-client-location.ts:1-11`).

Gates 1, 2 and 3 do **not** apply:

- Gate 1 — the nav entry is unconditional in the array (`useSettingsNavigationMetadata.ts:459-475`).
  Only its `description` and `searchEntries` read the client axis.
- Gate 2 — the JSX block is unconditional (`Settings.tsx:1613-1628`). This section is **not** one of
  the 11 `showDesktopOnlySettings` blocks, so it does not compete for shared dependency 1.
- Gate 3 — `setup-guide` only.

The defect in *State today* item 1 is none of the four gates. It is a **stale ownership read**:
`execution-owner.diff` moved every other floating-workspace surface onto
`resolveFloatingWorkspaceRuntimeEnvironmentId`
(`src/renderer/src/lib/floating-workspace-runtime-owner.ts`), which falls back to the single saved
environment when no Active Server is chosen (`:27-31`). `FloatingWorkspacePane.tsx` is the one
surface it did not move, because `floating-workspace-picker.diff` (series position 5) predates it
(position 8).

Order, if both are opened: the ownership read first — it is what makes the picker reachable at all —
then the `includeBrowser` axis.

## What the pane actually needs

| wire | state today | how established |
| --- | --- | --- |
| `floatingWorkspace.resolveCwd` | **exists**, ours — `src/main/runtime/rpc/methods/floating-workspace.ts:20-24`, registered through `FLOATING_WORKSPACE_METHODS` in `rpc/methods/index.ts` by `floating-workspace-picker.diff`; preload `app.getFloatingTerminalCwd` routes to it (shipped `web-preload-api.ts:629`) | read the overlay module and both patch hunks |
| `floatingWorkspace.grantDirectory` | **exists**, ours — same file `:34-41`; client caller `src/renderer/src/runtime/floating-workspace-directory-grant.ts` over `callRuntimeRpc` | same |
| `floatingWorkspace.markdownDirectory` | **exists**, ours — same file `:25-33`, wired to `app.getFloatingMarkdownDirectory` by `execution-owner.diff` (shipped `web-preload-api.ts:637`) | same; covered by `src/renderer/src/web/web-floating-markdown-directory.test.ts` |
| `files.browseServerDir`, via `RemoteFileBrowser` | **exists**, upstream; `execution-owner.diff` added file mode (`selectableFileExtensions`) to the same component | read the patch hunk |
| `app.pickFloatingWorkspaceDirectory` (native dialog) | **stubbed, deliberately** — `() => Promise.resolve(null)`, shipped `web-preload-api.ts:648`, reason in-line | read the shipped preload |
| the resolved floating owner | **exists**, ours — `floating-workspace-runtime-owner.ts`; `getFloatingWorkspaceRuntimeEnvironmentId(state)` is already an exported selector over `Pick<…,'settings'\|'runtimeEnvironments'>` | read the overlay module; consumers in `store/slices/browser.ts`, `client-creation-action-policy.ts`, `FloatingTerminalPanel.tsx` |
| the managed-browser decision | **exists**, upstream + ours — `getClientCreationActionPolicy(state, FLOATING_TERMINAL_WORKTREE_ID)['managed-browser']`, patched by `execution-owner.diff`; resolves `enabled` on this host | read the patch; display presence measured on the host, above |
| a host write path for `floatingTerminal*` | **absent** — not in `syncRuntimeBackedSettings`, not in `SettingsUpdate` (`.strict()`), not seeded | key-searched all three |

No `createFallbackProxy` hazard applies here: every namespace this pane touches (`app.*`, `files.*`,
`floatingWorkspace.*`) has a real key in the web preload, and the three `floatingWorkspace.*` methods
are exercised by named tests (`src/main/runtime/rpc/methods/floating-workspace.test.ts`,
`src/renderer/src/components/settings/floating-workspace-directory-grant.test.ts`) rather than by a
presence check against `ALL_RPC_METHODS`.

Building blocks from `00-building-blocks.md`: **AppEnvironment** — already used;
`floating-workspace-picker.diff` routed `app.getPath` through it so
`ipc/floating-workspace-directory.ts` and its closure are Electron-free. **RuntimeBrowserCommandsFactory**
— already used; it is the seam behind `browser.screencast.v1`, which is what decides whether
`includeBrowser` should be true. Nothing here needs a block that does not exist.

## Verdict

**Works partially — two things missing, neither of them a new wire.**

1. The Terminal Directory picker is dead whenever no Active Server has been chosen, because the pane
   reads `settings.activeRuntimeEnvironmentId` raw instead of the floating-owner resolver every
   other floating surface now uses. The RPC it needs already exists and is already registered; only
   the call site is wrong.
2. `includeBrowser` claims the tile has no floating browser tab. It has one — this deployment
   advertises the capability behind it — so the search index and the sidebar description are lying
   about a working feature, and the section header directly contradicts them.

Neither is "cannot work in a browser". Nothing in this pane is genuinely desktop-bound: a browser tab
has no OS file dialog, and that is precisely the gap `RemoteFileBrowser` already closes.

## Size of the work

**Primary owner: `patches/floating-workspace-picker.diff`** — the only patch carrying an `Index:`
line for `FloatingWorkspacePane.tsx` and `FloatingWorkspacePane.test.tsx`, and it already owns every
line involved. `orca-patch-audit` is the decider between extending it and extending
`execution-owner.diff` (which owns the ownership *rule* but not this file); my read is extend the
picker patch and import the resolver, matching what `FloatingTerminalPanel.tsx` already does.

Files:

- `src/renderer/src/components/settings/FloatingWorkspacePane.tsx` — replace the raw read (shipped
  `:66`) with the existing selector, `useAppStore(getFloatingWorkspaceRuntimeEnvironmentId)`.
  `shouldUseServerDirectoryBrowser` keeps its signature; it is simply fed a resolved id. ~4 lines.
- Same file, `includeBrowser` (shipped `:62`) — source it from
  `getClientCreationActionPolicy(state, FLOATING_TERMINAL_WORKTREE_ID)['managed-browser'].state ===
  'enabled'` instead of `!isWebClientLocation()`. That is the same predicate the tab button itself
  obeys, so the index cannot drift from the affordance again, and a headless host with no display
  correctly reverts to hiding it. ~3 lines.
- `src/renderer/src/hooks/useSettingsNavigationMetadata.ts:462,471-473` — the nav mirror must move in
  the same change or sidebar and pane disagree again. That file is owned by
  `patches/settings-nav-web-parity.diff`, so this half is a **second patch**; the pairing is shared
  dependency 2 in `00-sections.md`. The in-tree comment at shipped `:473-475` explicitly asks
  whoever changes one to change the other.
- `src/renderer/src/components/settings/Settings.tsx:1619-1622` — the section header description
  should read the same predicate. That file is owned by `settings-nav-web-parity.diff` at HEAD (it
  gained a `Settings.tsx` hunk after `v4.190.1`) and by `pairing-credentials.diff` at `:1744`; the
  hunks must not overlap.

Tests. `FloatingWorkspacePane.test.tsx` is patched by `floating-workspace-picker.diff`, and its case
*"falls back to the native picker in the web tile with no environment to browse"* currently **asserts
the defect** for the shipped call site. It stays valid as a statement about
`shouldUseServerDirectoryBrowser` in isolation — no id at all really does mean no host to list — so
split, do not invert. The new red-first case belongs one level up: web client,
`activeRuntimeEnvironmentId` null, exactly one entry in `runtimeEnvironments` → the server browser
opens and `floatingWorkspace.grantDirectory` is called. `orca-write-test` owns writing it, and the
patch header must name it or `series.bats` fails.

## Blocks this shares with other sections

From `00-sections.md`'s shared-dependency list:

- **(2) the nav builder / gate-1 file.** This section needs
  `useSettingsNavigationMetadata.ts:462,471-473` moved in step with the pane — the same pairing
  constraint `appearance` has (`showWarpImport` / `showSystemTray` / `showMenuBarIcon`) and
  `terminal` has. Shared file, shared patch: `settings-nav-web-parity.diff`.
- **(3) `syncRuntimeBackedSettings` + (4) `SettingsUpdate` `.strict()`.** `floatingTerminal*` sits on
  the wrong side of both, exactly like `browser` (`browserDefaultUrl` et al), `notifications`,
  `advanced` and `appearance`. Widening the allowlist for any one of them is the same edit in the
  same two files, and everything added there becomes phone-reachable via
  `MOBILE_RPC_METHOD_ALLOWLIST`. If that work is done centrally, decide this pane's three keys with
  it.
- **(7) patch overlap.** This section touches `settings-nav-web-parity.diff` (nav + header) and
  `floating-workspace-picker.diff` (pane). It does **not** touch `Settings.tsx:343` or any of the 11
  `showDesktopOnlySettings` JSX blocks, so it does not compete with the six listed-and-blank sections
  for shared dependency 1.

Not on that list, found here:

- **The native-dialog class, and it is not finished.** Every `pick*` in the web preload is a dead
  stub: `app.pickFloatingWorkspaceDirectory` → `null` (shipped `:648`),
  `app.pickFloatingMarkdownDocument` → `null` (shipped `:645`),
  `repos.pickFolder` / `pickFolders` / `pickDirectory` → `null`/`[]` (shipped `:1878-1880`),
  `shell.pickAttachment` / `pickImage` / `pickRepoIconImage` / `pickAudio` / `pickDirectory` → `null`
  (shipped `:3615-3619`). This pane and `FloatingTerminalPanel` are the only two sites where the
  class has been solved, both by the same shape: **open `RemoteFileBrowser` against the runtime, then
  send the chosen path to a host RPC.** The component already supports both halves — directory mode,
  and file mode with `selectableFileExtensions`, added by `execution-owner.diff`.
- **The `browser` section's cookie import is the same problem, and harder — say it loudly.**
  `BrowserUseCookieImportStep.tsx:71` → `importCookiesToProfile` (shipped
  `store/slices/browser.ts:2061`) → `window.api.browser.sessionImportCookies`, which the web preload
  answers with a flat *"Cookie import is unavailable in the web client."* (shipped
  `web-preload-api.ts:2564-2572`). The desktop handler
  (`main/ipc/browser-session-profile-ipc.ts:61-86`) does `pickCookieFile(parent)` at `:72` and then
  `importCookiesFromFile(filePath, profile.partition)` at `:77` — a native dialog **fused to a
  host-side operation inside one IPC handler**. That fusion is the only difference from Terminal
  Directory: the picker is not a separate API call the preload can re-point, so the handler must be
  split first (a `browser.sessionImportCookiesFromPath({ profileId, path })` runtime method over the
  existing `importCookiesFromFile`), and only then does `RemoteFileBrowser` in file mode finish it.
  Same class, same answer, one extra step. Shipped `store/slices/browser.ts:2065-2082` additionally
  refuses the import outright while a remote runtime is active — which in orca-server is always — so
  that guard has to move with it. The cookie file being read lives on the **host** (it is the host's
  own browser profile), so browsing the host filesystem is not a compromise here; it is the correct
  source.
- **`notifications` shares the class too.** `00-sections.md` names `shell.pickAudio` for
  `NotificationSoundSection`; it is `() => Promise.resolve(null)` at shipped `:3618`. Same fix shape.
- **Warp/Ghostty import is NOT this class**, despite sitting beside it in the table.
  `useWarpThemeImport.ts:54` calls `settings.previewWarpThemeImport(source)`, which reads a known
  config location — a host-fs read, no dialog. `terminal` and `appearance` need a host-fs read path,
  not a picker.
- **`execution-owner.diff`'s ownership resolver.** `floating-workspace-runtime-owner.ts` is consumed
  by `store/slices/browser.ts` (browser tab creation), `client-creation-action-policy.ts` (every
  Cmd+J create action) and `FloatingTerminalPanel.tsx`. Pointing this pane at it is additive; getting
  it wrong breaks the floating browser and the floating terminal with it.

## Unverified

- **`settings.activeRuntimeEnvironmentId` in the operator's actual browser.** Established from source
  that the web default is `null` (shipped `web-preload-api.ts:4193`) and that only two call sites
  write it. Not read from the live tile. Settling probe: in the tile console,
  `JSON.parse(localStorage.getItem('orca.web.settings.v1') ?? '{}').activeRuntimeEnvironmentId`. If
  it is a non-empty string, the picker works today for *that* browser and the defect is
  first-visit-only — still a defect, smaller blast radius.
- **The folder button's behaviour was not observed.** The no-op is read off the call chain (shipped
  `FloatingWorkspacePane.tsx:66` → `:67-70` → `:119-122` → shipped `web-preload-api.ts:648`).
  Settling probe: in a tile whose localStorage key above is unset, click the folder button in
  Settings > Floating Workspace and confirm nothing opens and no toast appears.
- **`browser.screencast.v1` was inferred, not read off the wire.** The display is measured
  (`DISPLAY=:99` on pid 780, `Xvfb :99` pid 777, `/tmp/.X99-lock` present) and the path from a
  display to the capability is read in source. Settling probe: `status.get` from the tile; check
  `capabilities` contains `browser.screencast.v1` and `browser.headless.v1`.
- **Whether a floating browser tab actually opens and streams.** The policy resolves `enabled`; that
  is a decision, not a frame. Not exercised.
- **The absent `floatingTerminalTrustedCwds` key is corroboration, not proof.** It shows no grant was
  ever recorded on this host; it does not distinguish "the button is dead" from "nobody pressed it".
- **The working tree is mid-change.** `patches/settings-nav-web-parity.diff` and `CHANGELOG.md` carry
  another agent's uncommitted edits, and that patch at HEAD already carries a `Settings.tsx` hunk
  `v4.190.1` did not. Everything above is read against the shipped tree and the `v1.4.190` pin; the
  ownership claim for `Settings.tsx` may move again before this lands.
- **Nothing was assembled or run.** No `quilt push`, no `mise run up`, no `vitest`, no build, no
  browser. Host access was read-only over `coder ssh`: `pgrep`, `/proc/<pid>/environ`,
  `ls /tmp/.X11-unix`, and one JSON read of `~/.config/orca/orca-data.json`. Nothing was written,
  restarted or reconfigured.
