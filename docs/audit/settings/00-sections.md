# Settings sections in the web tile

Phase 0 of the settings audit. Shared vocabulary for the per-section agents. Extends
`docs/audit/v1.4.190/00-building-blocks.md` and `99-cross-cutting.md`; block names are used verbatim
from there.

Paths are relative to `lib/orca/`. Line numbers are `git -C lib/orca show v1.4.190:<path>` — pristine
upstream. Two shipped files differ from pristine:

- `useSettingsNavigationMetadata.ts` — rewritten by `patches/settings-nav-web-parity.diff`; cite the
  patch, not a line number.
- `Settings.tsx` — `patches/pairing-credentials.diff` adds 3 lines at `:1744`, so every shipped
  line after that is pristine + 3.

**Published state audited: `v4.190.1`** (repo tag `v4.190.1` = commit `1555391`; upstream pin
`v1.4.190`). Measured live on the operator's Coder workspace `ceo/pink-planarian-96`, `VERSION` file
`4.190.1`, host platform Linux.

Branch `mrkhachaturov/fix-settings-nav-blank-panes` and PR #45 are **not** in this measurement.

## The two gates

Two independent copies of the same expression, in two files, read by two different consumers. They
were kept in step by accident until `v4.190.1` moved one of them.

| | gate 1 — the NAV LIST | gate 2 — the RENDER BLOCKS |
| --- | --- | --- |
| file | `src/renderer/src/hooks/useSettingsNavigationMetadata.ts` | `src/renderer/src/components/settings/Settings.tsx` |
| the line | `const showDesktopOnlySettings = !isWebClient` (`:148` pristine) | `const showDesktopOnlySettings = !isWebClient` (`:343`) |
| decides | which rows the sidebar and the Cmd+J palette offer, and which search entries exist | whether a `<SettingsSection>` is in the React tree at all |
| consumed by | `SettingsSidebar`, `visibleNavSections` (`Settings.tsx:831`), `visibleSectionIds` (`:846`) | the JSX at `:1317, 1350, 1417, 1571, 1591, 1669, 1751, 1767, 1803, 1819, 1855` |
| changed at v4.190.1 | yes — `patches/settings-nav-web-parity.diff` | **no — the patch carries no `Index:` line for this file** |

**How they interact.** `SettingsSection` returns `null` unless it is the active section
(`SettingsSection.tsx:55-62`), so the content column holds exactly one section at a time. Selecting a
nav row sets `activeSectionId` (`Settings.tsx:1130`); the section with that `id` renders. Nothing
renders a placeholder for an id with no section.

The safety net that used to hide the mismatch is `Settings.tsx:1098`:

```text
if (!visibleSectionIds.has(activeSectionId) && visibleNavSections.length > 0) {
  setActiveSectionId(getFallbackVisibleSection(visibleNavSections)?.id ?? activeSectionId)
}
```

`visibleSectionIds` is built from **gate 1**. While both gates agreed, a section absent from gate 2
was also absent from gate 1, so it could never be selected. Opening gate 1 alone makes the id
selectable, the fallback does not fire, and the content column renders **nothing at all** — no
header, no message, zero `[data-settings-section]` nodes. Measured: the pane area is the sidebar and
nothing else.

`isSectionMounted(id)` (`:1191`, over `deriveNeededSectionIds`) is a lazy-mount optimisation *inside*
a rendered section. It is not a third gate and never produces a blank pane on its own.

### Two more gates, commonly mistaken for these

- **Gate 3 — `SettingsSidebar.tsx:190-192`** — `showSetupGuideTopRow = ready && doneCount < total`.
  `setup-guide` is filtered out of the `setup` group (`:255`) and drawn as its own progress row.
  Onboarding-complete hides it on **both** clients. Live: absent, and that is correct.
- **Gate 4 — pane-internal `isWebClientLocation()`** — a pane that renders can still drop rows. Sites at
  `AccountsPane.tsx:414`, `AppearancePane.tsx:82,85,86,150`, `FloatingWorkspacePane.tsx:40`,
  `TerminalAppearanceSection.tsx:86`, `ArtifactsSettingsPane.tsx:27`,
  `ShareSkillsSettingsPane.tsx:21`. This is the "renders partially" column below.

`linear` is gated on `isLinearConnected` in gate 1 and `linearConnected` in gate 2 — the same axis on
both sides, and not a client axis at all.

