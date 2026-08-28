# share-skills — what it needs to work in the browser

## State today

Listed and reachable on the deployed `v4.190.1`. Only gate 4 applies, at
`ShareSkillsSettingsPane.tsx:103,125,136,155,202` (shipped numbering; pristine `:91,102,106,128,139,158,205`).
`patches/web-share-surfaces.diff` removed the two `isWebClient` sites at pristine `:91,102` and left the rest.

What the operator sees in the tile:

| block | tile @ v4.190.1 | desktop |
| --- | --- | --- |
| "Unlisted skill links" blurb | renders | same |
| "Allow agents and the Orca CLI to publish skill links" | **writable**, lands on the host | writable |
| "Show Skills Button" | **absent** — `!isWebClient` (`:103`) | present |
| "Sign in to share skills" | renders with the web copy "Publishing and link management are available in the Orca desktop app." and **no button** (`:125,136`) | renders with a working **Sign in to Orca** button |
| "Active shared links" → **Manage in Skills** | **absent** — `signedIn && !isWebClient` (`:155`) | present once signed in |
| the four how-to steps | render | same |
| **Open Skills** button | **absent** — `!isWebClient` (`:202`) | present |

Measured on the host (`coder ssh pink-planarian-96`, read-only, nothing written):

- `/home/coder/.config/orca/orca-data.json` → `settings.agentSkillSharingEnabled` **absent**. Default
  is `false` (`shared/constants.ts:281`), so publishing is refused device-wide
  today for every caller. The writable toggle has never been used.
- `/home/coder/.config/orca/orca-profile-index.json` → one profile, **no `cloud` key**. No Orca account
  is signed in on this host. Structure only was printed; no token or identity value was read.

Contrast with desktop: `OrcaAccountSettingsPane.tsx:176` lists **Skill sharing** under "Included with
your account". That is not marketing copy — it is the code path. Every publish call goes through
`SkillCloudService.withAuth` → `runSkillCloudOperation` (`src/main/skills/skill-cloud-auth.ts`), which
returns `{status:'unconfigured'}` with no cloud auth config and `{status:'reconnect-required'}` with no
live session. **Account state gates the capability, not just the UI.**

## Which gate, and why

**Gate 4 only.** `ShareSkillsSettingsPane.tsx:21` `const isWebClient = isWebClientLocation()`, consumed
at `:103,125,136,155,202`.

- Gate 1 — the nav builder: the `share-skills` entry is ungated, `group: 'workflows'`, no
  `showDesktopOnlySettings`, in both pristine and the file `settings-nav-web-parity.diff` rewrites.
  `settings-nav-web-parity.diff` does not touch it.
- Gate 2 — `Settings.tsx:1462-1472`: the `<SettingsSection id="share-skills">` is ungated. It is not one
  of the 11 blocks behind `Settings.tsx:343`.
- Gate 3 — not applicable.

Order, if the pane is finished: gate 4 cannot be opened first. Three of its five sites lead to
`window.api.skills` members the web preload rejects, and a fourth leads to sign-in. **The wires come
first; gate 4 closes last, per site.** The one site that could open today is `:103` (Show Skills
Button) — see below.

## What the pane actually needs

