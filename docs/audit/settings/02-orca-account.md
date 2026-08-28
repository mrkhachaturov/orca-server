# orca-account — what it needs to work in the browser

Paths relative to `lib/orca/`; line numbers are `git -C lib/orca show v1.4.190:<path>` unless a patch
is named. Host facts are read on the operator's Coder workspace `ceo/pink-planarian-96`
(`orca-server` 4.190.1, upstream pin `v1.4.190`, Linux) over `coder ssh` only. No browser was
started, no tab opened, nothing on the host was written. `web-preload-api.ts` line numbers are the
**shipped** file (`web-share-surfaces.diff` applied), and are labelled so; everything else is
pristine.

## State today

**Tile, published v4.190.1: listed and blank.** Taken from `00-sections.md`, which measured every
section by driving the deployed tile and reading `[data-settings-section]` after each nav click. Not
re-measured here.

Corroborated statically against the shipped tag. `git show v4.190.1:patches/settings-nav-web-parity.diff`
lifts the `orca-account` entry out of the `showDesktopOnlySettings` array and flips its test from
`not.toContain('orca-account')` to `toContain`, and carries **no** `Index:` line for `Settings.tsx`.
Pristine `Settings.tsx` therefore still ships and `showDesktopOnlySettings` (`:343`) still wraps the
`orca-account` `<SettingsSection>` (`:1350`). Row present, no section in the React tree.

**Three doors reach the same blank pane, not one.** The sidebar row; settings search, because
`orca-account-settings-search.ts` registers `account` / `login` / `logout` / `sign in` / `sign out` /
`relay` / `cloud` and those entries come from gate 1; and `ArtifactsPage.tsx:39`
`openSettingsTarget({ pane: 'orca-account', repoId: null })` — the Artifacts page's own "manage
account" affordance. Before v4.190.1 the third door landed on the fallback section
(`Settings.tsx:1098`): a wrong destination. Now it lands on nothing.

**Desktop, for contrast** (`OrcaAccountSettingsPane.tsx`, 193 lines): an avatar row with the account
display name, a `Connected` badge when `authStatus.state === 'connected'`, one status line, and one
button — **Sign out** (opening `OrcaProfileSignOutConfirmDialog`) when connected, otherwise **Sign in
to Orca** / **Sign in again**. Below it three static blurbs: Artifact sharing, Orca Relay, Skill
sharing. There is no `isWebClientLocation()` anywhere in the pane or its dialog — gate 4 does not
apply to this section.

**What the pane would render in the tile the moment gate 2 opens, on this host.** Every input is
host-side and I read all of them:

- `~/.config/orca/orca-profile-index.json` — `activeProfileId: "local-default"`, one profile,
  `kind: "local"`, and **no `cloud` field**.
- `~/.config/orca/profiles/local-default/` contains no `account-session.json.enc`. The host has never
  signed in.
- `resources/app.asar` exists under the running `squashfs-root`, so `app.isPackaged` is true, and
  `/proc/793/environ` carries no `ORCA_CLOUD_*` and no `NODE_ENV`. `getOrcaCloudAuthConfig`
  (`profile-cloud-auth-config.ts`) therefore takes the packaged defaults —
  `https://login.onorca.dev`, client `orca-desktop` — and returns `configured: true`.
  `isOrcaCloudDevAuthEnabled()` is false (packaged).
- `~/.config/orca/profiles/local-default/orca-secret-protection.json` records
  `"The OS keyring is unavailable, so secrets are stored unencrypted…"` — the
  `!isEncryptionAvailable()` branch, so any future session is `memory-only`.

Feed those through `getOrcaProfileAuthStatusFromProfile` (`profile-cloud-auth-status.ts`, the
`!cloud` branch) and the status is
`{activeProfileId: 'local-default', configured: true, state: 'local', persistence: 'none'}`. So the
pane draws: name "Orca account", no badge, the line *"Sign in to extend Orca with cloud features,
including Artifacts and Orca Relay."*, and a **Sign in to Orca button that is enabled** —
`canConnect = authStatus?.configured === true` (`OrcaAccountSettingsPane.tsx:69`). Pressing it calls
the web preload's `orcaProfiles.connectCurrent`, which is a canned
`{status: 'failed', error: 'Signing in to Orca must be completed on the server host…'}`
(shipped `web-preload-api.ts:728-733`, written by `web-share-surfaces.diff`), and
`connectCurrentOrcaProfile` (`store/slices/orca-profiles-auth-actions.ts:99-101`) turns that into a
red **"Failed to connect profile"** toast. A live button whose only outcome is an error toast.