## Section table

35 sections. `tile` is measured on the deployed `v4.190.1`, Linux host, by driving the live tile and
reading `[data-settings-section]` after each nav click. `desktop` is read from source.

| id | title | tile @ v4.190.1 | desktop | why — gate, file:line | what the pane needs in the browser |
| --- | --- | --- | --- | --- | --- |
| `agents` | Agents | works | works | ungated both sides | — |
| `accounts` | AI Provider Accounts | renders partially | works | pane-internal, `AccountsPane.tsx:414` — remote-account scope block dropped | decide whether host-owned provider accounts are editable from the tile; `ACCOUNT_METHODS` is registered |
| `orchestration` | Orchestration | works | works | ungated both sides | — |
| `linear` | Linear | not listed — Linear not connected | not listed, same condition | nav `isLinearConnected` (`:210`); render `linearConnected` (`Settings.tsx:1303`) | nothing — same axis on both clients |
| `computer-use` | Computer Use | **listed, blank** | works | nav opened by `settings-nav-web-parity.diff`; render still gated at `Settings.tsx:1317` | render gate only. `COMPUTER_METHODS` registered; `computerUsePermissions` preload is real (`computer.permissionsStatus` / `computer.permissions`). Live: `getStatus()` → `platform: "linux"`, both permissions `unsupported` |
| `voice` | Voice | not listed | works | nav keeps `showDesktopOnlySettings`; render `Settings.tsx:1317` (same block as `computer-use`) | **SpeechServiceFactories** + a `speech` namespace in `web-preload-api.ts`. `SPEECH_METHODS` (8) registered and mobile-allowlisted; the preload has no `speech` key, so every member resolves through `createFallbackProxy`. Design: `docs/audit/v1.4.190/N2-speech-design.md` |
| `orca-account` | Orca Account | **listed, blank** | works | nav opened by the patch; render gated at `Settings.tsx:1350` | render gate, then sign-in. `orcaProfiles.authStatus` is real on web (upstream); `connectCurrent` is refused by `web-share-surfaces.diff` — the PKCE callback lands on the host's own loopback. Design: `docs/audit/v1.4.190/N3-orca-account-sign-in.md`. Needs **SecretStore** for a durable session |
| `setup-guide` | Onboarding checklist | not listed — onboarding complete | same condition | `SettingsSidebar.tsx:190-192` | nothing — not a client axis |
| `general` | General | works | works | ungated both sides | — |
| `integrations` | Integrations | renders; Jira sub-block inert | works | ungated both sides | `jira` namespace in the preload. `JIRA_METHODS` registered; live `window.api.jira.status()` resolves `undefined`. Its outbound half is **MainHttpClient** (`jira/authenticated-request.ts:61`), whose only non-test consumer this is |
| `mobile` | Mobile | **listed, blank** | works | nav opened by the patch; render gated at `Settings.tsx:1417` | render gate only. `patches/pairing-credentials.diff` already wires `mobile.getPairingQR` / `revokeDevice` onto `mobile.createPairingOffer`; that patch's *To test* names this section |
| `automations` | Automations | works | works | ungated both sides | — |
| `artifacts` | Artifacts | renders partially | works | pane-internal, `ArtifactsSettingsPane.tsx:27`; patched by `web-share-surfaces.diff` | — (the grant travels on `settings.updateSharingCapabilities`, not `settings.update`) |
| `share-skills` | Share Skills | renders partially | works | pane-internal, `ShareSkillsSettingsPane.tsx:21`; patched by `web-share-surfaces.diff` | — |
| `git` | Git & Source Control | works | works | ungated both sides | — |
| `tasks` | Task Sources | works | works | ungated both sides | — |
| `terminal` | Terminal | renders partially | works | pane-internal, `TerminalAppearanceSection.tsx:86` — Warp theme import hidden | Warp import reads the **host's** config; it is on the host axis, not the client axis |
| `quick-commands` | Quick Commands | works | works | ungated both sides | — |
| `browser` | Browser | **listed, blank** | works | nav opened by the patch; render gated at `Settings.tsx:1571` | render gate, then the write path. Its rows are settings keys: `browserDefaultUrl`, `browserDefaultSearchEngine`, `browserDefaultZoomLevel`, `browserKagiSessionLink` are in `SettingsUpdate` (`rpc/methods/client-ui-schemas.ts:128`, `.strict()`) but **not** in the `syncRuntimeBackedSettings` allowlist, so edits stay in this browser's localStorage. `BrowserSessionCookiesSection` needs `browser.session*`, which the web preload stubs to `[]` |
| `mobile-emulator` | Mobile Emulator | not listed — host is Linux | works on a Mac | nav moved to `hostIsMac` (`hostPlatform === 'darwin'`) by the patch; render still `showDesktopOnlySettings` at `Settings.tsx:1591` | on a Mac host it would be listed-and-blank — the two gates now disagree on the axis itself. Pane calls `emulator.availability` via `callRuntimeRpc` directly; `EMULATOR_METHODS` registered |
| `floating-workspace` | Floating Workspace | renders partially | works | pane-internal, `FloatingWorkspacePane.tsx:40` `includeBrowser = !isWebClientLocation()`; nav mirrors it in the description and search entries | — (`patches/floating-workspace-picker.diff` keeps both sites in step) |
| `appearance` | Appearance | renders partially | works | pane-internal, `AppearancePane.tsx:82,85,86,150`; nav mirrors via `showWarpImport` / `showSystemTray` / `showMenuBarIcon` | tray and menu bar are correct as they stand — a browser tab has neither. Warp import is host axis (see `terminal`) |
| `input` | Input & Editing | works | works | ungated both sides | — |
| `notifications` | Notifications | not listed | works | nav keeps `showDesktopOnlySettings`; render `Settings.tsx:1669` | **RuntimeDesktopSurface** — the pane configures native toasts via `showNotification`, inert with no renderer, and the runtime already routes to paired clients. `NotificationSoundSection` also needs `notifications.playSound` + `shell.pickAudio`. None of its keys are in `SettingsUpdate` |
| `shortcuts` | Shortcuts | works | works | ungated both sides | — |
| `stats` | Stats & Usage | works | works | ungated both sides | — |
| `ssh` | SSH Hosts | **listed, blank** | works | nav opened by the patch; render gated at `Settings.tsx:1751` | render gate is not enough. The `ssh` preload is half real: `listTargets` / `listRemovedTargetLabels` / `connect` / `getState` call `SSH_METHODS`; `addTarget` and `updateTarget` **reject**, `removeTarget` and `disconnect` silently resolve, `importConfig` / `listConfigHosts` return empty, `testConnection` is a hardcoded failure. Needs the target-management half over the wire — `src/main/ssh/ssh-target-registry.ts` is the v1.4.190 **Modules split out of `src/main/ipc/*`** seam for it. Live: `listTargets()` → `[]` |
| `servers` | Remote Orca Servers | works | works | ungated both sides; `patches/pairing-credentials.diff` sets `canGeneratePairingUrl` at `Settings.tsx:1744` | — |
| `developer-permissions` | macOS Permissions | not listed — host is Linux | works on a Mac | nav moved to `hostIsMac` by the patch; render still `showDesktopOnlySettings && isMac` at `Settings.tsx:1767` | on a Mac host it would be listed-and-blank. The `developerPermissions` preload is **entirely stubbed** — `getStatus` → `[]`, `request` → `unsupported`, `openSettings` → no-op. There is no RPC family for it; TCC is granted on the host console |
| `privacy` | Privacy & Telemetry | works | works | ungated both sides | — |
| `advanced` | Advanced | not listed | works | nav keeps `showDesktopOnlySettings`; render `Settings.tsx:1803` | `httpProxyUrl`, `httpProxyBypassRules` and `electronHttp1CompatibilityMode` are all absent from `SettingsUpdate`, which is `.strict()` — verified by key search. The proxy value is a **SecretStore** protected secret; the proxy itself is the **Default proxy session resolver** port. Also calls `app.relaunch` |
| `dev` | Dev Tools | not listed — production build | not listed in a production build | nav `showDesktopOnlySettings && import.meta.env.DEV && isDev`; render `showDesktopOnlySettings && import.meta.env.DEV` (`Settings.tsx:1819`) — the two conditions are **not** identical | nothing — dev-build only |
| `experimental` | Experimental | works | works | ungated both sides | — |
| `plugins` | Plugins | **listed, blank** | works | nav opened by the patch; render gated at `Settings.tsx:1855` | render gate is not enough. `patches/plugins-web-bridge.diff` wires six of the pane's members onto `PLUGIN_METHODS`; the pane also calls `install`, `refresh`, `remove` and `onChanged`, for which **no runtime method exists** (`rpc/methods/plugins.ts` has exactly `list`, `consent`, `setEnabled`, `panelAction`, `readPanelEntry`, `invokeCommand`). Those three fall through `withFallback` and resolve `undefined` — measured live, they do not throw; the pane throws when it reads a property off that `undefined`. Needs the write half added to `PLUGIN_METHODS` |
| `repo-<id>` | Project Settings > … | works | works | ungated both sides | — |