| wire | needed by | exists today? | how established |
| --- | --- | --- | --- |
| `settings.updateSharingCapabilities` | the publish toggle | **exists** — `src/main/runtime/rpc/methods/sharing-surfaces.ts` (overlay), on `ALL_RPC_METHODS`, off `MOBILE_RPC_METHOD_ALLOWLIST` | read the overlay file and the `runtime.updateClientSettings` Pick widened in `orca-runtime.ts:3999` |
| host read-back of `agentSkillSharingEnabled` | the toggle showing what the host enforces | **exists** — mirrored on every `settings.get` (`web-preload-api.ts:4265-4270`) | read the shipped preload |
| `orcaProfiles.authStatus` | `signedIn`, the sign-in block | **exists** — same overlay file; the desktop provider is registered at `src/main/index.ts` beside `setSkillCloudService` | read the patch hunk and the overlay |
| an Orca Cloud **session on the host** | every publish, every link listing | **absent on this host** — no `cloud` key in the profile index | measured, above |
| a way to *start* sign-in from the tile | the missing Sign in button (`:136`) | **absent** — `orcaProfiles.connectCurrent` returns `{status:'failed'}` with an explanatory message (`web-preload-api.ts`, patched). Route designed and the loopback round trip driven end to end, but not built | `docs/audit/v1.4.190/N3-orca-account-sign-in.md`; blocks **RuntimeBrowserCommandsFactory** (`browser.tabCreate`/`browser.goto`) |
| **SecretStore** | a session that survives a `serve` restart | **absent behaviour** — `safeStorage.isEncryptionAvailable()` is false with no keyring and a packaged build refuses the plaintext branch, so `saveOrcaCloudSession` falls to memory | N3, "What the pane must say" |
| `skills.prepareShare` / `publishShare` / `cancelShare` / `releaseShare` / share-progress | the Skills page's publish dialog, which is where all four how-to steps land | **absent as RPC.** Electron-only `ipcMain` handlers: `src/main/ipc/skill-cloud-ipc-handlers.ts:58,74,84,87`. Web preload rejects `prepareShare`/`publishShare` and no-ops `cancelShare`/`releaseShare`/`onShareProgress` (`web-preload-api.ts:3369-3372,3428`) | read `skill-cloud-ipc-handlers.ts` and the shipped `createSkillsApi` |
| `skills.listOwnedShares` / `revokeShare` / `getPackage` / `deletePackage` | "Manage in Skills" → the shared-links view | **absent as RPC.** `runtime.listOwnedSkillShares` (`orca-runtime.ts:5145`) exists and is Electron-free; only the `ipcMain` binding (`skill-cloud-ipc-handlers.ts:277`) is not. Web preload rejects all four | same |
| `skills.share` | the one-shot publish the CLI and agents use | **exists** — `rpc/methods/skills.ts`, paired-client refusal lifted by `web-share-surfaces.diff`, on the mobile allowlist | read the patch hunk and `skills.ts` |
| `skills.discover` | the selector list any publish needs | **exists**, routed in the web preload (`createSkillsApi.discover`) and mobile-allowlisted | read the shipped preload |
| **AppEnvironment** `getPath('userData')` | an RPC-side `SkillSharePreparationService` | **exists** — `orca-runtime.ts:executeAgentSkillShare` already constructs one that way | read `orca-runtime.ts:5065-5078` |
| `showSkillsButton` write | the hidden `:103` row, and the only sidebar route to the Skills page | **absent from both write paths** — not in `SettingsUpdate` (`client-ui-schemas.ts:128`, `.strict()`) and not in the six `syncRuntimeBackedSettings` keys. Default `false` (`shared/constants.ts:283`) | key-searched both lists |

No member of this pane resolves through `createFallbackProxy`: `skills`, `settings` and `orcaProfiles`
are all explicit keys in the web preload, so every result above is a real routed call or an explicit
rejection, not a silent `undefined`.

**Consequence for the how-to.** `SidebarNav.tsx:169` is **not** client-gated — it renders whenever
`settings.showSkillsButton === true`. But the pane's row for it is hidden on web (`:103`) and the
**Open Skills** button is hidden (`:202`), so on a fresh tile there is **no route to the Skills page at
all**, and the four rendered steps ("Open Skills, choose Share skills…") name a screen the operator
cannot reach. `SkillsPage.tsx` itself carries no `isWebClientLocation()` — it renders on web; its
publish dialog throws at `window.api.skills.prepareShare` and its shared-links view at
`listOwnedShares`.

**The one route that works from the tile today**: an Orca terminal runs on the host, so
`orca skills share` in it reaches `skills.share` locally. `rejectForwardedSkillFilesystem`
(`src/cli/handlers/skill-sharing.ts:44`) only refuses when `ORCA_CLI_CWD` is set (WSL launcher, SSH
passthrough) or the client is remote — neither holds. It still needs the toggle on and an account:
`requireCloudOperation` (`:75`) turns `reconnect-required` into "Sign in to Orca and try again."

## Verdict

**Works partially.** The device-wide grant works end to end from the tile and lands on the host — that
half is done and measured. Publishing itself does **not** work from the tile:

