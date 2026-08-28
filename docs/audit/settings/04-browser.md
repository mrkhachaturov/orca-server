# browser - what it needs to work in the browser

## State today

**Tile, published v4.190.1.** "Browser" is listed in the settings sidebar and in the Cmd+J palette;
selecting it leaves the content column empty - zero `[data-settings-section]` nodes. Measured in
phase 0 (`00-sections.md`), taken as fact here.

**Host, measured this pass over `coder ssh` (no browser, no writes):**

- The serve process is Electron under Xvfb: `dbus-run-session -- xvfb-run -a .../bin/orca-ide serve
  --trusted-proxy --port 6799` (pid 765), `Xvfb :99 -screen 0 1280x1024x24` (pid 777), main at pid
  793 with `DISPLAY=:99`. Children are 2 zygotes, `--type=gpu-process`, `--type=utility`
  NetworkService, `daemon-entry.js`, `computer-sidecar.js`. **No `--type=renderer` child**, so no
  `BrowserWindow` exists - but a real X display does.
- No browser is installed on the host. `$HOME=/home/coder`, `XDG_CONFIG_HOME` unset,
  `~/.config` = `coderv2 code-server glab-cli orca`. Absent: `google-chrome`, `microsoft-edge`,
  `BraveSoftware/Brave-Browser`, `Comet`, `Arc`, `~/.mozilla/firefox`. So
  `detectInstalledBrowsers()` (`browser/browser-cookie-import.ts:382`) returns `[]` there.
- `browser.profileList` **answers over the wire**: `orca-ide tab profile list --json` on the host
  returns `ok:true` with one profile - `{id:"default", scope:"default", partition:
  "persist:orca-browser", label:"Default", source:null}`. The host-side profile registry is live.
- `~/.config/orca/profiles/local-default/orca-data.json` `ui` already holds
  `browserDefaultZoomLevel` and `browserKagiSessionLink` (key names read, values not printed).
  `browserDefaultUrl` / `browserDefaultSearchEngine` are simply unset. The `ui.*` write path
  reaches the host store.

**Desktop, for contrast** (`BrowserPane.tsx:208-293`): the Browser Use 3-step setup card, Home
Page, Search Engine (+ Kagi session link), Default Zoom, Link Routing, Link Routing Modifier,
Terminal Link Actions, Localhost Worktree Labels, and Session & Cookies with a per-profile
`Import Cookies` menu whose entries are one `From <Browser>` per detected browser plus a permanent
`From File…` (`BrowserProfileRow.tsx:180-221`).

## Which gate, and why

**Gate 2 alone produces the blank pane.** `Settings.tsx:1571` -
`{showDesktopOnlySettings ? <SettingsSection id="browser">…` - is untouched by
`patches/settings-nav-web-parity.diff` as shipped in v4.190.1 (the patch carries no `Index:` line
for `Settings.tsx` at that tag). Gate 1 was opened by the same patch, so `browser` became
selectable while nothing renders it, and the `Settings.tsx:1098` fallback no longer fires.

**Gate 4 does not apply.** `BrowserPane.tsx` contains no `isWebClientLocation()` call; its only
client-axis read is `isMacUserAgent()` (`:114`), which is correct - the modifier-key copy must
follow the viewer's keyboard, not the host.

**Gate 3 does not apply.**

Order, if more than gate 2 is opened: gate 2 first (nothing can be observed until the pane
renders), then the execution-host default described below, then the `From File…` wire.

## What the pane actually needs

Row by row. Two independent write paths run through this pane and they behave differently -
conflating them is the trap.

### Path A - `window.api.ui.set`, and it reaches the host

`BrowserHomePageSetting`, `BrowserSearchEngineSetting` (+ `KagiSessionLinkForm`) and
`BrowserDefaultZoomSetting` do **not** go through `settings.set`. They call store actions in
`store/slices/ui.ts:2726-2746`, each `window.api.ui.set({…})`.

- **Exists.** `createWebUiApi().set` (`web-preload-api.ts:2731-2743`) writes localStorage, then
  `callRuntimeResult('ui.set', omitPairingLocalUiFields(updates), 15_000)`. The strip removes
  exactly three fields - `hideWorkspacesFromOtherDevices`, `manualRepoOrder`, `workspaceHostOrder`
  (`shared/pairing-local-ui-fields.ts:8-12`). None of the browser keys is among them.
- **Exists.** `UiUpdateFields` accepts `browserDefaultUrl`, `browserDefaultSearchEngine`,
  `browserDefaultZoomLevel`, `browserKagiSessionLink` (`rpc/methods/client-ui-schemas.ts:247-253`)
  - the sibling schema to `SettingsUpdate`, not the same one.