## Sections needing work

Six are listed and blank on the deployed artifact. Two more become listed-and-blank the moment the
host is a Mac. Four are hidden and each hides a real gap.

| section | state | smallest correct fix | block it needs |
| --- | --- | --- | --- |
| `computer-use` | listed, blank | gate 2 only | none — `COMPUTER_METHODS` + `computerUsePermissions` preload already reach the host |
| `mobile` | listed, blank | gate 2 only | none — `pairing-credentials.diff` already wired it |
| `browser` | listed, blank | gate 2, then decide where its settings land | `syncRuntimeBackedSettings` allowlist; `browser.session*` preload |
| `orca-account` | listed, blank | gate 2, then sign-in | **SecretStore**; browser-pane RPC (`browser.tabCreate` / `browser.goto`) per `N3-orca-account-sign-in.md` |
| `ssh` | listed, blank | gate 2, then target management over the wire | **Modules split out of `src/main/ipc/*`** — `ssh/ssh-target-registry.ts` |
| `plugins` | listed, blank | gate 2, then the write half | `PLUGIN_METHODS` gains `install` / `refresh` / `remove`; `plugin-client-list.ts` is the existing seam |
| `mobile-emulator` | not listed on Linux; listed-and-blank on a Mac host | move gate 2 onto the same `hostPlatform` axis gate 1 now uses | `EMULATOR_METHODS` (already called directly via `callRuntimeRpc`) |
| `developer-permissions` | not listed on Linux; listed-and-blank on a Mac host | same axis fix, and a real preload or an honest "grant on the host console" pane | no RPC family exists today |
| `voice` | hidden | add a `speech` preload namespace | **SpeechServiceFactories**; `N2-speech-design.md` |
| `notifications` | hidden | decide whether web notifications are a capability at all | **RuntimeDesktopSurface** (inert without a renderer) |
| `advanced` | hidden | widen `SettingsUpdate` or refuse honestly in the pane | **SecretStore**, **Default proxy session resolver** |
| `integrations` (Jira sub-block) | renders, inert | add a `jira` preload namespace | **MainHttpClient** |