1. **No Orca account can be obtained from the browser.** Sign-in cannot be started (`connectCurrent`
   refuses by design), and without a host session every cloud call answers `reconnect-required`. This
   gates the capability, not the UI — the desktop's "Included with your account" is literal.
2. **No publish UI is wired.** `prepareShare`/`publishShare` and the whole cloud-management rail exist
   only as `ipcMain` channels; the tile's Skills dialog throws on the first call.
3. **The Skills page is unreachable from a fresh tile**, so even the desktop's own instructions do not
   apply.

Nothing here is browser-impossible. It is three missing wires and one account, in that order.

## Size of the work

Three separable pieces. None of them is this pane.

**A. Reach the Skills page (smallest, self-contained).** Drop `!isWebClient` at `:103` so the tile can
turn the sidebar button on. `showSkillsButton` is not in `SettingsUpdate` and not in the
`syncRuntimeBackedSettings` allowlist, so the write stays in this browser's localStorage — which is
enough, because `SidebarNav` reads the same local store. Per-browser, not per-host; say so in the row's
description rather than pretending otherwise. Extends `patches/web-share-surfaces.diff` (it already owns
`ShareSkillsSettingsPane.tsx`). One hunk. Covered by extending
`src/renderer/src/components/settings/share-surface-panes-web.test.tsx`.

**B. The publish rail over the wire.** A new `src/main/runtime/rpc/methods/skill-sharing.ts` in the
**overlay** carrying `skills.prepareShare`, `skills.publishShare`, `skills.cancelShare`,
`skills.releaseShare`, a `skills.shareProgress` subscription, and the management reads
`skills.listOwnedShares` / `revokeShare` / `getPackage` / `deletePackage`. The service behind them,
`SkillSharePreparationService`, is already Electron-free; only two things in
`skill-cloud-ipc-handlers.ts` are not, and both have ports:
`app.getPath('userData')` → `getAppEnvironment().getPath('userData')`, and the `BrowserWindow`
progress broadcast → the RPC subscription rail (`client.subscribe`, `web-preload-api.ts:1758`). This is
the **Modules split out of `src/main/ipc/*`** seam. Then route the nine members in `createSkillsApi`
(`web-preload-api.ts:3369-3428`) and drop `!isWebClient` at `:155,202`. Extends
`web-share-surfaces.diff` for the preload and `rpc/methods/index.ts`; the new methods file is `src/`.
Allowlist decision required: prepare/publish stage bytes on the host, so they belong with the **install**
rail — off `MOBILE_RPC_METHOD_ALLOWLIST` — not with `skills.share`.
**Note:** `MOBILE_RPC_METHOD_ALLOWLIST` admits no apostrophe, comments included
(`mobile-rpc-allowlist.test.ts` parses it by single-quoted string).

**C. Sign-in from the tile.** Rung 1 of `N3-orca-account-sign-in.md`: replace
`shell.openExternal(authorizeUrl)` in `beginOrcaCloudPkceFlow` with `browser.tabCreate`/`browser.goto`
when no system browser exists. Its one open risk — whether Google refuses OAuth in
`agent-browser-linux-x64` — is settled by one real sign-in attempt, not by code. Then drop `!isWebClient`
at `:136` and replace the `:125` web copy with the honest one: **the session is memory-only; you sign in
again after every `serve` restart** (SecretStore falls back to memory with no keyring). New patch or an
extension of `web-share-surfaces.diff` — it already owns `orcaProfiles.connectCurrent` in the preload.

Order: C gates whether B produces anything; A is independent and can land alone. A pane that renders
publish controls with no account is worse than the honest refusal shipped today.

## Blocks this shares with other sections

From `00-sections.md`'s shared-dependency list:

- **(7) `patches/web-share-surfaces.diff`** — owns `ShareSkillsSettingsPane.tsx` *and*
  `ArtifactsSettingsPane.tsx`. **`artifacts`** is the same work with the same shape: same
  `settings.updateSharingCapabilities` wire, same `orcaProfiles.authStatus`, same account gate
  ("Artifact sharing" is the sibling account benefit at `OrcaAccountSettingsPane.tsx:152`). Anything
  done to the toggle, the auth status or the sign-in copy here must be done there in the same hunk set.
  `artifacts` is *ahead* of this section: `artifacts.*` already has a full RPC family, so it needs only
  C, not B.
