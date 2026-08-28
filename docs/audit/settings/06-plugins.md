# plugins - what it needs to work in the browser

## State today

**Tile, v4.190.1:** the row is listed and the pane is blank. Zero
`[data-settings-section]` nodes - `00-sections.md` measured it.

Behind the blank pane, the live host is in a state the render gate hides. Read over
`coder ssh` from `~/.config/orca/profiles/local-default/orca-data.json`:

```text
pluginSystemEnabled: false, disabledPlugins: [], pluginConsents: {}, devPluginPaths: []
```

`~/.config/orca/plugins/` does not exist. Nothing is installed. Three plugins ship
**inside the AppImage** and are waiting on that flag -
`squashfs-root/resources/plugins/launch/` holds `stablyai.orca-multipass-recipes`,
`stablyai.orca-navigation-shortcuts`, `stablyai.orca-portuguese`, plus
`orca-marketplace.json`. `PluginBundledBootstrapCoordinator` publishes them into the user
plugins dir when the host flag turns true (`main/index.ts:2891` `isEnabled`, called at
`:2963` on startup and at `:2914` on the flag flipping true).

**Desktop, same host, same store:** identical - the switch is off, so `PluginSettingsOverview`
draws the "Turn on the plugin system…" dashed box (`PluginSettingsOverview.tsx:89-97`) and
nothing else. The desktop's advantage is not that it shows more; it is that its switch works.
Flipping it there writes the host store, `store.onSettingsChanged` fires
(`ipc/plugins.ts:102-110` and `main/index.ts:2912-2916`), the three bundled plugins publish, and
the pane fills.

**What the tile would show with gate 2 opened and nothing else changed:** the same dashed box.
`settings.pluginSystemEnabled` in the web client is `false` from `shared/constants.ts:319` and
is **not** a runtime-seeded key - `RUNTIME_SEEDED_SETTING_SCHEMA`
(`src/shared/runtime-seeded-settings.ts`, our overlay) lists appearance, experimental and
Open-In keys only. So the tile ignores the host's value on first visit and always starts off.

The list effect is guarded on that flag (`PluginsSettingsSection.tsx:121`
`if (!mounted || !settings.pluginSystemEnabled) return`), so `plugins.list()` - the one member
that is fully wired - is never called.

## Which gate, and why

**Gate 2 first, then a settings write path, then the write half of the namespace.** Three, in
that order; opening any one alone changes nothing an operator can see.

1. **Gate 2 - `Settings.tsx:343` `showDesktopOnlySettings`**, consumed at `Settings.tsx:1855`
   pristine / `:1858` shipped:
   `{showDesktopOnlySettings ? (<PluginsSettingsSection … />) : null}`.
   This is the whole reason the pane is blank. Gate 1
   (`useSettingsNavigationMetadata.ts:148`, rewritten by `settings-nav-web-parity.diff`) listed
   the row; gate 2 was never touched, so nothing mounts and the `Settings.tsx:1098` fallback
   does not fire.
2. **The `pluginSystemEnabled` write path.** Not one of the four numbered gates - a fifth
   barrier specific to this pane. See shared dependency 3 below: the key reaches neither
   `syncRuntimeBackedSettings` nor `SettingsUpdate`, so the tile's switch flips a localStorage
   boolean and the host never learns.
3. **The 15 unrouted members** of `PluginsApi`. Gate 4 (`isWebClientLocation()`) does **not**
   apply - no plugin settings file calls it. The partial behaviour here comes from
   `createFallbackProxy`, not from a pane-internal client check.

Gate 3 (`SettingsSidebar.tsx:190-192`) does not apply.

## What the pane actually needs

`PluginsApi` (`src/preload/api/plugin-host-api.ts:143-190`) has exactly 21 members.
`patches/plugins-web-bridge.diff` routes 6. The other 15 resolve through
`createFallbackProxy` (`web-preload-api.ts:4549`), whose answer is decided by the member's
name in `getFallbackResult` (`:4570-4592`) - established by reading that function, not by
grepping a method list.

