# artifacts — what it needs to work in the browser

Paths relative to `lib/orca/`; line numbers are the shipped tree (`patches/series` applied at
`v4.190.1`) unless marked pristine, in which case they are
`git -C lib/orca show v1.4.190:<path>`. Live probes are on the operator's Coder workspace
`ceo/pink-planarian-96` (`orca-server` 4.190.1, upstream pin `v1.4.190`, Linux), reached over
`coder ssh` only. No browser was started and no tab was opened.

## State today

**Tile, published v4.190.1: renders partially.** Taken from `00-sections.md`, which measured every
section by driving the deployed tile. Not re-measured here.

**Nothing in the shipped pane can be dropped by client.** `ArtifactsSettingsPane.tsx` on the shipped
tree has no `isWebClientLocation()` call and does not import it: `web-share-surfaces.diff` deletes
the import and the `const isWebClient` binding (pristine `:9`, `:27`), and rewrites the three
branches that read it. `git diff v4.190.1 -- patches/web-share-surfaces.diff` is empty, so the pane
I read is the pane that ships. Every remaining branch turns on `sharingEnabled`
(`settings.artifactSharingEnabled`) or `signedIn` (`authStatus.state === 'connected'`) — host state,
identical on both clients. **The tile and a signed-out desktop render the same four blocks.** What
is partial is capability, not render; the rows below say which.

What the tile shows, block by block, with the live host state that decides it:

| block | tile @ v4.190.1 | live | established by |
| --- | --- | --- | --- |
| "Allow publishing public artifact links" | renders, **live**, writable | off | host store `artifactSharingEnabled: false`, read on the host; write path in `web-share-surfaces.diff` |
| "Show Artifacts Button" | renders, **live in this browser only** | off | absent from `SettingsUpdate` and from `syncRuntimeBackedSettings` — key search, both files |
| "Sign in to share artifacts" + **Sign in to Orca** | renders, button **enabled**, **cannot succeed** | profile `local-default`, `kind: "local"`, no `cloud` key | `~/.config/orca/orca-profile-index.json` on the host; `connectCurrent` in the web preload |
| "How to use Artifacts" + **Open Artifacts** | renders, live, 4 steps incl. "Enable artifact sharing" | sharing off, so the enable step is shown | `ArtifactsSettingsPane.tsx:37-52`; `openArtifactsPage` is renderer state only (`store/slices/ui.ts:1535`) |

**Desktop, for contrast.** Identical, with one difference in outcome: `connect()` there runs
`beginOrcaCloudPkceFlow` and `shell.openExternal`, and can end at `state: 'connected'`. A
signed-out desktop draws the same sign-in block.

**Two things the operator is told that are not true.**

1. **The "Sign in to Orca" button is enabled and can never succeed.**
   `disabled={connecting || authStatus?.configured !== true}` (`:124`). `configured` is
   `configState.configured || devAuthEnabled` (`profile-cloud-auth-status.ts:12`); a packaged build
   falls back to `PRODUCTION_API_BASE_URL` + `PRODUCTION_CLIENT_ID`, so it is `true` with no env
   vars at all (`profile-cloud-auth-config.ts:78-89`). The host runs
   `squashfs-root/resources/app.asar.unpacked/out/cli/index.js` — a packaged Electron app, measured
   from its process line — so `app.isPackaged` is true. Clicking calls
   `orcaProfiles.connectCurrent`, which `web-share-surfaces.diff` makes return
   `{status: 'failed', error: 'Signing in to Orca must be completed on the server host…'}`; the
   store turns that into `toast.error('Failed to connect profile')` with that description
   (`store/slices/orca-profiles-auth-actions.ts:99-103`). Honest **after** the click; the enabled
   button promises a capability that does not exist.
2. **The host CLI names a screen this host does not have.** Measured on the host, with the toggle
   off:

   ```text
   $ orca-ide artifacts share /tmp/does-not-exist.md --json
     code    "artifact_sharing_disabled"
     message "Publishing artifacts is off for this device. …"
     nextSteps[0] "Open Settings → Artifacts in the Orca desktop app on this device."
   ```

   `ARTIFACT_SHARING_DISABLED_NEXT_STEPS` (`shared/artifact-sharing-gate.ts:12-16`) is unpatched.
   On orca-server there is no desktop app, and since v4.190.1 the tile is exactly where that toggle
   lives. Reached from `cli/handlers/artifacts.ts:102`, whose preflight is a `settings.get` read
   that runs before the file read — so this probe published nothing and read nothing but settings.

