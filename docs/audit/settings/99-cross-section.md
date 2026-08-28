# Cross-section pass — settings in the web tile

Phase 2. Reads `00-sections.md` and the thirteen per-section reports; says only what no single report
could see. A reader has those reports; nothing here restates them.

Paths relative to `lib/orca/` unless they start with `patches/`, `src/` or `docs/`. Line numbers are
`git -C lib/orca show v1.4.190:<path>` (pristine) unless marked *shipped*. Nothing was built, applied
or run in this pass; no browser was started. Facts marked **verified here** were read at the tag in
this pass — the citation follows.

## Verdict table

Thirteen audited sections, then the six phase 0 flagged that no agent was given.

| section | verdict | wires it needs | one-line shape |
| --- | --- | --- | --- |
| `computer-use` | works partially | none for the pane; `computer.capabilities` read for host readiness | gate 2, then a banner nothing currently asks for |
| `mobile` | works partially | `mobileAutoRestoreFitMs` onto `terminal.setAutoRestoreFit` | gate 2, then one key routed to a method that exists |
| `browser` | works partially | execution-host default; a `From File…` method | gate 2, then stop defaulting Session & Cookies to a host that does not exist |
| `orca-account` | works partially once gate 2 opens | `orcaProfiles.signOutCurrent`, then `connectCurrent` + PKCE opener | read half real; write half absent, and sign-out lies |
| `ssh` | needs a wire first | SSH layer installed under `serve`; target management RPC; preload | gate 2 alone makes the pane lie, not blank |
| `plugins` | needs a wire first | `pluginSystemEnabled` to the host; later the write half | the flag, not `install`, is what gates everything |
| `accounts` | needs a wire first | `createAccountsApi` stops being a constant | no gate at all; an explicit stub over a wire that answers |
| `artifacts` | works partially | `orcaProfiles.connectCurrent`; `showArtifactsButton` decision | toggle and publish rail live; sign-in is the only blocking edge |
| `share-skills` | works partially | publish rail RPC; `connectCurrent`; `showSkillsButton` | grant works; nothing downstream of it does |
| `terminal` | works partially | `ptyManagement.*` RPC family; `setupScriptLaunchMode` write path | no gate to open; two sub-sections render and do nothing |
| `floating-workspace` | works partially | none — one call site reads the wrong id | picker dead with no Active Server; `includeBrowser` denies a working tab |
| `appearance` | works partially | `settings.previewWarpThemeImport` / `previewGhosttyImport` | Warp hidden on the client axis, Ghostty shown and permanently empty |
| `integrations` | Jira one line; Bitbucket a wire | `jira: createRuntimeNamespaceApi('jira')`; a `BITBUCKET_METHODS` family | five cards live, Jira inert, Bitbucket half-inert |
| `voice` | hidden, correctly | **SpeechServiceFactories** + a `speech` preload namespace | no agent; phase 0 only |
| `notifications` | hidden; decide the capability | **RuntimeDesktopSurface**; `shell.pickAudio` | no agent; the browser has its own notification API |
| `advanced` | hidden | **SecretStore**, **Default proxy session resolver**; three keys off `SettingsUpdate` | no agent; phase 0 only |
| `mobile-emulator` | not listed on Linux | `EMULATOR_METHODS` already called directly | no agent; #45 reverted gate 1 to the client axis |
| `developer-permissions` | not listed on Linux | no RPC family exists | no agent; TCC is granted on the host console |
| `dev` | dev-build only | none | not a client axis |

## Shared wires

Wire → sections, built from every report's "Blocks this shares" section. Phase 0 predicted five
collisions; all five are confirmed and three are larger than predicted. Six more were found.

### W1 — `Settings.tsx:343` and its 11 JSX gates — **confirmed, and it is 11 blocks over 12 sections**

Verified here: `grep -n showDesktopOnlySettings` on pristine `Settings.tsx` returns 11 JSX sites
(`:1317, 1350, 1417, 1571, 1591, 1669, 1751, 1767, 1803, 1819, 1855`) plus four non-JSX consumers
(`:357, 363, 538, 776`). Sections behind them: `computer-use`, `voice`, `orca-account`, `mobile`,
`browser`, `mobile-emulator`, `notifications`, `ssh`, `developer-permissions`, `advanced`, `dev`,
`plugins`.

Settles on its own: `computer-use` and `mobile` only. Every other section behind it needs a wire too.

One patch owns the file. Verified here: `grep -l 'Index:.*settings/Settings.tsx' patches/*.diff`
returns exactly `pairing-credentials.diff` and `settings-nav-web-parity.diff`.

### W2 — gate 1 and gate 2 as a pair — **confirmed, and the work is already done**

Phase 0 called the enforcing test "shared infrastructure, not per-section work". It exists:
`src/renderer/src/components/settings/settings-nav-render-parity.test.ts`, landed by PR #45. Nothing
to build. Any section opening one gate still has to open the other, and this test is what fails first.

### W3 — `syncRuntimeBackedSettings` + `SettingsUpdate` — **confirmed, and nine reports hit it, not three**