| member | runtime method | what the tile gets today | how established |
| --- | --- | --- | --- |
| `list` | `plugins.list` (`rpc/methods/plugins.ts:80`) | real | patch body; `PLUGIN_METHODS` read at v1.4.190 |
| `consent` | `plugins.consent` (`:85`) | real | same |
| `setEnabled` | `plugins.setEnabled` (`:99`) | real | same |
| `panelAction` | `plugins.panelAction` (`:113`) | real | same |
| `readPanelEntry` | `plugins.readPanelEntry` (`:131`) | real | same |
| `invokeCommand` | `plugins.invokeCommand` (`:147`) | real | same |
| `install` | **absent** | `Promise.resolve(undefined)` | `getFallbackResult` default branch; probed live per `00-sections.md` |
| `refresh` | **absent** | `Promise.resolve(undefined)` | same; probed live |
| `remove` | **absent** | `Promise.resolve(undefined)` | `getFallbackResult` default branch |
| `getLogs` | **absent** | `Promise.resolve(undefined)` - `get*` but not `get*Status`, so it misses the `[]` branch at `:4584` | read `getFallbackResult` |
| `listLanguagePacks` | **absent** | `Promise.resolve([])` (`list*` branch, `:4578`) | same |
| `listMarketplaces` | **absent** | `Promise.resolve([])` | same |
| `listMarketplacePlugins` | **absent** | `Promise.resolve([])` | same |
| `addMarketplace` | **absent** | `undefined` | same |
| `removeMarketplace` | **absent** | `undefined` | same |
| `refreshMarketplaces` | **absent** | `undefined` | same |
| `previewMarketplacePlugin` | **absent** | `{found:false,diff:{},unsupportedKeys:[]}` - the settings-diff shape, wrong type entirely (`:4581`) | same |
| `previewMarketplaceUpdate` | **absent** | same wrong shape | same |
| `installMarketplacePlugin` | **absent** | `undefined` | same |
| `rollbackMarketplacePlugin` | **absent** | `undefined` | same |
| `onChanged` | **absent** | `noopUnsubscribe` (`:4572`) - synchronous, which is what the pane needs | same |

**What each fallback does to the pane** - traced through the call sites, correcting the
"Install throws" shorthand in `plugins-web-bridge.diff`'s header:

- `install` (`PluginsSettingsSection.tsx:187-188`) - `result.ok` on `undefined` throws a
  `TypeError`, but `PluginInstallDialog.tsx:70-74` catches it and runs it through
  `pluginInstallErrorMessage`, whose default branch renders *"Plugin installation failed. Check
  the source and try again."* Not a crash: a **wrong error message** blaming the operator's
  input for a missing wire.
- `refresh` (`:169, 194, 277, 285`) - `loadPluginList` awaits `undefined`, `applyPluginList`
  throws on `nextPlugins.map`, and its own `try/catch` (`:81-85`) turns that into the banner
  *"Could not load plugins."* The Refresh button always fails.
- `remove` (`:256`) - identical path through `remove`'s catch: the same banner, plugin still
  installed.
- `getLogs` - `use-plugin-logs.ts:59-68` resolves with `lines: undefined`; no throw, the log
  drawer opens empty.
- marketplace `list*` - `PluginMarketplaceBrowser.tsx:62-63` gets `[]` from both, sets no error.
  The marketplace tab renders as an empty catalogue that looks correct and is not.

**Ports and building blocks** (`00-building-blocks.md` names):

- **Modules split out of `src/main/ipc/*` to keep the runtime graph Electron-free** - the seam
  this whole capability rides on. `src/main/plugins/plugin-client-list.ts` (17 lines) is the
  one already taken; it exists so `plugins.list` reaches the projection without `ipcMain`. The
  write half needs the same move applied to `install` / `remove` / `refresh` / `getLogs` and to
  the nine marketplace handlers.
- `PluginService` is composed and installed for RPC in the shared `app.whenReady()` path -
  `setPluginServiceForRpc(pluginService, {applyConsent, applyEnablement})` at
  `main/index.ts:2926`, with `pluginService.initialize()` at `:2934`. `orca serve` runs that
  path; the wired six answer today.
- **No new host port and no new dependency.** Install takes a typed string, not a native file
  dialog: `plugin-install-source.ts` parses either a host filesystem path or a
  `<git-url>#<ref>`, and `installPluginFromLocalPath` / `installPluginFromGit`
  (`ipc/plugins.ts:191-203`) run entirely on the host. Nothing in the write half is
  desktop-bound. It is unrouted because upstream only ever needed `ipcMain`.