## Shared dependencies

Named precisely, because more than one per-section agent will reach for each.

1. **`Settings.tsx:343` `showDesktopOnlySettings` and its 11 JSX gates.** Every listed-and-blank
   section is one of those 11. Eleven agents editing eleven `? :` blocks in one file is eleven
   conflicting hunks in `patches/settings-nav-web-parity.diff`. **One patch owns this file.**
2. **The nav builder.** Gate 1 and gate 2 must be changed as a pair, per section, and no section may
   be opened in one without the other. Whatever enforces that — a test that reads both files — is
   shared infrastructure, not per-section work.
3. **`syncRuntimeBackedSettings` (`web-preload-api.ts:3960`) and `getRuntimeBackedStoredSettings`
   (`:3887`).** The web `settings.set` writes localStorage first (`:699-776`) and forwards only an
   explicit allowlist to the host — upstream's six keys: `worktreeVisibilityDefaults`,
   `experimentalNewWorktreeCardStyle`, `compactWorktreeCards`, `minimaxGroupId`,
   `minimaxUsageModels`, `prBotAuthorOverrides`. `patches/web-share-surfaces.diff` adds
   `artifactSharingEnabled` / `agentSkillSharingEnabled` on a separate
   `settings.updateSharingCapabilities` call, deliberately off `SettingsUpdate`. **Every
   settings-only pane collides here** — Browser, Notifications, Advanced, Appearance, Input. A pane
   whose keys are not on that list renders, accepts edits, and never reaches the host.
   `pickRuntimeSeededSettings` (`runtime-seeded-settings.diff`) applies on first visit only.