- **Exists.** `ui.get` merges the host answer back by spread (`mergeWebUIState:4147-4149`,
  `mergeHostWebUIState:4174`), so the value survives a round trip.
- **Established by**: reading the four-link chain, and by finding two of the four keys already
  persisted in the host's own `ui` state (above).

**This corrects `00-sections.md`**, which places these four keys in `SettingsUpdate` and behind the
`syncRuntimeBackedSettings` allowlist. They are neither. The four browser home/search/zoom keys are
the one part of this pane that already works end to end.

### Path B - `updateSettings` → `settings.set`, and it stays in the browser

`BrowserLinkRoutingSetting` (`openLinksInApp`, `openLinksInAppPreferencePrompted`),
`BrowserLinkRoutingModifierSetting` (`openLinksInAppModifierInverts`),
`BrowserTerminalLinkActionsSetting` (`terminalLinkActionPopoverEnabled`) and
`BrowserLocalhostWorktreeLabelsSetting` (`localhostWorktreeLabelsEnabled`).

- **Absent from both host paths.** None of the five keys is in `SettingsUpdate`
  (`client-ui-schemas.ts:128-167`, `.strict()`) or in `syncRuntimeBackedSettings`'s six-key
  allowlist (`web-preload-api.ts:3968-3989`). Established by reading both lists.
- **And that is correct here.** All five have no main-process consumer: outside
  `shared/constants.ts` defaults, `global-settings-types.ts` and `shared/telemetry-events.ts`, they
  appear only in the renderer. They decide where a click in *this* tab goes and whether *this*
  tab draws a popover. Per-browser localStorage is the right home; the only cost is that they do
  not follow the operator to another device.

### Path C - Session & Cookies, and it depends on which host is selected

The store runs every profile action twice over, choosing on
`getBrowserSettingsRuntimeEnvironmentId` (`store/slices/browser.ts:294-299`):

| action | runtime branch - RPC | local branch - preload |
| --- | --- | --- |
| list | `browser.profileList` | `browser.sessionListProfiles` → `[]` |
| create | `browser.profileCreate` | `sessionCreateProfile` → `null` |
| delete | `browser.profileDelete` | `sessionDeleteProfile` → `false` |
| detect browsers | `browser.profileDetectBrowsers` | `sessionDetectBrowsers` → `[]` |
| import from browser | `browser.profileImportFromBrowser` | `sessionImportFromBrowser` → `{ok:false}` |
| clear default cookies | `browser.profileClearDefaultCookies` | `sessionClearDefaultCookies` → `false` |
| **import from file** | **no method exists** - refused in the store, `browser.ts:2058-2076` | `sessionImportCookies` → `{ok:false}` |

- **The six RPC methods exist and are real.** `rpc/methods/browser-core.ts:138-167` defines them;
  they bind to `RuntimeBrowserCommands` through `orca-runtime.ts:38571-38584`, whose factory is the
  **RuntimeBrowserCommandsFactory** port. The host runs the full Electron main under Xvfb, so the
  desktop factory is installed, not the rejecting Proxy. Established over the wire, not by grep:
  `orca-ide tab profile list --json` answers `ok:true` on the deployed host.
- **The seven preload members are hard stubs**, not `createFallbackProxy` misses -
  `createBrowserApi()` (`web-preload-api.ts:2401-2424`) spells each one out. No patch in the series
  touches `createBrowserApi`; `grep '^Index:.*web-preload-api.ts' patches/*.diff` shows eleven
  patches on that file and none of them this function.
- **Which branch the tile takes today: the local one.** `getBrowserSettingsHostId`
  (`browser.ts:271-275`) = `browserSessionHostIdOverride ?? getSettingsFocusedExecutionHostId
  (settings)`, and the latter returns `LOCAL_EXECUTION_HOST_ID` unless
  `settings.activeRuntimeEnvironmentId` is set (`shared/execution-host.ts:174-181`). Nothing sets
  it on boot - the only callers are the Remote Orca Servers pane and the composer host switch. So
  the pane's default selection is `local`, which on orca-server is the fiction AGENTS.md names.
- **The runtime branch is reachable by hand.** `runtimeEnvironments.list()` on web returns exactly
  the one paired server (`web-preload-api.ts:1447-1450`), and `buildExecutionHostRegistry` always
  emits `local` plus one entry per environment (`shared/execution-host-registry.ts:193-213`), so
  `hostOptions.length === 2` and the Host selector renders
  (`BrowserSessionCookiesSection.tsx:86`). Picking the server switches the whole section onto the
  six live RPCs.