- **(3) `syncRuntimeBackedSettings` / (4) `SettingsUpdate` `.strict()`** — this pane deliberately sits
  *beside* both: the grant travels on its own method, off `SettingsUpdate` and off the mobile
  allowlist. That property is the reason `settings.update` staying phone-reachable is safe, so any
  section widening (3) or (4) — **browser**, **notifications**, **advanced**, **appearance**, **input** —
  must not fold these two keys back in. `showSkillsButton` (piece A) *is* on that collision list.
- **(5) `createFallbackProxy`** — does not apply here; every namespace this pane touches is explicit.
  Recorded because the absence is the evidence.

Found here, not in that list:

- **`orca-account`** (listed-and-blank, gate 2) — the same sign-in, the same `orcaProfiles.authStatus`,
  the same SecretStore memory-only session. Piece C fixes this pane, `artifacts` and `orca-account` at
  once; without it all three are stuck at the same place. `orca-account` must open gate 2 first.
- **`ssh`** and **`plugins`** — the same seam as piece B: a rail that exists only as `ipcMain` handlers
  or as a half-registered method family, needing the write half added under **Modules split out of
  `src/main/ipc/*`**. Different files, one pattern; whoever builds the first should establish it.
- **SecretStore** — shared with `orca-account` and **advanced** (the proxy URL is a protected secret).
  Solving durable at-rest secrets on a keyring-less host fixes the "sign in again after every restart"
  in all three.
- **The Skills page** (`SkillsPage.tsx`, not a settings section, so not in the 35) — piece B is what
  makes it work; piece A is what makes it reachable. This pane is its front door and no other section
  covers it.

## Unverified

- **Nothing was rendered.** The tile was not driven in this pass. The block-by-block table under "State
  today" is derived from the shipped `ShareSkillsSettingsPane.tsx` in the assembled tree plus
  `00-sections.md`'s live "renders partially" measurement — it is not a per-element observation.
  Probe that would settle it: open Settings → Share Skills in the tile and read the pane's DOM for the
  three headings `Show Skills Button`, `Active shared links`, `Open Skills`.
- **The toggle write was not exercised.** The host store shows `agentSkillSharingEnabled` absent, which
  proves it has never been set — not that setting it works. The patch's own test covers the preload
  routing, not the round trip. Probe: flip the toggle in the tile, then re-read
  `settings.agentSkillSharingEnabled` from `orca-data.json` on the host. **Writes to the deployed host —
  needs the operator's go-ahead.**
- **A rejected grant leaves the toggle looking on.** `web-preload-api.ts` calls
  `settings.updateSharingCapabilities` outside the `try/catch` that covers the rest of
  `syncRuntimeBackedSettings`, `settings.set` has already written the optimistic value to localStorage
  (`:817`), and the store's `updateSettings` swallows the rejection with `console.error`
  (`store/slices/settings.ts:224`). Read from source; not observed. Self-corrects on the next
  `settings.get`, which mirrors the host value.
- **`getOrcaCloudAuthConfig().configured`** was not read on the host. Taken from the patch header's
  claim that the host *is* configured. If it is not, the failure mode is `unconfigured`, not
  `reconnect-required` — different message, same outcome.
- **`skills.share` was not called.** It publishes, which is an outward-facing write; deliberately not
  probed. Its refusal path with no account is read from `skill-cloud-auth.ts` and
  `cli/handlers/skill-sharing.ts:75`.
- **The host `orca` shim on `PATH`** (`/home/coder/.local/bin/orca`) points at
  `/home/coder/nav-fix-test/squashfs-root/resources/bin/orca-ide`, which does not exist — the shim is
  stale, unrelated to this section, and left alone. `orca skills share` was therefore never invoked;
  the "works from a host terminal" claim is a source reading, not a run.
- **Piece B's allowlist decision** (prepare/publish off `MOBILE_RPC_METHOD_ALLOWLIST`) is a
  recommendation from the existing install-rail rationale, not a tested boundary.
- **No gate was run.** No `quilt push`, no `mise run up`, no `vitest`, no build; nothing in the tree was
  edited.