4. **`SettingsUpdate` in `rpc/methods/client-ui-schemas.ts:128` is `.strict()`.** Widening the
   allowlist in (3) without widening this schema produces a rejected write, and the method is on
   `MOBILE_RPC_METHOD_ALLOWLIST` — anything added is phone-reachable. Verified absent:
   `httpProxyUrl`, `httpProxyBypassRules`, `electronHttp1CompatibilityMode`, `showMobileButton`.
5. **`withFallback` / `createFallbackProxy` / `getFallbackResult` (`web-preload-api.ts:4534-4594`).** Any key missing from
   the web preload returns a callable Proxy; `getFallbackResult` answers `noopUnsubscribe` for `on*`,
   `Promise.resolve(false)` for `is*`/`has*`, `Promise.resolve([])` for `list*`/`detect*`,
   `Promise.resolve([])` for `get*Status`, and `Promise.resolve(undefined)` for everything else. It
   **never throws**. This is why "the RPC family is registered" and "the namespace exists" are both
   worthless as evidence — measured live for `speech.*`, `jira.status`, `plugins.install`,
   `plugins.refresh`. (This settles the mechanism `99-cross-cutting.md` left unverified.)
6. **The `hostPlatform` axis.** `windowsTerminalCapabilities.hostPlatform`
   (`useSettingsNavigationMetadata.ts:722-742`) is the host's platform; `isMacUserAgent()` /
   `isWindowsUserAgent()` are the renderer's. `mobile-emulator` and `developer-permissions` use the
   host axis in gate 1 and the renderer axis in gate 2 today. Any agent touching either must move
   both.
7. **`patches/settings-nav-web-parity.diff` itself.** It is the only patch that owns
   `useSettingsNavigationMetadata.ts`, and it will own `Settings.tsx` too. `pairing-credentials.diff`
   already carries one `Settings.tsx` hunk (`:1741-1747`); the two must not overlap.

## Unverified

- **Mac host.** `mobile-emulator` and `developer-permissions` were reasoned from source. The only
  live host is Linux, so listed-and-blank on a Mac host is a prediction, not a measurement.
- **Whether each blank section renders correctly once gate 2 opens.** Removing the render gate was
  not attempted — this pass is read-only and did not build. Six panes are *unreachable*, which is
  all that was measured; the RPC probes listed below say the data path answers, not that the pane draws.
- **Live probes were reads only.** `plugins.list`, `computerUsePermissions.getStatus`,
  `ssh.listTargets`, `orcaProfiles.authStatus`, `developerPermissions.getStatus`,
  `speech.listModels`, `speech.getState`, `jira.status`, `plugins.install`, `plugins.refresh`,
  `browser.sessionListProfiles`. No write, no settings mutation, no `settings.update` probe — so the
  `.strict()` rejection of `httpProxyUrl` is read from the schema, not observed.
- **`plugins.install` on a real plugin id.** Probed with a nonexistent id; it resolved `undefined`
  through the fallback proxy, as the source predicts. The pane's own crash on `result.ok` was not
  observed, because the pane cannot be reached.
- **Search.** The Cmd+J palette and the settings search box share gate 1's `searchEntries`. A search
  hit that lands on a blank pane is the same defect through a second door; not exercised.
- **`AccountsPane`'s "Account scope: Local Mac".** Observed live in the Integrations > Jira block on
  a Linux host, driven from a Mac browser — the label reads the renderer's platform. Recorded as
  seen; its gate was not traced, and it is out of scope for this table.
- **Sections counted from `buildSettingsNavigationMetadata`'s array plus `Settings.tsx`'s JSX.** A
  section reachable only by deep link and present in neither would be invisible to this pass.
- **`patches/*.diff` bodies were read for `Index:` lines and the hunks quoted here only.** A symbol
  collision inside a hunk not opened would not appear.
- Nothing was assembled and no gate was run: no `quilt push`, no `mise run up`, no `vitest`, no
  build.

## Live environment

Coder workspace `ceo/pink-planarian-96`, running `orca-server` 4.190.1 (upstream pin 1.4.190) under
`orca serve --trusted-proxy --port 6799`. Reached read-only through a local `coder port-forward` to
loopback; the forward was torn down and the browser tab closed at the end of this pass. The server on
6799 was not restarted, reconfigured or otherwise disturbed, and no settings were written. One web
client session was opened and left as it was found — Settings, `general` section.