**The publish path itself answers.** Measured over the same runtime RPC the tile uses:

```text
$ orca-ide artifacts list --json
  code    "authentication_required"
  message "Sign in to Orca and try again."
```

Not `Artifact service is unavailable.` — so `ARTIFACT_METHODS` is dispatched,
`runtime.listArtifacts` resolves, and `ArtifactCloudService` is installed
(`main/index.ts:2847-2851`, `orca-runtime.ts:5756`). The account is the only thing missing.

## Which gate, and why

**None of the four.** This section is the one pane in the "renders partially" column whose gate is
already open.

- **Gate 1** — `artifacts` is a plain entry in the nav array
  (`useSettingsNavigationMetadata.ts:359-369`), outside every `showDesktopOnlySettings` spread. Not
  touched by `settings-nav-web-parity.diff`.
- **Gate 2** — its `<SettingsSection id="artifacts">` (`Settings.tsx:1439`, shipped) is outside all
  11 `showDesktopOnlySettings` JSX blocks.
- **Gate 3** — `setup-guide` only.
- **Gate 4** — applied in pristine at `ArtifactsSettingsPane.tsx:27` and was **removed** by
  `web-share-surfaces.diff` at v4.190.1. `00-sections.md`'s "why" column cites that pristine line;
  it does not exist in the shipped build.

What is left is not a gate. It is one missing wire, `orcaProfiles.connectCurrent`, and one setting
that never leaves the browser.

## What the pane actually needs

| wire | state today | how established |
| --- | --- | --- |
| `settings.updateSharingCapabilities` (overlay `src/main/runtime/rpc/methods/sharing-surfaces.ts`) — the grant | **exists**, runtime-scope only, `.strict()`, deliberately off `MOBILE_RPC_METHOD_ALLOWLIST` | read the overlay method; the write path is `syncRuntimeBackedSettings` in `web-share-surfaces.diff` |
| `orcaProfiles.authStatus` (same overlay file) — the read | **exists**; reaches `getCurrentOrcaProfileAuthStatus` through `orca-profile-auth-registry.ts`, installed at `main/index.ts:2852-2856` | read the overlay method and the `index.ts` hunk |
| `orcaProfiles.connectCurrent` — starting sign-in | **absent over the wire**, and the web preload refuses with a reason. No RPC method exists in `SHARING_SURFACE_METHODS`; upstream has it only as an `ipcMain` channel a headless host has no renderer for | read both files; there is no `orcaProfiles.connect*` entry anywhere in the RPC method tables |
| `artifacts.list` / `getPublishedLink` / `share` / `publish` / `update` / `unshare` / `delete` (`ARTIFACT_METHODS`) | **exist and dispatch** — and are on `MOBILE_RPC_METHOD_ALLOWLIST` as of `web-share-surfaces.diff` | probed over the wire on the host; the failure was `authentication_required` from the service, not `Artifact service is unavailable` from `requireArtifactService` |
| preload namespace `window.api.artifacts` | **does not exist, and is not needed.** `useArtifactPagination.ts:81`, `artifact-publish-flow.ts:51` and `artifact-published-link-client.ts` call `callRuntimeRpc({kind:'local'}, …)` directly, bypassing the preload — the same pattern the Mobile Emulator pane uses | key search of `web-preload-api.ts` for `artifacts`: one comment, no namespace; then read the three call sites |
| **SecretStore** (`00-building-blocks.md`) — a durable session | **absent on this host.** `~/.config/orca/profiles/local-default/orca-secret-protection.json` reads `"The OS keyring is unavailable, so secrets are stored unencrypted."`; `allowsPlaintextOrcaCloudSession()` is false in a packaged build (`profile-cloud-auth-config.ts:127-133`), so `saveOrcaCloudSession` lands at `persistence: 'memory-only'` (`profile-cloud-session-store.ts:135`) | read the file on the host; read both source paths |
| `settings.updateSharingCapabilities` carrying `showArtifactsButton` | **absent.** The key is in `GlobalSettings` (`global-settings-types.ts:234`, default `false`) and in **neither** `SettingsUpdate` (`client-ui-schemas.ts`, `.strict()`) nor the `syncRuntimeBackedSettings` allowlist | key search of both files; host store confirms `showArtifactsButton: false` |
| **RuntimeBrowserCommandsFactory** — `browser.tabCreate` / `browser.goto`, the sign-in route | **exists and is driven**; `N3-orca-account-sign-in.md` records a real round trip through the host's own `agent-browser-linux-x64` to a loopback callback | read `N3`; not re-measured |