**A latent false success sits behind the Sign out button.** The web preload's `signOutCurrent`
(shipped `web-preload-api.ts:738-743`, upstream's own, unchanged by any patch) returns `status: 'signed-out'`
without contacting the host, and the store toasts *"Signed out of profile"* unconditionally
(`orca-profiles-auth-actions.ts:156-166`) while setting `orcaProfileAuthStatus` to
`await webOrcaProfileAuthStatus()` — which since `web-share-surfaces.diff` is the **real host
status**. On a host with a session that is: success toast, badge still `Connected`, host still signed
in. It was harmless upstream because the status it echoed was the hardcoded `unconfigured`; making
the read real armed it. It is unreachable on this host today because the Sign out button renders only
when `state === 'connected'`, and this host has no cloud profile — it arms the first time anyone
signs in on the host console.

## Which gate, and why

**Gate 2 alone produces the blank pane** — `Settings.tsx:343` `showDesktopOnlySettings`, consumed by
the `<SettingsSection id="orca-account">` block at `Settings.tsx:1350`. Gate 1
(`useSettingsNavigationMetadata.ts:148`) was opened for this id by
`patches/settings-nav-web-parity.diff` at v4.190.1; gate 2 was not, and the patch carries no `Index:`
line for `Settings.tsx` at that tag. `visibleSectionIds` (`Settings.tsx:846`) is built from gate 1, so
the id is now in it, the fallback at `:1098` does not fire, and the content column renders zero
`[data-settings-section]` nodes.

Gate 3 (`SettingsSidebar.tsx:190-192`) is `setup-guide` only. Gate 4 does not apply: the pane and its
dialog contain no `isWebClientLocation()` call.

**Order, and it is not just gate 2.** Opening gate 2 is safe on this host *today* and dishonest the
moment a session exists. The order is:

1. Gate 2 at `Settings.tsx:1350`, together with a pane that says what it cannot do — the enabled
   Sign in button must stop being a toast generator, and the memory-only fact must be visible.
2. `orcaProfiles.signOutCurrent` over the wire, or the button disabled — before any host session can
   exist. This is the only step that turns a wrong answer into a right one rather than adding a
   capability.
3. `orcaProfiles.connectCurrent` over the wire plus the host-browser opener, per
   `docs/audit/v1.4.190/N3-orca-account-sign-in.md`. This is the capability.

## What the pane actually needs

| wire | today | how established |
| --- | --- | --- |
| `orcaProfiles.authStatus` RPC | **exists** | `src/main/runtime/rpc/methods/sharing-surfaces.ts` (overlay, ours) defines it; the provider is installed in `src/main/index.ts` by `web-share-surfaces.diff`'s `@@ -2847,6 +2849,12 @@` hunk, via `setOrcaProfileAuthStatusProvider`. Its handler reads only host files I read directly. `sharing-surfaces.test.ts:35` asserts registration — which per `00-sections.md` #5 proves nothing on its own; the value is derived from the host inputs above, not from the registration |
| `window.api.orcaProfiles.authStatus` preload | **exists, real** | shipped `web-preload-api.ts:577` `callRuntimeResult('orcaProfiles.authStatus', {}, 15_000)`, with the old `unconfigured` constant kept only as the unpaired/offline catch. Not a `createFallbackProxy` path — the key is present |
| `orca-profile-auth-registry.ts` (the seam) | **exists, read-only by construction** | `src/main/orca-profiles/orca-profile-auth-registry.ts`, overlay (`mise run owner` → `overlay … ours entirely`). Its own header states it "never mints, refreshes or clears" a session. Exists because `getCurrentOrcaProfileAuthStatus`'s import chain reaches `electron` twice and `config/runtime-electron-baseline.txt` must stay empty (**the runtime-electron ratchet**) |
| `orcaProfiles.connectCurrent` RPC | **absent** | Host-side `connectCurrentOrcaProfile` exists (`src/main/orca-profiles/profile-cloud-service.ts:54`) but reaches the client only over the ipcMain channel `orcaProfiles:connectCurrent` (`src/main/ipc/orca-profiles.ts:266`). `SHARING_SURFACE_METHODS` exports exactly two names, test-pinned at `sharing-surfaces.test.ts:38-43`. The web preload answers a canned refusal, so it never even reaches the fallback proxy |
| `orcaProfiles.signOutCurrent` RPC | **absent, and the preload lies** | Host-side `signOutCurrentOrcaProfile` exists (`ipc/orca-profiles.ts:306-309`); no RPC method. Preload returns a local `signed-out` (`web-preload-api.ts:738`) |
| `orcaProfiles.refreshAuth` RPC | **absent** | Host-side `refreshCurrentOrcaProfileAuth` re-exported at `profile-cloud-service.ts:37`; no RPC method; preload returns `unconfigured`. Not called by this pane, but `ArtifactsPage.tsx:25` uses it for pagination refresh |
| A host browser opener for the PKCE authorize URL | **absent** | `beginOrcaCloudPkceFlow` (`profile-cloud-pkce.ts:139`) calls `shell.openExternal` and nothing else; `shell` is imported from `electron` at `:3`. `L1-live-check.md` measured no `xdg-open` and no `gio` on the host |
| **RuntimeBrowserCommandsFactory** / `browser.tabCreate` + `browser.goto` | **exists** | `L1-live-check.md`: `browser.screencast.v1`, `browser.headless.v1`, `browser.tab-create-known-id.v1` are advertised on the `--serve` path (`hasRenderer \|\| hasOffscreen`, `hasRenderer` false → offscreen backend installed). `N3` drove `browser.tabCreate`/`goto` from the CLI and over the wire, and the loopback callback arrived with the query string intact. I re-confirmed the binary ships on this host: `squashfs-root/resources/agent-browser-linux-x64` |
| **SecretStore** | **installed but cannot seal here** | `orca-secret-protection.json` on the host records the `!isEncryptionAvailable()` gap string. Consequence, from `N3`: `saveOrcaCloudSession` neither throws nor writes plaintext (a packaged build refuses the plaintext branch) — the session is `memory-only` and dies on the next `serve` restart |
| `persistence` on the wire | **already arrives, nothing renders it** | `OrcaProfileAuthStatus.persistence` (`src/shared/orca-profiles.ts:48`, values `none \| encrypted \| memory-only \| dev-plaintext`) is in every status the tile receives. `grep '\.persistence\b'` across `src/renderer/src` returns no non-test consumer. The pane can tell the operator "you sign in again after every server restart" with **no new wire at all** |

Not needed and worth saying: no settings key. This pane writes nothing through `settings.set`, so
shared dependency #3 (`syncRuntimeBackedSettings`) and #4 (`SettingsUpdate` `.strict()`) do not touch
it. The account lives in the profile store, not in settings.

## Verdict

**Works partially, and here is what is missing.** Once gate 2 opens, the pane's read half is real end
to end — the tile shows the host's actual account state over a real RPC, which is the thing
`web-share-surfaces.diff` already built. Its write half is entirely absent: **Sign in** is a canned
refusal that surfaces as an error toast, and **Sign out** is a canned success that never reaches the
host. Nothing here is browser-impossible — `N3` closed the sign-in loop by experiment on this exact
host, using a browser Orca itself ships. What is missing is three RPC methods on the existing overlay
registry, one call site swap inside `beginOrcaCloudPkceFlow`, and honest copy for a session the host
cannot durably store.

Do not open gate 2 without at least the Sign out fix and the pane copy: a blank pane is a visible
defect, and a success toast over a session that is still live is an invisible one.

## Size of the work

Three separable changes; step 1 is small, step 3 is the real one.

**1 — gate 2 and honest copy.** `Settings.tsx:1350`: drop the `showDesktopOnlySettings ? … : null`
wrapper. That file is owned by `patches/settings-nav-web-parity.diff` (shared dependency #1 and #7 —
it is already in flight there for `computer-use`, `mobile` and `browser`; its working copy leaves the
`orca-account` block as context, so the hunk is free). The pane text belongs elsewhere:
`OrcaAccountSettingsPane.tsx` is an upstream file owned by **no** patch today, and
`web-share-surfaces.diff` is its natural owner — it already carries `ArtifactsSettingsPane.tsx`,
`ShareSkillsSettingsPane.tsx`, the `orcaProfiles` preload block and the `src/main/index.ts` provider
install, i.e. the whole account story. Two rows to add, both from data already on the wire:
`authStatus.persistence === 'memory-only'` → "this server cannot store your session; you sign in
again after each restart", and `credentialError` when set. Do not put them in the nav patch — one
patch per file.

**2 — `orcaProfiles.signOutCurrent` over the wire.** Extend
`src/main/orca-profiles/orca-profile-auth-registry.ts` (overlay, ours) with a second provider,
register the method in `src/main/runtime/rpc/methods/sharing-surfaces.ts` (overlay, ours), install it
next to the existing `setOrcaProfileAuthStatusProvider` call in `src/main/index.ts`
(`web-share-surfaces.diff` already owns that hunk), and route the preload's `signOutCurrent`
to `callRuntimeResult` (same patch owns those lines). The registry's header says read-only by design
— that sentence has to change with it, and the `sharing-surfaces.test.ts` "exports exactly the two
methods" assertion is the test that will fail first, which is the right failure.

**3 — sign-in.** Same registry/method/preload path for `connectCurrent` and `refreshAuth`, plus the
opener. Four things decide the shape:

- **The ratchet.** `connectCurrent`'s host implementation imports `electron` (`shell` in
  `profile-cloud-pkce.ts:3`, `app` in `profile-cloud-auth-config.ts:1`, `safeStorage` in the session
  store). The registry indirection is not decoration, it is what keeps
  `config/runtime-electron-baseline.txt` empty; run
  `node config/scripts/check-runtime-electron-ratchet.mjs` before believing any shortcut.