- `onChanged` push would need the RPC streaming seam (`web-preload-api.ts:1311`
  `.subscribe('nativeChat.subscribe', …)` is the working precedent); today
  `main/index.ts:2950-2962` fans the event out over `BrowserWindow.getAllWindows()`, which is
  empty headless. Optional - the pane already re-lists after every mutation.

**The settings half** - measured, not inferred:

- `pluginSystemEnabled` and `devPluginPaths` are **absent from `SettingsUpdate`**
  (`rpc/methods/client-ui-schemas.ts:128-165`, `.strict()`) - read the whole object.
- Both are **absent from `syncRuntimeBackedSettings`** (`web-preload-api.ts:3960-3988`), which
  forwards six keys.
- So `updateSettings({pluginSystemEnabled: true})` from the tile writes localStorage, finds
  `runtimeUpdates` empty, returns without an RPC, and does not throw. The switch appears to
  work. The host is untouched, `PluginService.activationState` still fails closed at
  `plugin-service.ts:207`, and every plugin the host does discover reports `disabled`.
- No CLI route either: `orca-ide --help` on the live host has no `plugins`, `settings` or
  `config` command (grepped the full help). The only host-side route is hand-editing
  `orca-data.json` and restarting.

## Verdict

**Needs a wire built first** - two of them, and the smaller one is not the obvious one.

A pane that lists and toggles plugins but cannot install them **is worth having**, but only
after `pluginSystemEnabled` reaches the host. Without that write, the read half is worth
nothing at all: the pane cannot get past its own feature switch, so the six wired methods are
never called. With that write and gate 2 alone - no `install`, no marketplace - an operator on
this deployment gets a real pane on the first click: three bundled plugins publish, `list`
shows them, `consent` reviews the capabilities, `setEnabled` runs them, `invokeCommand` and
`readPanelEntry`/`panelAction` make their commands and panels work in the tile. That is a
working capability, not a listing.

So the answer to "does partially working beat hidden" is **yes here, and the reason is
specific**: the read half is already complete and already routes through `PluginService`'s
single permission chokepoint, so a consent decision made in the tile is the same decision the
desktop makes. The three degradations that remain - Install's misleading error, Refresh's
banner, the empty marketplace catalogue - are honest-able in the pane, and `remove` failing is
recoverable. None of them is a wrong permission decision.

Unlisting the section does not make any of this true; it only stops anyone finding out.

## Size of the work

Three independent pieces. The first two are what earns the section back.

**1. Gate 2 (one line).** `Settings.tsx:1855` pristine / `:1858` shipped - drop
`showDesktopOnlySettings ?` from the `PluginsSettingsSection` block.
Owner: **`patches/settings-nav-web-parity.diff`**, which must claim `Settings.tsx` and is
already the only patch allowed to (shared dependency 1). It must land in the same patch as the
gate-1 entry it already carries, or the two disagree again.

**2. `pluginSystemEnabled` and `devPluginPaths` to the host.** *Not* by widening
`SettingsUpdate`: that schema is on `MOBILE_RPC_METHOD_ALLOWLIST`, so adding the plugin-system
master switch there would make "run third-party code on the host" phone-reachable - which
contradicts AGENTS.md's allowlist invariant and `plugins-web-bridge.diff`'s own negative test.
The precedent is `web-share-surfaces.diff`: a separate runtime-scope-only method
(`settings.updateSharingCapabilities`) carrying keys deliberately kept off `SettingsUpdate`.
Mirror it - a `plugins.setSystemEnabled` / `plugins.setDevPaths` pair on `PLUGIN_METHODS`, off
the mobile allowlist, writing through `store.updateSettings` so `ipc/plugins.ts:102-110`
refreshes the service. Then seed the tile's initial value: either read it back on
`plugins.list` or add the key to `RUNTIME_SEEDED_SETTING_SCHEMA` (our overlay file,
`src/shared/runtime-seeded-settings.ts` - seed-once, which matches "defaults, not policy").
Files: `lib/orca/src/main/runtime/rpc/methods/plugins.ts` (patch),
`lib/orca/src/renderer/src/web/web-preload-api.ts` (patch),
`lib/orca/src/renderer/src/components/settings/PluginsSettingsSection.tsx` (patch - `toggleFeature`
and `updateDevPaths` must call the new method, not `updateSettings`),
`src/shared/runtime-seeded-settings.ts` (overlay, if seeded).
Owner: **extends `patches/plugins-web-bridge.diff`** - it already owns `web-preload-api.ts`'s
`createPluginsApi` and `mobile-rpc-allowlist.test.ts`, and neither `rpc/methods/plugins.ts` nor
`ipc/plugins.ts` is claimed by any other patch in the series (checked all 15 `Index:` sets;
`pairing-credentials.diff` mentions `plugin-client-list.ts` in prose only).