Verified here: shipped `web-preload-api.ts:4302-4331` forwards exactly six keys
(`worktreeVisibilityDefaults`, `experimentalNewWorktreeCardStyle`, `compactWorktreeCards`,
`minimaxGroupId`, `minimaxUsageModels`, `prBotAuthorOverrides`) plus two on a separate
`settings.updateSharingCapabilities` call. `SettingsUpdate` (`client-ui-schemas.ts:128-166`,
`.strict()`) declares 16 keys.

| section | keys stranded |
| --- | --- |
| `mobile` | `mobileAutoRestoreFitMs`, `showMobileButton` |
| `plugins` | `pluginSystemEnabled`, `devPluginPaths` |
| `accounts` | `geminiCliOAuthEnabled`, `opencodeSessionCookie`, `opencodeWorkspaceId` |
| `artifacts` | `showArtifactsButton` |
| `share-skills` | `showSkillsButton` |
| `terminal` | `setupScriptLaunchMode` |
| `floating-workspace` | `floatingTerminalCwd`, `floatingTerminalEnabled`, `floatingTerminalTriggerLocation` |
| `appearance` | 36 keys |
| `browser` | five link-routing keys — renderer-only by design, so **not** a collision |
| `notifications`, `advanced` | phase 0 only; no agent |

**One piece of work settles nine sections, and it is a decision before it is a hunk.** See order-of-work
item 3 for the four buckets the reports converge on. Widening both lists per key writes the same edit
nine times and puts a host-code-execution switch on a phone-reachable schema.

### W4 — the `hostPlatform` vs user-agent axis — **confirmed, and it reaches six sections, not two**

Phase 0 named `mobile-emulator` and `developer-permissions`. Found beyond them:

- `integrations` — `getLocalExecutionHostLabel` → `getCurrentLocalPlatform` → `navigator.userAgent`,
  on all seven cards. This is what produced phase 0's own live "Account scope: **Local Mac**" on a
  Linux host. The only live evidence for the axis in the whole audit.
- `accounts` — `getHostRuntimeLabel` / `getRendererAppPlatform`; every "This device" label names the
  browser while the accounts live on the host.
- `computer-use` — a **third** way to ask, via `computer.permissionsStatus`, and it is already
  host-correct. Anyone unifying the axis should know this one exists and is fine.
- `terminal` — the **worked example done right**: `isWindowsTerminalCapabilityHost({hostPlatform})`
  used identically in gate 1 (`useSettingsNavigationMetadata.ts:737-742`) and gate 2
  (`Settings.tsx:918-930`). This is the fix template.
- `appearance` — `isDesktopWindows` / `isDesktopMac` read the renderer, and 12-appearance rules that
  **correct**: a browser tab has neither a tray nor a menu bar.

One root: `shared/execution-host.ts`. Settles four sections plus seven integration cards.

### W5 — native dialogs the browser cannot show — **confirmed, and it is two problems, not one**

Every `pick*` in the web preload is a dead stub: `app.pickFloatingWorkspaceDirectory`,
`app.pickFloatingMarkdownDocument`, `repos.pickFolder` / `pickFolders` / `pickDirectory`,
`shell.pickAttachment` / `pickImage` / `pickRepoIconImage` / `pickAudio` / `pickDirectory`, plus
`pickCookieFile` reached through a different door. Sections: `floating-workspace`, `browser`,
`notifications`, `appearance`.

The split no single report could make:

- **File on the HOST** → `RemoteFileBrowser` against the runtime, then a host RPC. Already built twice
  by `floating-workspace-picker.diff`. Correct for the cookie jar (it is the host's own browser
  profile) and for a notification sound on the server.
- **File on the VIEWER'S machine** → `<input type="file">` + `FileReader` + a content-taking RPC.
  04-browser's primary form for `From File…`.
- **Fused handlers block both.** `browser`'s cookie import fuses `pickCookieFile(parent)` and
  `importCookiesFromFile` inside one `ipcMain` handler, so the handler splits before either shape
  applies. `appearance`'s Warp modal already models the answer — `WarpThemeImportPreview.desktopOnly`
  has four consumers and zero producers.
- **Warp import is NOT this class**, despite sitting beside it in phase 0's table. Its `auto` branch is
  a host-filesystem read with no dialog. 11 and 12 agree independently.

### W6 — `createFallbackProxy` — **confirmed as a mechanism, and it explains fewer sections than assumed**

Explains: `voice` (`speech.*`), `integrations` (`jira.*` and — found this pass — `bitbucket.*`),
`plugins` (15 of 21 members, four distinct fallback shapes), `appearance`
(`previewGhosttyImport` → the `preview` branch).

**Does not explain, and four reports say so explicitly:** `accounts`, `ssh`, `browser.session*`,
`pty.management`, `computerUsePermissions.reset`. Those are hand-written constant stubs inside a
namespace the preload does define. Same observable shape, different cause, different fix. Any audit
reasoning "the key is absent from the preload, therefore the fallback proxy" gets all five wrong in
both directions — and `artifacts` and `mobile-emulator` are the mirror error: no preload namespace at
all, and none needed, because they call `callRuntimeRpc` directly.