- **The opener goes behind a port**, per the ratchet's own message ("put the Electron facility behind
  a port in `src/main/host/`"). Swapping `shell.openExternal` for a host-browser open inside
  `profile-cloud-pkce.ts` is a patch on an upstream file; the fallback order that upstream would
  accept is *system browser first, Orca's own browser when `openExternal` fails or is unavailable*.
- **It cannot be one blocking call.** `AUTH_TIMEOUT_MS` is 5 minutes
  (`profile-cloud-pkce.ts:18`) and `callRuntimeResult` would hold one of the eight foreground slots in
  `RuntimeRpcCallQueuePool` (`src/shared/runtime-rpc-call-queue.ts:4`) for that whole window. Split it:
  `orcaProfiles.beginSignIn` returns once the host browser has the authorize URL, and the pane polls
  `authStatus` (it already has `fetchOrcaProfileAuthStatus`) until `state` flips.
- **Nothing here goes on `MOBILE_RPC_METHOD_ALLOWLIST`.** `connectCurrent` mints a credential and
  `signOutCurrent` revokes one host-wide; both are exactly the AGENTS.md category. `authStatus` is
  already off it — grep of `runtime-rpc.ts` and `web-share-mobile-scope.test.ts` returns no
  `orcaProfiles` entry — and that is the precedent to keep.