"Registered in `ALL_RPC_METHODS`" was not used as evidence anywhere above. The `artifacts.*` claim
is an over-the-wire probe on the deployed host; the preload claims are absence-of-namespace plus the
call sites that make the namespace unnecessary.

## Verdict

**Works partially — the toggle and the publish rail are live; sign-in is missing, and one setting
never leaves the browser.**

Missing, exactly:

1. **`orcaProfiles.connectCurrent` has no wire.** Everything downstream of an account works:
   `artifacts.*` dispatches, the publish button appears in the editor header
   (`EditorPanelHeader.tsx:319`) and the browser-pane toolbar
   (`browser-page-toolbar.tsx:276`) with no client gate, its "Open Artifacts settings" link reaches
   this pane, and the Artifacts page renders unconditionally
   (`app-shell/AppWorkspaceShell.tsx:73`). `publishArtifactFromSurface` calls
   `ensureArtifactAccountConnected()` first (`artifact-publish-flow.ts:46,96-102`), which calls
   `connectCurrentOrcaProfile()`, which refuses. **Sign-in is the single blocking edge between this
   pane and a published artifact.**
2. **Even once signed in, the session is memory-only** — gone on every `serve` restart, and the pane
   says nothing about it.
3. **"Show Artifacts Button" writes to this browser's `localStorage` and stops there.** It does what
   it says in the browser that set it; the host store, the CLI and every other browser keep `false`.
4. **The CLI's denial message names a desktop app this host does not run** — measured above.

## Size of the work

**(1) Sign-in — a new patch, the largest piece.** `N3-orca-account-sign-in.md` rung 1: keep
`beginOrcaCloudPkceFlow` and replace its single `shell.openExternal(authorizeUrl)` with
`browser.tabCreate`/`browser.goto` when no system browser exists, then add an
`orcaProfiles.connectCurrent` RPC beside `authStatus` in the overlay's
`rpc/methods/sharing-surfaces.ts` and route the web preload's `connectCurrent` to it instead of
returning `failed`. Files: `main/orca-profiles/profile-cloud-pkce.ts:139` (the `openExternal`
call), `src/main/runtime/rpc/methods/sharing-surfaces.ts` (overlay, extend), and
`renderer/src/web/web-preload-api.ts` (patch hunk). This is a **new patch**, not an extension of
`web-share-surfaces.diff`: that patch's header states in its own words that sign-in is not built and
why, and its scope is the two capability toggles. **Its one open risk is untested** — whether the
IdP refuses OAuth in Orca's Chrome/150 backend. Settle that with one real sign-in before writing
code.