- **What each import source does on this host.** The menu is data-driven from `detectedBrowsers`
  (`BrowserProfileRow.tsx:180`). On the runtime branch that list is
  `browserProfileDetectBrowsers()` → `detectInstalledBrowsers()` on the **host**. Measured: the
  host has none of the data directories, so **no `From <Browser>` entry appears at all** - Chrome,
  Edge and Brave would appear only if installed on the workspace (`linuxRoot` `google-chrome`,
  `microsoft-edge`, `BraveSoftware/Brave-Browser`). Arc, Comet and Helium have **no `linuxRoot`**
  and Safari is `process.platform !== 'darwin'` → `null`
  (`browser-cookie-import.ts:149-202, 204-228, 350-380`), so those four can never appear on a Linux
  host - correctly, not as a defect. On the local branch the list is `[]` unconditionally.
- **`From File…` has no wire on either branch.** Desktop routes it through
  `browser:session:importCookies` → `pickCookieFile(parent)` →
  `dialog.showOpenDialog` (`ipc/browser-session-profile-ipc.ts:60-87`,
  `browser-cookie-import.ts:772-789`). That is the same native-dialog class already fixed for the
  directory picker in `patches/floating-workspace-picker.diff`. Two things make it worse than that
  case: there is no `BrowserWindow` on the host to parent it, and `DISPLAY=:99` is a real X server,
  so a dialog would open on a screen nobody can see and never return. Upstream already refuses it
  over the wire in the store rather than trying - "Manual cookie file import is unavailable while a
  remote runtime is active." So the runtime branch answers honestly and the local branch answers
  "Cookie import is unavailable in the web client." Neither can import a file.
- **The setting is not cosmetic.** The imported jar is an Electron session partition
  (`persist:orca-browser` for the default profile, measured) and `offscreen-browser-backend.ts:33`
  resolves the profile for the headless backend - the one the tile's browser panes stream from. A
  cookie imported here configures the host's own browser.

### Path D - the Browser Use setup card (`BrowserUseSetup`, rendered first at `BrowserPane.tsx:210`)

- **Step 1, Enable Orca CLI - already wired.** Upstream's `createCliApi()` is a hardcoded
  `supported:false` stub, but `patches/cli-registration.diff` (in the series, shipped in v4.190.1)
  routes `getInstallStatus` / `install` / `remove` onto the overlay family
  `src/main/runtime/rpc/methods/cli.ts` (`cli.getInstallStatus`, `cli.install`, `cli.remove`). Its
  own header names Browser Use as one of the cards it fixes.
- **Step 2, install the skill - runs on the server.** The command is built for the host's platform
  and the terminal runs there, per `patches/execution-owner.diff`
  (`CliSkillRuntimeSetup.tsx` hunk). Not re-verified live this pass.
- **Step 3, import cookies - Path C.** The card's `onConfigureMoreBrowsers` scrolls to
  `#browser-session-cookies` in the same pane, so it inherits everything above.
- **`BrowserUseComputerUseNotice` / `onOpenComputerUse`** jumps to the `computer-use` section,
  which is itself listed-and-blank behind gate 2. Both are repaired by the same edit.

## Verdict

**Works partially - name what is missing.**

Opening gate 2 makes the pane render, and most of it works immediately: the Browser Use card
(steps 1-2), Home Page, Search Engine, Kagi link and Default Zoom all reach the host; the four
link-routing / label rows work per-browser, which is the correct scope for them.

Three things are still missing after gate 2:

1. **The Session & Cookies section defaults to a host that does not exist.** `local` on
   orca-server routes to seven dead preload stubs. The operator has to notice the Host selector and
   pick the server by hand to get a section that works. This is the same defect
   `patches/execution-owner.diff` fixed for the floating workspace, at a resolver that patch did
   not reach.
2. **`From File…` needs a wire built.** No runtime method exists for it and no browser-side file
   input replaces the native dialog.
3. **Nothing else.** The absence of Chrome/Edge/Arc/Comet/Safari entries is the correct answer for
   a host with no browsers installed, not a defect to fix. Arc, Comet, Helium and Safari can never
   appear on a Linux host by upstream's own table, and saying so in the pane would be honest, not
   a removal.

## Size of the work

**Gate 2 - `patches/settings-nav-web-parity.diff`, which already owns `Settings.tsx`.** The
uncommitted working-tree copy of that patch already carries the hunk (drops the
`showDesktopOnlySettings ?` wrapper around `Settings.tsx:1571-1589`). Nothing more is needed for
the pane to render. Must not overlap `patches/pairing-credentials.diff`'s hunk at `:1741-1747`.