Blocking the whole of step 3: **one real sign-in attempt**, per `N3`. If the identity provider
refuses Orca's browser, rung 1 is dead and rung 2 (operator pastes the code back; PKCE makes a
stolen code useless) is what ships. That is a 10-minute test with real credentials, not a code
change, and it should happen before anyone writes step 3.

## Blocks this shares with other sections

From `00-sections.md`'s shared-dependency list:

- **#1, `Settings.tsx:343` and its 11 JSX gates** — the same one-line deletion `computer-use`
  (`:1317`), `mobile` (`:1417`), `browser` (`:1571`), `ssh` (`:1751`) and `plugins` (`:1855`) need,
  and the same file `mobile-emulator` (`:1591`) and `developer-permissions` (`:1767`) need moved onto
  the host-platform axis. Eleven agents, one file.
- **#2, the pair invariant** — `orca-account` is the section that proves why gate 1 and gate 2 must
  move together: v4.190.1 moved one and shipped a blank pane through three doors.
- **#7, `patches/settings-nav-web-parity.diff`** owns `Settings.tsx`; `pairing-credentials.diff`
  already holds one hunk in it at `:1744` (the `servers` section). Must not overlap.

Blocks not on that list, found here:

- **The `orcaProfiles` auth bridge** — `orca-profile-auth-registry.ts` +
  `sharing-surfaces.ts` + shipped `web-preload-api.ts:577`. Shared with **`artifacts`** and
  **`share-skills`** (both settings panes read `orcaProfileAuthStatus` and both render their own
  "Sign in to Orca" button through the same `connectCurrentOrcaProfile` store action — so **the
  step-3 fix repairs a dead button in three panes at once, and the step-2 fix repairs a lying one in
  three**) and with the **Artifacts page**, which is not a settings section but is where
  `openSettingsTarget({pane:'orca-account'})` is called.