### W7 — `createRuntimeNamespaceApi` — **found this pass, not in phase 0's list**

`web-preload-api.ts:2684` pristine. Upstream's own one-line seam for "a whole namespace whose RPC
family already exists". Serves `hostedReview` and `linear` today. Settles `integrations`' Jira card
outright and `bitbucket` once its family exists. Any section whose gap has this shape is a one-line
fix through it.

### W8 — the Orca account bridge — **three sections, one wire, and a second wire that lies**

`orcaProfiles.connectCurrent` + a host-browser opener for the PKCE authorize URL settles
`orca-account`, `artifacts` and `share-skills` — three dead Sign-in buttons, one piece of work.

The paired finding only 02 made: `orcaProfiles.signOutCurrent` in the web preload returns a local
`signed-out` without contacting the host, and the store toasts success unconditionally while
re-reading the now-real host status. Harmless upstream, armed by `web-share-surfaces.diff` making the
read real. It is the only item in this audit that turns a **wrong** answer into a right one rather
than adding a capability, and it must land before any host session can exist.

### W9 — **Modules split out of `src/main/ipc/*`** — five sections, one idiom

`ssh` (`ssh-target-registry.ts`, exists, management half has no slot), `plugins` (14 `ipcMain`
handlers), `terminal` (`pty-management.ts`), `share-skills` (`skill-cloud-ipc-handlers.ts`),
`appearance` (`warp-themes` auto-preview). `integrations`/Bitbucket needs it and **already has it** —
`_resetPreflightCache` is in `preflight/agent-detection.ts`, outside `ipc/`.

Whoever builds the first sets the idiom. If two invent different ways to lift an `ipcMain` handler,
the series carries two shapes for one problem.

### W10 — registries populated only by `attachMainWindowServices` — **found this pass**

Verified here at the tag: `registerSshHandlers` and `registerDaemonManagementHandlers` each have
exactly one non-test caller, both in `src/main/window/attach-main-window-services.ts` (`:159`, `:141`).
`setSshTargetRegistryStore` is called only inside `registerSshHandlers` (`ipc/ssh.ts:968`).
`orca serve` creates no `BrowserWindow` — 04, 05 and 13 each measured no `--type=renderer` child in
the live process tree.

Consequence: the SSH registry is null under `serve`, so `listRegisteredSshTargets()` is always `[]`
and `connectRegisteredSshTarget()` throws `ssh_handlers_not_registered` — the "real half" of the
`ssh` preload is real code against an empty store. Of the five v1.4.190 split-out modules only
`ssh-target-registry` is populated there; `plugin-client-list.ts` takes its service as an argument and
`preflight/agent-detection.ts` is pure functions, so `plugins` and preflight are unaffected.

Reach beyond settings: the sidebar's Add Remote Host dialog, and SSH-backed repos, workspaces and
terminals generally. `pty-management` is the same shape with a different remedy — registering its
`ipcMain` channels headless would not help, because no web client reaches `ipcMain`; it needs the RPC
family.

### W11 — `getWebClientLocalFallbackEnvironmentId` — two sections, one resolver

Verified here: `src/renderer/src/lib/floating-workspace-runtime-owner.ts:50` exports it as an alias of
`getFloatingWorkspaceRuntimeEnvironmentId`. `browser`'s Session & Cookies and
`floating-workspace`'s directory picker both resolve their execution owner to `local` on a fresh
browser and fall through to dead stubs; both fixes are the same one-line swap at their own call site.
Found independently by 04 and 11.

### W12 — already fixed, recorded so nobody re-derives it

- `AgentSkillSetupPanel` + `cli.*` + `skills.discover` — one component, seven surfaces
  (`orchestration`, `linear`, `tasks`, `general`, `experimental`, `mobile-emulator`, `computer-use`).
  `cli-registration.diff` fixed all seven at once.
- `preflight.check` — five source-control cards plus `tasks`. Live.
- `skills.freshnessInventory` — stubbed empty for every client, so no skill panel anywhere shows an
  update badge. Honest today; lights up everywhere at once if it ever routes.

### W13 — one snapshot, many surfaces

`accounts.list` carries the whole `RateLimitState`. One wire fills the Accounts pane, the status-bar
account switchers and `appearance`'s status-bar provider toggles. `stats` is **not** on it — it uses
`usage.*` and already works.

## Welded fragments

**Exactly one, and the working tree has already dissolved it.**

Verified here by reading the extent of every one of the 11 gate-2 blocks in pristine `Settings.tsx`:

| gate site | sections inside |
| --- | --- |
| `:1317-1348` | **`computer-use` (:1319) and `voice` (:1334), inside one `<>…</>`** |
| `:1350, 1417, 1571, 1591, 1669, 1751, 1767, 1803, 1819, 1855` | exactly one section each |