**3. The write half of the namespace.** For each, lift the `ipcMain` handler body into a module
under `src/main/plugins/` and have both the handler and a new `defineMethod` import it - the
documented **Modules split out of `src/main/ipc/*`** move, so it merges rather than conflicts.
The `ipcMain` handlers needing a runtime method, by name:

- `ipc/plugins.ts` - `plugins:install` (`:182`), `plugins:remove` (`:210`),
  `plugins:refresh` (`:246`), `plugins:getLogs` (`:239`), `plugins:listLanguagePacks` (`:115`)
- `ipc/plugin-marketplaces.ts` - `plugins:listMarketplaces` (`:35`), `addMarketplace` (`:36`),
  `removeMarketplace` (`:40`), `refreshMarketplaces` (`:45`), `listMarketplacePlugins` (`:51`),
  `previewMarketplacePlugin` (`:52`), `installMarketplacePlugin` (`:56`),
  `previewMarketplaceUpdate` (`:63`), `rollbackMarketplacePlugin` (`:67`)

Nine of the fourteen ignore `event` entirely and lift unchanged. Only `plugins:remove` reads
`event.sender.id` (as `originWebContentsId` for `store.updateSettings`); it takes the same
injected-closure treatment `applyConsent`/`applyEnablement` already got at
`rpc/methods/plugins.ts:25-38`. Every new method extends `PLUGIN_RPC_METHODS` in
`mobile-rpc-allowlist.test.ts`'s negative case in the same hunk - the invariant is that a
phone must never install host code.

Splittable: (1)+(2) is the shippable increment; (3) can follow, and even (3) splits - `install`

- `refresh` + `remove` (five handlers) before the nine marketplace ones.

## Blocks this shares with other sections

From `00-sections.md`'s shared-dependency list:

1. **`Settings.tsx:343` and its 11 JSX gates** (dep 1) - shared with `computer-use` (`:1317`),
   `orca-account` (`:1350`), `mobile` (`:1417`), `browser` (`:1571`), `mobile-emulator`
   (`:1591`), `notifications` (`:1669`), `ssh` (`:1751`), `developer-permissions` (`:1767`),
   `advanced` (`:1803`), `dev` (`:1819`). One patch owns this file; eleven agents each editing
   their own `? :` is eleven conflicting hunks.
2. **The gate-1/gate-2 pairing test** (dep 2) - `settings-nav-render-parity.test.ts` already
   exists in the working tree's `settings-nav-web-parity.diff`. Shared infrastructure; plugins
   needs it, does not own it.
3. **`syncRuntimeBackedSettings` / `SettingsUpdate` `.strict()`** (deps 3 and 4) - shared with
   `browser` (`browserDefaultUrl` etc.), `notifications`, `advanced` (`httpProxyUrl`),
   `appearance`, `input`. **Plugins is the section that must NOT be fixed by widening either
   one** - `SettingsUpdate` is mobile-reachable, and the plugin-system switch is host code
   execution. Anyone proposing a general "widen the allowlist" fix breaks this pane's security
   posture; the `settings.updateSharingCapabilities` shape from `web-share-surfaces.diff` is
   the pattern that scales here.
4. **`withFallback` / `createFallbackProxy` / `getFallbackResult`** (dep 5) - shared with every
   section. Plugins is its clearest case: 15 of 21 members, four distinct fallback shapes, one
   of them (`preview*` → `{found:false,diff:{},unsupportedKeys:[]}`) the wrong type for the
   caller. Any change to `getFallbackResult`'s branches moves this pane.