**(2) Session persistence — not a patch here.** Either install a keyring on the host (deployment,
outside Orca's source) or accept memory-only. If memory-only is accepted, the pane must say so:
one line of copy in `ArtifactsSettingsPane.tsx`, which `web-share-surfaces.diff` already owns.

**(3) `showArtifactsButton` — extend `web-share-surfaces.diff`.** Add it to
`SharingCapabilitiesUpdate` in the overlay method and to the `capabilityUpdates` block in
`syncRuntimeBackedSettings`, or seed it read-only in `getRuntimeBackedStoredSettings` alongside
`artifactSharingEnabled` (`web-preload-api.ts:4263-4269`, pristine `:3928`). It is sidebar
visibility, not a capability — decide device-wide vs per-browser first. **Not** by widening
`SettingsUpdate`: that schema is mobile-reachable (shared dependency 4).

**(4) The CLI denial message — a one-hunk patch.** `shared/artifact-sharing-gate.ts:12-16`. No patch
owns that file today. The correct wording points at Settings → Artifacts in the tile, not at a
desktop app. `orca-patch-audit` decides whether it joins `web-share-surfaces.diff` (same capability,
same header) or stands alone.

**(5) The stale comment left by our own patch.** `web-preload-api.ts` pristine `:3928` still reads
"`syncRuntimeBackedSettings` never sends it back" — `web-share-surfaces.diff` made that false. One
line, inside the patch that broke it.

## Blocks this shares with other sections

From `00-sections.md`'s shared-dependency list:

- **(3) `syncRuntimeBackedSettings` / `getRuntimeBackedStoredSettings`.** `showArtifactsButton`
  collides here exactly like `browser`'s four keys, and like `notifications`, `advanced`,
  `appearance` and `input`. Whatever mechanism is chosen for those settles this one; a fix that
  widens the allowlist per-key will be written five times unless it is written once.
- **(4) `SettingsUpdate` is `.strict()` and mobile-reachable.** `showArtifactsButton` is verified
  absent from it. Same constraint that stops `advanced` widening the schema for `httpProxyUrl`.
- **(5) `createFallbackProxy`.** Named here for the opposite reason: `window.api.artifacts` does not
  exist, and it does not matter, because the artifacts surfaces call `callRuntimeRpc` directly.
  **`mobile-emulator` uses the same bypass** (`emulator.availability`). Any agent auditing "is the
  preload namespace present" will get a false negative on both sections.
- **(7) `patches/settings-nav-web-parity.diff`.** No conflict: this section needs no hunk in either
  `useSettingsNavigationMetadata.ts` or `Settings.tsx`.

Found here, not in that list:

- **`share-skills` is the same patch, the same RPC method and the same pane treatment.**
  `settings.updateSharingCapabilities` carries both keys; `ShareSkillsSettingsPane.tsx` lost its
  gate-4 site in the same hunk set. Any change to the grant method changes both sections. It does
  **not** share the account: skill publishing goes through `skills.share` on the host, which needs
  no Orca cloud session.
- **`orca-account` is the same blocker.** It is listed-and-blank behind gate 2, but once that opens
  it lands on the identical missing `connectCurrent` wire, the identical
  `profile-cloud-auth-status.ts` producer, and the identical memory-only session. **Building
  sign-in fixes both sections; opening gate 2 for `orca-account` alone fixes neither.**
- **`browser` shares the sign-in route's transport.** N3 rung 1 is `browser.tabCreate` /
  `browser.goto` — the same **RuntimeBrowserCommandsFactory** family whose `browser.session*` half
  the Browser pane needs. N3's untested fallback for an IdP refusal is Browser → Session & Cookies
  cookie import, i.e. that section's feature is this section's contingency.
- **`advanced` shares SecretStore.** Its proxy URL is a protected secret; this section's cloud
  session is another. One keyring decision on the host settles both, and neither can be fixed in
  Orca's source.

## Unverified

- **The live "renders partially" classification was not re-measured.** I read the shipped pane and
  established that no branch in it is client-dependent, which contradicts the reason
  `00-sections.md` gives (a pristine line the shipped patch deletes) but not necessarily its
  observation. **Exact probe:** open Settings → Artifacts in the tile and count
  `[data-settings-section="artifacts"]`'s children against the same pane on a signed-out desktop;
  they should match. If the tile shows fewer, something outside this file is dropping a row and this
  report's gate finding is wrong.
- **`authStatus.configured === true` on the live tile is derived, not read.** The chain is: packaged
  `app.asar` launch (measured on the host process line) → `app.isPackaged` → production client id →
  `configured: true`. I did not observe the value. **Exact probe:** `window.api.orcaProfiles
  .authStatus()` in the tile console, or `orcaProfiles.authStatus` over the wire; expect
  `{configured: true, state: 'local', persistence: 'none'}`.
- **The Sign in button's toast was not observed.** Its text is read from the preload's
  `connectCurrent` and the store's `status === 'failed'` branch. **Exact probe:** click it in the
  tile and read the toast.
- **`showArtifactsButton` was not written from the tile.** Its localStorage-only fate is read from
  two key searches and `settings.set`'s body. No settings write of any kind was made.
- **The publish button was not exercised.** That it renders unconditionally in the editor header and
  browser toolbar is read from source; that it is reachable in the tile is not measured.
- **The IdP question from N3 is still open** and is the one thing that decides whether the sign-in
  work is possible at all.
- **Probes were reads.** `artifacts.list` and `artifacts share` on a nonexistent file — the latter
  denied at the `settings.get` preflight before any file read or publish. Nothing was written, no
  setting mutated, the `serve` process untouched. All other host access was `cat` and `ls` under
  `~/.config/orca`.
- **Nothing was assembled and no gate was run** here: no `quilt push`, no `mise run up`, no
  `vitest`, no build. The shipped tree was read as it stood, with `git diff v4.190.1` used to
  confirm `web-share-surfaces.diff` is unmodified.