A **second weld, not in the JSX**, which only 01 named: `Settings.tsx:776-795` is one
`if (showDesktopOnlySettings)` containing both `next.set('computer-use', …)` and
`next.set('voice', …)`. Opening `computer-use`'s nav install badge edits `voice`'s block. Two further
single-section consumers of the same `const` move with it: `:357` (`enabled:` on
`useInstalledAgentSkill` for `computer-use`) and `:363` + `:538-553` (`voice`'s model-state loading).

**Answer to whether the work can be split across patches: no, and it does not need to be.** One patch
must own `Settings.tsx`; the split is free *inside* it. The uncommitted
`patches/settings-nav-web-parity.diff` already carries the fragment split (hunk `@@ -1314,37 +1314,32`
lifts `computer-use` out and leaves `voice` gated) and the badge split (`@@ -773,16 +773,16`). No other
section is welded to any other, so `mobile`, `browser`, `ssh`, `plugins`, `orca-account`, `advanced`,
`notifications`, `mobile-emulator`, `developer-permissions` and `dev` are each one independent hunk.

**The collision phase 0 warned about is real but not yet live.** Verified here: the nav patch's last
`Settings.tsx` hunk is `@@ -1568,25 +1561,23` (pristine 1568-1592); `pairing-credentials.diff`'s is
`@@ -1741,7 +1741,10` (pristine 1741-1747). ~149 lines apart, and pairing applies first in `series`
(position 2 vs 14), so the nav patch's context already carries pairing's +3 offset. **They become
adjacent the moment `ssh` opens** — `ssh` is at `:1751`, four lines past pairing's hunk end;
`developer-permissions` at `:1767` is the next-nearest.

## Contradictions

Seven ruled from the tag, three unresolved.

**K1 — where the four Browser keys write. Ruled for 04-browser.** Phase 0 places
`browserDefaultUrl` / `browserDefaultSearchEngine` / `browserDefaultZoomLevel` /
`browserKagiSessionLink` in `SettingsUpdate` and stranded off the sync allowlist. Verified here:
`SettingsUpdate` (`client-ui-schemas.ts:128-166`, `.strict()`) holds 16 keys and no browser key; the
four are `UiUpdateFields:247-253`, and `UiUpdate` (`:297`) is built over
`tolerateUnknownValues(UiUpdateFields.shape)`. Corroborated live by 04 finding two of the four already
persisted in the host's `ui` state. **Consequence for every other report: `ui.set` is a second,
non-allowlisted settings path to the host.** Anyone who checked only `SettingsUpdate` and the sync
allowlist got a false negative. `appearance`'s `uiZoomLevel` (`:213`) is on it too — and 12 rules that
a defect from the other direction, a per-device value landing in one global host UI state.

**K2 — who owns `TerminalAppearanceSection.tsx:86`. Ruled for 10-terminal and 12-appearance.** Phase
0's `terminal` row attributes its partial state to the Warp import site. Verified here:
`git grep '<TerminalAppearanceSection' v1.4.190` returns exactly one non-test renderer,
`AppearancePane.tsx:248`, and `TerminalPane.tsx` contains no `isWebClientLocation` at all. The Warp
gate is `appearance`'s. `terminal`'s partial state has a different cause — Manage Sessions and Setup
Script.

**K3 — `artifacts` gate 4. Ruled for 08-artifacts.** Phase 0 cites `ArtifactsSettingsPane.tsx:27`.
Verified here: `grep isWebClient` on the **shipped** file returns nothing — `web-share-surfaces.diff`
deleted the import and rewrote the three branches. The same grep confirms 09's five sites in
`ShareSkillsSettingsPane.tsx` (`:103, 125, 136, 155, 202`) exactly, so phase 0 is right about
`share-skills` and wrong about `artifacts`.

**K4 — `floating-workspace` gate 4 drops a row. Ruled for 11.** Verified here in the shipped file:
`includeBrowser` (`:62`) feeds only the search-entry filter (`:135`) and the keywords array (`:154`).
No row is dropped. **But phase 0 pointed at the right file for the wrong reason** — 11 finds a real
defect four lines away: `shouldUseServerDirectoryBrowser` (`:47-55`) reads
`settings.activeRuntimeEnvironmentId` raw (`:66-68`), which is `null` on a fresh browser, so the
folder button falls through to a `Promise.resolve(null)` stub. Confirmed by reading `:44-70`.

**K5 — `accounts` gate 4. Ruled for 07, on one derived premise.** Verified here that the site is
`isRemoteAccountScope && !isWebClientLocation()` (shipped `AccountsPane.tsx:414`), so the client half
is only reached when `activeRuntimeEnvironmentId` is non-empty. 07 and 13 independently show phase 0's
own live "Account scope: Local Mac" can only be produced on the *empty* branch. Gate 4 is therefore
dead code on the tile and the mechanism is a constant stub in `createAccountsApi`. The premise is
inference from one live string — see U2.

**K6 — is `ssh`'s "real half" real? Both true; 05 is the one that decides the work.** Phase 0's
reading (the preload routes `listTargets` / `connect` / `getState` to `SSH_METHODS`) is correct at the
preload. 05's is correct at the host and confirmed here — see W10. Phase 0's "smallest correct fix:
gate 2, then target management over the wire" is incomplete: installing the SSH layer under `serve`
comes first, and it is not settings work.

**K7 — `plugins`' blocking wire. Ruled for 06.** Phase 0 and PR #45 name the missing
`install`/`refresh`/`remove`. Both true and neither is the blocker: `PluginsSettingsSection.tsx:121`
guards the list effect on `settings.pluginSystemEnabled`, and that key is absent from `SettingsUpdate`
(the 16-key list, verified here) and from the six-key allowlist (verified here). So the six wired
methods are never called at all. 06's claim is upstream of the other.

**K8 — the shipped patch header contradicts the shipped code.** `settings-nav-web-parity.diff`'s nav
comment at v4.190.1 justifies listing `computer-use` because *"`computer.capabilities` answers with
what this host is missing"*. 01 measured that it does — and that **no UI on any client calls it**
(two hits in `src/renderer`, both other members). Not a disagreement between reports; a disagreement
between a header and the tree, visible only from here.

**U1 — will the identity provider complete OAuth inside Orca's own browser? Unresolved.** 02 records
that the dispatch treats `disallowed_useragent` as established while
`docs/audit/v1.4.190/N3-orca-account-sign-in.md` records it as the one open, untested risk; 08 and 09
both defer to the same document. I did not read N3 and cannot rule from the reports. It decides
whether rung 1 (Orca's browser) or rung 2 (operator pastes the code back) is the design, and it gates
three sections. **Probe:** one real sign-in attempt through `browser.tabCreate`/`browser.goto` on the
deployed host — ten minutes with real credentials, no code change.

**U2 — is the tile's `activeRuntimeEnvironmentId` empty? Unresolved.** Four reports depend on it, in
opposite directions: 04 (Session & Cookies defaults to `local`), 07 (gate 4 dead, roster read broken),
11 (picker dead), 13 (Jira takes the `local` branch, so the preload namespace is the right fix). All
four infer it from the same single live string plus source. If it is non-null in the operator's
browser, 13's one-line Jira fix targets the wrong branch and K5 flips. **Probe:**
`window.api.settings.get().then(s => s.activeRuntimeEnvironmentId)` in the tile console.

**U3 — does `orca-ide account list` reach the running `serve` daemon or start its own runtime?
Unresolved.** 07's strongest evidence — a full account snapshot over the CLI — rests on the socket
`o-793-f3da.sock` belonging to pid 793. The handshake was not traced. **Probe:** `lsof` the socket
path while the CLI runs.

## PR #45 re-judged

## 45 (`2db423a`) kept `computer-use`, `mobile` and `browser` in the web nav and removed `orca-account`

`plugins` and `ssh`, on the stated ground that "sign-in is not built, and plugin install and SSH target
management are unrouted stubs, so those panes can only ever be empty."

**`orca-account` — the decision does not survive as stated.** The premise is false about what the pane
draws. 02 establishes the read half is real end to end: `orcaProfiles.authStatus` routes over a real
RPC to the overlay's `sharing-surfaces.ts` and returns the host's actual profile state — which
`web-share-surfaces.diff` built for exactly this. With gate 2 open the pane draws the host's account
state, the correct status line and an enabled Sign in button whose only outcome is an error toast.
That is partially working, not empty. **#45's caution is nevertheless validated by a defect it did not
name**: the web preload's `signOutCurrent` is a canned success that never reaches the host, and it
arms the first time anyone signs in on the host console. **Capability fact:** sign-in is buildable and
its loopback round trip was driven on this host, subject to U1. Revisit the nav decision together with
the sign-out fix and honest copy, not before.

**`plugins` — the decision does not survive; #45 named the wrong wire.** `install` / `refresh` /
`remove` really are unrouted, and that is not what stops the pane. K7: `pluginSystemEnabled` never
reaches the host, so the tile's master switch flips a localStorage boolean and the six already-wired
methods are never called. With that one write and gate 2 — no `install`, no marketplace — the three
plugins bundled inside the AppImage publish, and `list` / `consent` / `setEnabled` / `invokeCommand` /
`readPanelEntry` / `panelAction` all work in the tile. **Capability fact: plugins can work in the
browser without the wire #45 assumed was blocking.** The same flag also turns on plugin panels in the
right sidebar and plugin quick commands in Cmd+J — the largest single capability win in the audit, and
neither is a settings section.

**`ssh` — the decision survives, and for a stronger reason than #45 gave.** #45 said target management
is unrouted; true. W10 is the deeper fact: the SSH layer is never installed under `orca serve` at all,
so even the "real" half answers `[]` and `ssh_handlers_not_registered`. Opening gate 2 alone yields a
pane that reports host state it never read — an empty-state card, an Import that toasts "already in
sync" without a round trip, an Add Target whose Save rejects, and a Remove that toasts success having
done nothing. **Worse than blank, so the removal is right while the wire is missing.** Capability fact:
none of SSH is browser-hostile — no local filesystem, no native dialog, no window.

**A fourth judgement, changed by the audit.** #45 also removed the host-platform axis for
`mobile-emulator` and `developer-permissions` "as never exercised". Correct as a way to stop the two
gates disagreeing on the axis itself, and correct conservatively for `developer-permissions`, whose
preload is entirely stubbed with no RPC family behind it. It is not the end state: W4 shows the same
renderer-vs-host confusion in `accounts` and in all seven `integrations` cards, with `terminal` as the
worked example of doing it right in both gates. The axis is decided once, at `shared/execution-host.ts`.

### Live probes to run

One ordered list, executable end to end in a single session. Group A is console reads on the deployed
tile as it stands; B needs a build with gate 2 open; C are host writes and need the operator's
go-ahead.

**A — deployed tile, reads only.**

1. `await window.api.settings.get().then(s => s.activeRuntimeEnvironmentId)` — **U2. Do this first**;
   the meaning of probes 11, 12 and 15 depends on it, and it settles a premise in 04, 07, 11 and 13.
2. `await window.api.orcaProfiles.authStatus()` — expect
   `{activeProfileId:'local-default', configured:true, state:'local', persistence:'none'}`. Settles
   02's whole render prediction and 08's `configured` derivation.
3. `await window.api.jira.status()` and `await window.api.bitbucket.status()` — expect `undefined`
   from both. Settles 13's fallback-proxy attribution for both cards.
4. `await window.api.pty.management.listSessions()` — expect `{sessions: [], degraded: false}` against
   a host daemon holding two live shells (10 measured PID 915 with two children).
5. `await window.api.ssh.listTargets()` — expect `[]`. Record it; it does **not** distinguish an empty
   registry from a null one, and 05 says so.
6. `await window.api.computerUsePermissions.getStatus()` — the one call 01 could not make from the
   CLI. `helperUnavailableReason: null` plus two `unsupported` entries is what makes the feature wall
   report Computer Use ready on a host that refuses every computer-use call.
7. `await window.api.settings.previewGhosttyImport()` — expect
   `{found:false, diff:{}, unsupportedKeys:[]}` from `getFallbackResult`'s `preview` branch.
8. `await window.api.settings.listFonts()` — expect `[]`.
9. `await window.api.plugins.install('nonexistent')` and `.refresh()` — expect `undefined`.
10. `await window.api.mobile.listDevices()` — 03's one unmade call.
11. `await window.api.browser.sessionListProfiles()` — expect `[]`.
12. Read `[data-settings-section="accounts"]`: are all six provider sections present, is **Add
    Account** enabled, is there an "Account scope:" row? Settles 07's three render claims at once.
13. Read `[data-settings-section="artifacts"]` children against the same pane on a signed-out desktop
    — 08's own falsification test for its gate finding.
14. Read `[data-settings-section="share-skills"]` for `Show Skills Button`, `Active shared links`,
    `Open Skills` — 09 expects all three absent.
15. Read the Jira card's scope row from a Mac browser, then from a Linux browser against the same
    host. Two browsers, one host — the cleanest demonstration of W4 available.
16. Settings search and Cmd+J for `computer-use`, `orca-account`, `ssh`, `plugins`. Every report lists
    this as the same defect through a second door; none exercised it.
17. Click `browser`'s `onOpenComputerUse` and the Artifacts page's `openSettingsTarget({pane:
    'orca-account'})` — the two in-app deep links that land on blank panes.

**B — a build with the working-tree gate-2 hunks applied.**

18. Build, open Settings, read `[data-settings-section]` for `computer-use`, `mobile`, `browser`.
    **This is the probe all thirteen reports name in Unverified.** Do not extend it to `orca-account`,
    `ssh` or `plugins` — see order of work.
19. Browser › Session & Cookies: how many options in the Host selector, and does picking the server
    make the default profile row appear with `partition: persist:orca-browser`?
20. Mobile › Generate: does the QR draw, and does `orca-devices.json` gain a `mobile` entry? Settles
    03's attribution question.
21. Computer Use: does the skill panel draw with real `skills.discover` data?

**C — host writes; operator's go-ahead required.**

22. One real Orca sign-in through `browser.tabCreate` / `browser.goto` — **U1, and it gates three
    sections. Highest value on this list.**
23. Set `pluginSystemEnabled: true` in `~/.config/orca/profiles/local-default/orca-data.json`,
    restart, `ls ~/.config/orca/plugins/` — does bundled bootstrap publish all three? Validates 06's
    central prediction with no code.
24. Flip the Share Skills publish toggle in the tile, re-read `agentSkillSharingEnabled` on the host.
25. `orca-ide account add --agent codex` on the host, reload the tile — today host-empty and
    tile-empty are indistinguishable.
26. Install `python3-gi gir1.2-atspi-2.0 at-spi2-core`, re-run `orca-ide computer capabilities --json`.

Deliberately **not** on this list: Kill All / Restart Daemon (10), Bitbucket disconnect (13),
`skills.share` (09). All three mutate a shared host with nothing to learn.

### Order of work

**0 — do nothing for `orca-account`, `ssh` and `plugins` yet.** #45's removal stands for all three
until their preconditions land. `ssh` especially: gate 2 alone makes it lie.

**1 — first, because it is not settings work and six things depend on it: install the SSH layer under
`orca serve`.** One hunk in `src/main/index.ts` calling `registerSshHandlers(store, () => null,
runtime)` at process level when `isServeMode`, beside the existing `setPtyHostBindings` install —
upstream's own comment on that line describes this exact bug for PTY. Settles `ssh`'s read half, the
`clientEvents` `sshStates` snapshot, the sidebar's Add Remote Host dialog, and SSH-backed repos,
worktrees and terminals. Owner: **new patch**, stacking last; `src/main/index.ts` is owned by
`trusted-proxy-session.diff`, `usage-analytics.diff` and `web-share-surfaces.diff`, none of which
touches the process-level install block. **Risk, named by 05 and unresolved:** whether every path
inside `registerSshHandlers` tolerates `() => null` for the window. `broadcastSshState` was traced and
does; `registerCredentialHandler`, `registerAdvertisedUrlRefresh`, `registerPowerMonitorReconnect` and
`registerSshBrowseHandler` were not. Trace those four before writing the hunk.

**1b — same rank, in parallel: land the gate-2 half already in the working tree.** `computer-use`,
`mobile`, `browser` — the three #45 kept. The fragment split, the badge split and the skill-hook
enable are all already in the uncommitted patch; probe 18 confirms it. Owner:
`settings-nav-web-parity.diff`. It cannot collide with `pairing-credentials.diff` today, and will be
adjacent to it the moment `ssh` opens.

**2 — three one-file wires, parallel, each settling a section alone:**

- **`jira: createRuntimeNamespaceApi('jira')`** — one added line at pristine `web-preload-api.ts:889`.
  Settles `integrations`' Jira card, `tasks` › Jira (the same defect through a second door), the Tasks
  page issue list, issue creation and the Jira issue workspace. **The largest capability any single
  line in this audit returns.** New patch, last in series. Conditional on U2 (probe 1).
- **`pluginSystemEnabled` / `devPluginPaths` to the host** as a `plugins.setSystemEnabled` pair on
  `PLUGIN_METHODS`, off `MOBILE_RPC_METHOD_ALLOWLIST` — never by widening `SettingsUpdate`, which is
  phone-reachable, for a switch that runs third-party code on the host. Settles `plugins`' real
  blocker plus plugin panels and quick commands outside settings. Extends `plugins-web-bridge.diff`.
  Probe 23 validates the prediction before any code is written.
- **`createAccountsApi` stops being a constant** — `accounts.list` / `subscribe` / `select*` /
  `remove*` already exist and already answer on the deployed host, and the tile's `scope: 'runtime'`
  credential is already authorised for them. Settles `accounts`' read/switch/remove half and the
  status-bar account switchers. New patch, ordered after `plugins-web-bridge.diff` and
  `usage-analytics.diff`, which carry the `:909-910` call sites as context.

**3 — the one decision that settles nine sections: what happens to a settings key that must reach the
host.** Decide once, before widening anything. The reports converge on four buckets:

- *host-enforced and phone-dangerous* → its own runtime-scope method, `settings.updateSharingCapabilities`'s
  shape: `pluginSystemEnabled`, `devPluginPaths`, `opencodeSessionCookie`.
- *an existing method already carries it* → route it, widen nothing: `mobileAutoRestoreFitMs` onto
  `terminal.setAutoRestoreFit`; the four Browser keys, which already travel on `ui.set` (K1).
- *genuinely per-browser* → leave in localStorage and say so in the row: `showMobileButton`,
  `showSkillsButton`, the five link-routing keys, `uiZoomLevel` and the terminal typography keys.
- *what is left actually needs `SettingsUpdate` + the sync allowlist widened in one hunk*:
  `setupScriptLaunchMode`, `floatingTerminal*`, `geminiCliOAuthEnabled`, appearance's
  workspace-carried keys.

Sections settled: `mobile`, `plugins`, `accounts`, `artifacts`, `share-skills`, `terminal`,
`floating-workspace`, `appearance`, and by decision `browser`.

**4a — before 4b, not after: `orcaProfiles.signOutCurrent` over the wire, or disable the button.** W8.
The only item that turns a wrong answer into a right one. Must land before any host session can exist.
Extends `web-share-surfaces.diff`, which owns the preload lines and the `src/main/index.ts` provider
install.

**4b — blocked on a live check: sign-in.** `orcaProfiles.connectCurrent` plus a host-browser opener
behind a port. Settles `orca-account`, `artifacts` and `share-skills` together. **Blocked on probe
22**, which decides rung 1 versus rung 2. Two constraints from 02 that must survive the design: it
cannot be one blocking call (`AUTH_TIMEOUT_MS` is five minutes and would hold a foreground RPC slot —
split into `beginSignIn` plus polling `authStatus`), and nothing here goes on
`MOBILE_RPC_METHOD_ALLOWLIST`.

**5 — the axis, decided once.** `shared/execution-host.ts` `getCurrentLocalPlatform` /
`getLocalExecutionHostLabel`. Settles `accounts`' device labels, all seven `integrations` scope rows,
and the residue of `mobile-emulator` / `developer-permissions`. `terminal` is the template. Not any one
section's to own.

**6 — the native-dialog class, decided once, in the two halves W5 names.** Settles `browser`'s
`From File…`, `notifications`' `pickAudio`, and the residue of the nine dead `pick*` stubs. Two
prerequisites: `browser`'s cookie import handler splits first, and Warp import is not this class.

**7 — the remaining per-section wires, all parallel, all after their prerequisites:** `ptyManagement.*`
over the wire (settles `terminal`'s Manage Sessions **and** `developer-permissions`' severed-TCC
notice and the app-wide banner behind it); `ssh` target management plus preload plus gate 2 (after
item 1); the Warp and Ghostty preview RPCs (settles `appearance`'s two imports and the onboarding
theme step); a `BITBUCKET_METHODS` family; the skill publish rail; and `browser`'s execution-host
default plus `floating-workspace`'s picker id, which are the same one-line resolver swap at two call
sites (W11).

**Genuinely not worth doing:**

- `computerUsePermissions.reset` and the macOS permission block — unreachable on a Linux host, and the
  block correctly hides itself. Record that its web stub's `helperUnavailableReason: 'web_client'`
  would flip a **Mac** host's pane to unavailable, and leave it.
- `appIcon` in the browser — no renderer consumer; written back it would set the headless host's dock
  icon. The honest answer is a smaller pane, not a wire.
- `settings.listFonts` over the wire — the host's installed fonts are not the rendering device's. The
  device-side answer is `queryLocalFonts()` or the curated fallback already in place.
- `plugins.onChanged` push — the pane re-lists after every mutation.
- `From <Browser>` entries for Arc, Comet, Helium or Safari — no Linux root exists by upstream's own
  table. Saying so in the pane is honest; adding them is not.
- The two `jira.cancel*` members with no runtime method — both call sites are already
  `.catch(() => {})`.
- Building the gate-1/gate-2 pairing test. It exists (W2).
- `notifications` as a capability, until someone decides whether a browser tab wants
  **RuntimeDesktopSurface** at all. Phase 0 flagged the decision and no agent was given it.

### Unverified

- **No section was rendered and nothing was built in this pass or in any of the thirteen.** Every
  claim about what a pane draws is source reading on top of phase 0's `[data-settings-section]`
  measurement. Probe 18 is the one that settles the whole class.
- **No browser was started here**, per the brief. No `quilt push`, no `mise run up`, no `vitest`, no
  build, no typecheck, no `mise run owner`, no `quilt annotate`. Ownership claims are read from
  `Index:` lines in `patches/*.diff` and from `patches/series`.
- **The nine reports' live host probes are taken as given.** I re-read the reasoning, not the
  workspace; no `coder ssh` session was opened in this pass.
- **K5's ruling rests on U2.** If `activeRuntimeEnvironmentId` is non-empty in the operator's browser,
  `accounts` takes the remote branch, gate 4 *does* fire, and 13's Jira analysis targets the wrong
  branch. One probe settles both.
- **W10's live half is three reports' process-tree measurement, not mine.** The source half —
  `registerSshHandlers` and `registerDaemonManagementHandlers` each having exactly one non-test
  caller, both in `attach-main-window-services.ts` — is verified here at the tag.
- **U1 is unread.** I did not open `docs/audit/v1.4.190/N3-orca-account-sign-in.md`; 02's account of
  what it says is taken at face value and is the reason the question is filed unresolved rather than
  ruled.
- **`docs/audit/v1.4.190/00-building-blocks.md` was read for the port table and the
  `src/main/ipc/*` split section only.** Block names are used verbatim from those two.
- **The `series` collision analysis is arithmetic on hunk headers**, not a restack. `pairing-credentials.diff`
  applying before `settings-nav-web-parity.diff` is read from `patches/series`; that the nav patch's
  context already carries pairing's +3 offset is 03's claim, not re-derived.
- **Whether the uncommitted `patches/settings-nav-web-parity.diff` applies** was not tested. Its hunks
  were read; `quilt push` was not run.
- **The four buckets in order-of-work item 3 are a synthesis, not a decision anyone has made.** Each
  key's assignment is the reasoning of the report that found it; no bucket was validated against
  `mobile-rpc-allowlist.test.ts`, which none of the thirteen read either.
- **Sections with no agent** — `voice`, `notifications`, `advanced`, `mobile-emulator`,
  `developer-permissions`, `dev` — appear in the verdict table from phase 0 alone. Nothing here adds
  evidence about them beyond the shared wires they sit on.