5. **Modules split out of `src/main/ipc/*`** (`00-building-blocks.md`) - shared with **`ssh`**,
   whose fix is the same move on `ssh-target-registry.ts`. The two sections should be authored
   with one shared understanding of the seam; if either invents a different way to lift an
   `ipcMain` handler onto the runtime, the series carries two idioms for one problem.

Found here, not in the list:

6. **`plugins.listLanguagePacks` → `appearance`.** `store/plugin-language-packs.ts:23-30` feeds
   `AppearanceInterfaceSection.tsx` and `i18n/I18nProvider.tsx`. It resolves `[]` in the tile,
   so a plugin-contributed UI language silently never appears in Appearance > Language. Routing
   that one member fixes a defect in a section listed as "renders partially" for an unrelated
   reason. `stablyai.orca-portuguese`, one of the three bundled plugins on this host, is
   exactly such a pack.
7. **`plugins.readPanelEntry` / `panelAction` / `invokeCommand` → the right sidebar and Cmd+J.**
   `right-sidebar/PluginPanel.tsx` and `cmd-j/plugin-quick-actions.ts` consume the same three
   already-wired methods. They are outside Settings, so no audit section covers them, but they
   are dead in the tile for the same reason the pane is: `pluginSystemEnabled` is false and no
   plugin is ever discovered. Fixing piece (2) turns on plugin panels and plugin quick commands
   in the browser as a side effect - the largest single capability win in this report.
8. **`mobile` (the RPC allowlist axis).** Adding any write method to `PLUGIN_METHODS` touches
   `mobile-rpc-allowlist.test.ts`, which `pairing-credentials.diff` and
   `plugins-web-bridge.diff` both already patch. A third patch adding hunks there needs the
   line ranges checked.

## Unverified

- **The pane's rendered output with gate 2 open.** Nothing was built; `quilt push`,
  `mise run up` and `vitest` were not run, per the read-only brief. Everything above about
  what draws is traced through source from a measured store state, not observed. The exact
  probe: pop gate 2 for this one block, `mise run up`, boot the AppImage, open Settings >
  Plugins in the tile, and read `[data-settings-section="plugins"]`.
- **`plugins.list()` over the wire on this host.** `00-sections.md` records it as one of its
  live read probes but not its result; not re-run here, because the host store shows nothing
  installed, so `[]` is the only value it could hold. The probe that would matter is
  `plugins.list()` *after* the host flag is true and bundled bootstrap has published - a write
  to the host store, which this pass did not make.
- **Whether bundled bootstrap succeeds on this host.** `resources/plugins/launch/` was listed
  and holds the three manifests; `PluginBundledBootstrapCoordinator.request()` has never run
  here (the flag has always been false, and `~/.config/orca/plugins/` does not exist). That it
  would publish all three is read from `main/index.ts:2883-2894`, not observed. Probe: set
  `pluginSystemEnabled: true` in `~/.config/orca/profiles/local-default/orca-data.json`,
  restart the server, and `ls ~/.config/orca/plugins/`.
- **The `toggleFeature` race.** After the switch flips, `toggleFeature` awaits
  `loadPluginList(plugins.refresh())` (which errors) while the `:121` effect independently
  fires `plugins.list()` (which succeeds). Both bump `listRequestRef`; which one wins the
  banner is not determined from reading. Only relevant if the pane ships before piece (2).
- **Whether `plugins.list` answers while the HOST flag is false.** `PluginService.initialize()`
  discovers manifests regardless, and `activationState` returns `'disabled'` for each
  (`plugin-service.ts:204-213`). Whether `buildPluginList` still emits rows for discovered-but-
  disabled plugins was not traced through `plugin-list-projection.ts` in full. Moot on this
  host - nothing is on disk to discover.
- **The four-gate classification for `dev` and `linear`** was taken from `00-sections.md`, not
  re-derived.
- **No browser was used**, per the brief. No writes were made to the live host: reads only over
  `coder ssh` (`ls`, `cat`, `--help`). The server on 6799 was not restarted or reconfigured.