- **RuntimeBrowserCommandsFactory / the `browser.*` RPC family** — shared with the **`browser`**
  section, whose `BrowserSessionCookiesSection` needs `browser.session*` from the same backend, and
  whose cookie-profile import is `N3`'s one untested lever if Google refuses Orca's browser. A change
  that makes the offscreen browser backend richer serves both.
- **SecretStore** — shared with **`advanced`** (the proxy URL is a protected secret) and with
  `integrations`' Jira and Linear credential stores. Every one of them is `memory-only` on a host
  with no keyring, and every one of them needs the same sentence in front of the operator. Whatever
  wording lands in this pane should be the one the others reuse.
- **The runtime-electron ratchet and the provider-registry pattern** — shared with any pane whose
  host function imports `electron`: **`advanced`** (`app.relaunch`), **`notifications`**
  (**RuntimeDesktopSurface**), **`developer-permissions`**. `orca-profile-auth-registry.ts` and
  `usage/usage-store-registry.ts` are the two worked examples in the tree.
- **`MOBILE_RPC_METHOD_ALLOWLIST`** — shared with **`mobile`**. Anything added for sign-in stays off
  it, for the same reason `mobile.createPairingOffer` is off it.

Sections **fixed** by a working sign-in: `artifacts` (`artifacts.publish` answers
`{status:'reconnect-required'}` on this host today, measured in `L1-live-check.md` L1b) and
`share-skills` (`skills.share` behind the same account). Sections **broken** by opening gate 2
carelessly: none directly, but the false sign-out would then be reachable from the tile, and the
account it silently fails to clear is the one `artifacts` and `share-skills` depend on.

## Unverified

- **The live value of `orcaProfiles.authStatus` over the wire on v4.190.1.** `00-sections.md` lists
  it among the probes phase 0 ran but records no returned value. I derived the value from the host
  inputs instead (profile index, absent session file, packaged defaults, no `ORCA_CLOUD_*` env), all
  of which I read directly. **Probe that settles it:** in the tile, `await
  window.api.orcaProfiles.authStatus()` — expect
  `{activeProfileId:'local-default', configured:true, state:'local', persistence:'none'}`.
- **`app.isPackaged === true`** is inferred from `resources/app.asar` existing under the running
  `squashfs-root`, not observed. It is what makes `configured: true`, and therefore what makes the
  Sign in button enabled rather than greyed. **Probe:** the same `authStatus` call — `configured`
  answers it.
- **Whether the pane draws correctly once gate 2 opens.** Nothing was built, assembled or run here:
  no `quilt push`, no `mise run up`, no `vitest`. The render above is read off the component, not
  seen. **Probe:** open Settings > Orca Account in a build with the gate open and read
  `[data-settings-section="orca-account"]`.
- **The error toast on Sign in.** Traced through preload → store → `toast.error`; not observed.
- **The false sign-out** is a source reading of shipped `web-preload-api.ts:738` plus
  `orca-profiles-auth-actions.ts:156-166`. It cannot be observed on this host, because reaching it
  requires a host session and the host has none. Nobody should create one to test it.
- **`disallowed_useragent`.** The dispatch states as established that Google refuses Orca's browser
  with it. The document in this tree does not: `N3-orca-account-sign-in.md` records it as the **one
  open risk**, explicitly untested, and says to settle it with one real sign-in attempt before
  writing code. I did not re-test it and I cannot reconcile the two from here. Treat the untested
  reading as the safe one — if it is in fact established, `N3` needs correcting and rung 2 becomes
  the design rather than the fallback.
- **Orca Relay**, one of the three benefits the pane advertises, draws its token from
  `relayTokenEndpoint` in the same cloud auth config — so it is account-gated. Whether the `mobile`
  or `servers` panes change behaviour once a session exists was not traced.
- **The queue effect of a 5-minute blocking RPC** is read from
  `runtime-rpc-call-queue.ts` (foreground concurrency 8, per environment); not measured.
- **The uncommitted working copy** of `patches/settings-nav-web-parity.diff` was read but not run. It
  opens gate 2 for `computer-use`, `mobile` and `browser` and leaves the `orca-account` block as
  context — read off the hunk headers, not confirmed by applying it.