**The execution-host default - extends `patches/execution-owner.diff`,** which already owns
`src/renderer/src/store/slices/browser.ts` and already imports the helper. Two narrow sites:

- `getBrowserSettingsHostId` (`store/slices/browser.ts:271-275`) - fall through to
  `getWebClientLocalFallbackEnvironmentId(state)` before `LOCAL_EXECUTION_HOST_ID`, exactly as that
  patch already does at `browser.ts:730` for `createBrowserTab` and in
  `worktree-runtime-owner.ts`.
- `BrowserPane.tsx:153` `settingsFocusedHostId`, which feeds
  `resolveAvailableBrowserSessionHostId` and must agree.

The helper is ours and already exists:
`src/renderer/src/lib/floating-workspace-runtime-owner.ts` -
`getWebClientLocalFallbackEnvironmentId` (alias of `getFloatingWorkspaceRuntimeEnvironmentId`),
whose own comment states the rule: a browser saves exactly one environment, so an unset preference
means that server, not "local". Do **not** change `getSettingsFocusedExecutionHostId` itself - it
has ~10 renderer callers (sidebar worktree grouping, `TaskPage`, `WorktreeJumpPalette`,
`visible-worktrees`), and moving it would re-scope the whole sidebar.

**`From File…` - a new runtime method plus a client-side file read.** Follow
`patches/cli-registration.diff`'s shape: the family body in a new overlay file
`src/main/runtime/rpc/methods/browser-session-import.ts`, registered by a one-line hunk in
`rpc/methods/index.ts` (`ALL_RPC_METHODS`). The host half already exists -
`importCookiesFromFile(filePath, partition)` (`browser-cookie-import.ts:791`) - so the method
either takes a host path or takes the parsed JSON content directly.

Which of the two matters. The desktop dialog picks a file on the machine the operator is sitting
at; in the tile that machine is the browser, not the server. So the primary form is an upload: an
`<input type="file">` in `BrowserProfileRow`, `FileReader` → text, and
`browser.profileImportCookieContent({profileId, content})` on the host, refactoring
`importCookiesFromFile` to split "read the file" from "parse and import". A host-path variant using
the existing `RemoteFileBrowser` - the route `patches/floating-workspace-picker.diff` took - is the
secondary case for a file already on the server, and can reuse the same method with a path
parameter. Neither goes on `MOBILE_RPC_METHOD_ALLOWLIST`: it writes a cookie jar the host's browser
then authenticates with.

The native `pickCookieFile` path stays desktop-only and untouched, as
`floating-workspace-picker.diff` left `dialog.showOpenDialog`.

**Tests.** Gate 2 needs a case in the nav/render pairing test that shared infrastructure owns (see
`00-sections.md` shared dependency 2). The host default needs a red-without-patch case asserting
`getBrowserSettingsHostId` resolves to the saved environment under `isWebClientLocation()`, beside
`floating-workspace-runtime-owner.test.ts`. The import method needs the family-registration test
and one over the seam, following `cli.test.ts` / `web-cli-registration.test.ts`.

## Blocks this shares with other sections

From `00-sections.md`'s shared-dependency list:

- **(1) `Settings.tsx:343` and its 11 JSX gates.** The same hunk region as `computer-use`,
  `mobile`, `orca-account`, `ssh`, `plugins`, `mobile-emulator`, `voice`, `notifications`,
  `advanced`, `developer-permissions`, `dev`. One patch owns the file. Fixing `browser`'s gate
  fixes nothing else on its own, but eleven agents editing eleven `? :` blocks is eleven
  conflicting hunks.
- **(2) The nav/render pairing test.** Shared infrastructure, not per-section work.
- **(3) `syncRuntimeBackedSettings` / `SettingsUpdate`.** Shared with `notifications`, `advanced`,
  `appearance`, `input`. **Browser needs no widening of either** - four of its keys travel on
  `ui.set`, and the other five are renderer-only by design. **Correction other agents need:
  `ui.set` is a second, non-allowlisted settings path to the host** (`UiUpdateFields`,
  `client-ui-schemas.ts:181-295`); a pane whose rows write through the `ui` store slice is not
  stranded in localStorage. `appearance` and `input` both have rows on that slice.
- **(4) `.strict()` on `SettingsUpdate`.** Not touched by this section.
- **(5) `createFallbackProxy`.** Not the mechanism here - `createBrowserApi` spells out real
  stubs, so `browser.session*` returns a *deliberate* empty answer, not a fallback one. Same
  observable shape, different cause.
- **(7) `patches/settings-nav-web-parity.diff` owns `Settings.tsx`.**

Blocks found this pass:

- **`getWebClientLocalFallbackEnvironmentId`** (`src/renderer/src/lib/floating-workspace-runtime-owner.ts`,
  ours, `patches/execution-owner.diff`). The generic answer to "the web client resolved its
  execution owner to `local`". Every section with a host axis reaches for it:
  `mobile-emulator` (its pane already calls `callRuntimeRpc` directly and so has the answer
  hard-wired), `terminal` (Warp theme import reads the *host's* config), `accounts` (phase 0's
  "Account scope: Local Mac" on a Linux host is the same class), `ssh`.
- **The native-picker family.** `shell.pickAudio`, `shell.pickDirectory`, `shell.pickImage`,
  `shell.pickAttachment`, `shell.pickRepoIconImage` are all `Promise.resolve(null)` in the web
  preload (`web-preload-api.ts:3320-3324`), and `pickCookieFile` is the sixth member reached
  through a different door. `patches/floating-workspace-picker.diff` solved one; `notifications`
  needs `pickAudio` and is blocked on the same decision this section faces - host file browser
  versus browser upload. Deciding it once is worth more than deciding it twice.
- **`browser-core.ts` / RuntimeBrowserCommandsFactory.** `orca-account`'s sign-in design
  (`N3-orca-account-sign-in.md`) needs `browser.tabCreate` / `browser.goto` from the same method
  table and the same port. A tab it opens runs in a session profile this pane configures, so the
  two are coupled in behaviour, not only in file: an Orca Account sign-in would inherit whatever
  cookies were imported here.
- **`cli.*` (`patches/cli-registration.diff`).** Step 1 of the Browser Use card is the same
  component as the setup cards in `orchestration`, `computer-use`, `linear` and `mobile-emulator`.
  Already fixed; listed so nobody re-derives it.
- **`computer-use`.** Reached from this pane by `onOpenComputerUse`. Opening gate 2 for `browser`
  without also opening it for `computer-use` leaves a button in the Browser pane that navigates to
  a blank one.

Nothing found in this section would break another.

## Unverified

- **The pane's rendering once gate 2 opens.** Nothing was assembled and no gate was run this pass -
  no `quilt push`, no `mise run up`, no `vitest`, no build. "The data path answers" is not "the
  pane draws". Probe that settles it: apply the working-tree
  `patches/settings-nav-web-parity.diff`, build, open Settings > Browser in the tile, read
  `[data-settings-section]`.
- **Whether the Host selector actually renders two entries in the tile.** Reasoned from
  `runtimeEnvironments.list()` returning one environment and `buildExecutionHostRegistry` always
  emitting `local`; not observed, because the pane cannot be reached. Probe: after gate 2, read the
  Host `<Select>` options in Settings > Browser.
- **Whether selecting the server host makes Session & Cookies work.** The six RPCs answer on the
  host (`browser.profileList` measured), and the store's runtime branch calls them - but the branch
  was never exercised from a renderer this pass. Probe: after gate 2, pick the server in the Host
  selector and confirm the default profile row appears with `partition: persist:orca-browser`.
- **`browser.profileDetectBrowsers` over the wire.** Not probed - the CLI exposes no verb for it.
  Its answer is inferred from the filesystem measurement (`~/.config` has no browser directory) plus
  `detectInstalledBrowsers()`'s source. Probe: install `google-chrome` on the workspace and re-run,
  or call the method directly over a runtime RPC.
- **`browserDefaultUrl` / `browserDefaultSearchEngine` reaching the host.** Established by reading
  the chain and by finding the two *sibling* keys already persisted host-side. No write was
  attempted - this pass mutated nothing. Probe: set a home page in the tile and re-read
  `~/.config/orca/profiles/local-default/orca-data.json`.
- **Whether `browserDefaultZoomLevel` / `browserKagiSessionLink` got into the host store via a web
  client's `ui.set` or by some host-side default.** Only their presence was read; provenance was
  not established. It does not change the conclusion, which rests on the source chain.
- **Step 2 of the Browser Use card.** Taken from `patches/execution-owner.diff`'s header, not
  re-verified.
- **`importCookiesFromFile`'s parse half.** Read only far enough to confirm it takes a path and
  reads JSON; the accepted cookie-file formats were not enumerated, and that decides what an upload
  form should accept.
- **The Kagi session link is a credential travelling on `ui.set` and landing unsealed in the host's
  `ui` state.** Observed as a key name; whether that differs from desktop, and whether SecretStore
  should own it, was not investigated and is out of this section's scope.
- **No browser automation was used.** Per the brief, everything above is source reading plus
  read-only `coder ssh` probes. The serve process on 6799 was not restarted, reconfigured or
  disturbed; no file on the host was written.
