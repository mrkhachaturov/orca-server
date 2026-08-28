# mobile - what it needs to work in the browser

Paths are relative to `lib/orca/` unless they start with `patches/` or `src/`. Line numbers are
`git -C lib/orca show v1.4.190:<path>`; for a file the series rewrites, the patch is cited instead.

## State today

**Published `v4.190.1`, measured (`00-sections.md`):** the sidebar lists **Mobile** in the `setup`
group. Selecting it renders zero `[data-settings-section]` nodes - sidebar, empty content column, no
header and no message.

**Desktop, read from source** (`MobileSettingsPane.tsx`, `MobilePane.tsx`): install links for the iOS
App Store and the Android APK; a **Show Orca Mobile Button** switch; then the pairing block -
connection-path chooser, network-interface/address picker, **Generate**, the QR with a copyable
pairing code, a Windows firewall notice, the paired-device list with **Revoke**, and **Auto-restore
fit**.

**Already reachable in the tile, today, by another door.** The sidebar's *Orca Mobile* button opens
`MobilePage` (`AppWorkspaceShell.tsx:78`, `activeView === 'mobile'`; button at `SidebarNav.tsx:81`,
gated only on `showMobileButton`). It calls the same `window.api.mobile.getPairingQR`
(`MobilePage.tsx:220`) through the same `use-mobile-pairing-generation.ts` hook. Neither is gated on
`isWebClient`.

**Live evidence that the pairing machinery works over the wire on this deployment.**
`/home/coder/.config/orca/orca-devices.json` on `ceo/pink-planarian-96` holds:

| scope | name | lastSeenAt | mobilePairingConnectionMode |
| --- | --- | --- | --- |
| `runtime` | `Web session <date>` (many) | > 0 | - |
| `mobile` | `Mobile 8/18/2026` | `1787919219734` | `local-only` |
| `mobile` | `Mobile 8/18/2026` | `0` (pending) | `local-only` |

A phone minted a credential and **connected** (`lastSeenAt > 0`). `serve` is the headless branch
(`index.ts:3229`) and no `--type=renderer` process exists on the host, so `ipc/mobile.ts` - the only
other non-test caller of `createMobilePairingOffer` - has no caller. `local-only` is what the web
path pins unconditionally. See **Unverified** for the limit on that attribution.

**Branch, not published.** `2db423a` already opens gate 2 for `mobile`
(`patches/settings-nav-web-parity.diff`, hunk at `Settings.tsx:1409-1426`).

## Which gate, and why

**Gate 2 only.** `Settings.tsx:1417` is a standalone `{showDesktopOnlySettings ? ( ... ) : null}`
wrapping the `mobile` `SettingsSection` and nothing else - one condition, one section, one line to
open.

Gate 1 is already open: `patches/settings-nav-web-parity.diff` lists `mobile` unconditionally, which
is exactly what removed the `Settings.tsx:1098` fallback's protection and produced the blank pane.

Gate 3 does not apply. Gate 4 applies *inside* the pane and is already authored:
`patches/pairing-credentials.diff` adds `isWebClientLocation()` branches to
`MobilePairingConnectionOptions.tsx` (path chooser replaced by a one-path notice),
`MobilePairingSetupSection.tsx` (address block hidden, `Generate` no longer gated on a selection),
`MobileRelayBetaNotice.tsx` (hidden), `MobileHeroPairingStep.tsx` (network row hidden) and
`use-mobile-pairing-connection-mode.ts` (mode pinned `local-only`). Those are the reason the pane is
expected to draw correctly rather than half-empty.

## What the pane actually needs

| wire | state | how established |
| --- | --- | --- |
| `mobile.createPairingOffer`, `.listDevices`, `.revokeDevice`, `.getRuntimePairingUrl`, `.listRuntimeAccessGrants`, `.revokeRuntimeAccess` | **exists** - `src/main/runtime/rpc/methods/mobile-pairing.ts` (overlay), added to `ALL_RPC_METHODS` by `pairing-credentials.diff` | read the overlay; each handler throws `trusted_mobile_pairing_unavailable` without `ctx.trustedMobilePairing` |
| authorization: `ctx.trustedMobilePairing`, injected only for `device.scope === 'runtime'` | **exists and is satisfied by the tile** | `pairing-credentials.diff` injects it in `OrcaRuntimeRpcServer`; `buildTrustedSessionOffer` mints web sessions with `scope: 'runtime'`. Live registry shows `scope=runtime name='Web session …'` |
| preload namespace `window.api.mobile` | **real for those six**; `listNetworkInterfaces` → `{interfaces: []}`, `getWindowsFirewallStatus` → `{supported:false}`, `getRelayStatus` → `offline` are deliberate constants, not stubs standing in for a missing wire | `pairing-credentials.diff`, `web-preload-api.ts` hunk |
| QR encoding in the browser | **exists** - `src/renderer/src/web/web-mobile-pairing-qr.ts` (overlay) with the geometry shared from `src/shared/mobile-pairing-qr-geometry.ts` | overlay files present; the main-process encoder reads the same constants |
| the advertised address | **server policy** - `serve --pairing-address`. The live host passes the workspace's portal URL | `ps -eo args` on the host |
| `ensureNetworkExposure()` must not widen the loopback bind when a phone offer is minted | **handled** - it returns early under `trustedProxy` (`trusted-proxy-session.diff`), and `resolveInitialWebSocketBindHost` returns loopback before it reads any device's reach | read both guards on `rev:patched` |
| `window.api.shell.openUrl` (the two install links) | **real** - `window.open(url, '_blank')` in the web preload | read `createShellApi` |
| `window.api.ui.writeClipboardText` (copy the pairing code) | **real** - `navigator.clipboard.writeText` with an `execCommand` fallback | read `writeWebClipboardText` |
| **Auto-restore fit** persistence | **the pane's wire is absent; the RPC it needs already exists** | see below |
| `showMobileButton` | localStorage only - not in `syncRuntimeBackedSettings`' six keys, not in `SettingsUpdate`, not in `RUNTIME_SEEDED_SETTING_KEYS`. A sidebar preference is per-client, so per-browser is the right scope | read all three lists |

**Auto-restore fit is the one real gap.** `MobilePane.tsx:459` writes it as
`updateSettings({ mobileAutoRestoreFitMs })`. In the tile that goes to `settings.set`, which writes
localStorage and forwards only the six keys in `syncRuntimeBackedSettings`; `mobileAutoRestoreFitMs`
is not one of them and is also absent from `SettingsUpdate` (`client-ui-schemas.ts:128`, `.strict()`).
The host keeps its own value, which the runtime reads as `runtime.getMobileAutoRestoreFitMs()` to
decide whether a disconnected phone's terminal fit is restored. The phone itself reads and writes
that value over `terminal.getAutoRestoreFit` / `terminal.setAutoRestoreFit`
(`rpc/methods/terminal.ts:3813,3820`, both on `MOBILE_RPC_METHOD_ALLOWLIST`). So the wire exists and
has a consumer - the tile's control is simply not on it. Building block: **wire up Orca's own
building block**, tier 1.

**One honesty gap in the offer path.** With `--pairing-address` unset,
`resolveAdvertisedPairingEndpoint` (`pairing-endpoint.ts:22-26`) falls back to `127.0.0.1` and the
offer still reports `available: true`. The pane would then draw a QR no phone can use, and the web
copy `pairing-credentials.diff` added for exactly this case ("this server has no advertised pairing
address") never fires, because it is on the `available: false` branch. Not a defect on the live host,
which passes the flag.

## Verdict

**Works partially - the missing piece is Auto-restore fit.**

Everything from the install links down through Generate, the QR, the pairing code, the paired-device
list and Revoke works the moment gate 2 opens: the RPC family, its authorization, the preload
namespace, the browser-side QR encoder and the loopback-bind guard are all in place, and the device
registry shows the mint-and-connect path completing on this host. **Auto-restore fit** renders,
accepts an edit, persists to this browser's localStorage and never reaches the host, so the phone
keeps whatever the host store holds.

## Size of the work

**1. Open gate 2** - delete the `{showDesktopOnlySettings ? … : null}` wrapper at
`Settings.tsx:1417`. Owner: `patches/settings-nav-web-parity.diff`, which already carries this hunk
on the branch. No new patch.

**2. Put Auto-restore fit on the wire that already exists.** Route the tile's read and write onto
`terminal.getAutoRestoreFit` / `terminal.setAutoRestoreFit` rather than widening `SettingsUpdate` -
`settings.update` is on `MOBILE_RPC_METHOD_ALLOWLIST`, so a new key there is phone-reachable, and
`web-share-surfaces.diff` already set the precedent of a dedicated method for exactly that reason.
One file: `lib/orca/src/renderer/src/web/web-preload-api.ts` - forward `mobileAutoRestoreFitMs` from
`settings.set` onto `terminal.setAutoRestoreFit`, and read it back in
`getRuntimeBackedStoredSettings` so the pane opens on the host's value. Owner:
`patches/pairing-credentials.diff`, which already owns the `mobile` half of that file. Test in the
overlay, beside `src/renderer/src/web/web-mobile-pairing-qr.test.ts`; the failing symptom to write it
from is "set the hold in the tile, ask the host, it still answers the old value".

**3. Optional, cheap, same patch:** make `buildTrustedMobilePairingContext.createOffer` return
`available: false` with a reason when `trustedProxy && !trustedProxyAddress`, so the web-specific
guidance string the patch already ships actually fires instead of a loopback QR. One hunk in
`runtime-rpc.ts`, inside `pairing-credentials.diff`.

**4. Test naming.** `pairing-credentials.diff`'s header names five test files; its *To test* becomes
followable only with (1). A test that fails while `mobile` is missing from gate 2 does not exist -
`settings-nav-render-parity.test.ts` asserts nav ⊆ rendered, which the delete-from-nav reflex
satisfies just as well.

**Collision, per shared dep 7.** `pairing-credentials.diff` owns `Settings.tsx:1741-1747`;
the nav patch's mobile hunk is at `:1409-1426`. ~320 lines apart, no overlap, and pairing applies
first in `series`, so the nav patch's context already carries pairing's +3 offset.

## Blocks this shares with other sections

- **Shared dep 1 - `Settings.tsx:343` and its 11 JSX gates.** `mobile` at `:1417` is one of the 11.
  Every listed-and-blank section edits this file; one patch must own it.
- **Shared dep 7 - `patches/settings-nav-web-parity.diff` vs `patches/pairing-credentials.diff`.**
  Both own `Settings.tsx`. Distances above.
- **Shared dep 2 - the nav/render pair.** Opening gate 2 for `mobile` is inseparable from gate 1
  already being open; the test that binds them is shared infrastructure, not per-section work.
- **Shared deps 3 and 4 - `syncRuntimeBackedSettings` and `SettingsUpdate`.** `mobile` collides here
  with `browser`, `notifications`, `advanced`, `appearance` and `input`. Fixing
  `mobileAutoRestoreFitMs` by *widening* either list would set the wrong precedent for all five;
  fixing it by routing to a dedicated existing method sets the right one.
- **`servers` (Remote Orca Servers).** Same `trustedMobilePairing` context, same three runtime-grant
  methods, same `--pairing-address` policy, same patch, and `RuntimeEnvironmentsPane.tsx` /
  `RuntimePairingGeneratorForm.tsx` carry its `isWebClientLocation()` branches. Any change to the
  context gate, to the advertised address, or to `reach` changes both panes.
- **The sidebar *Orca Mobile* page** (`MobilePage.tsx`, `MobileHero*.tsx`) - not a settings section,
  so absent from `00-sections.md`, but it shares the whole `window.api.mobile` namespace, the
  `use-mobile-pairing-generation.ts` hook and the `paired-mobile-devices.ts` cache with this pane.
  Any fix or regression in those lands on both. It is also why this capability is not actually dead
  in the tile today.
- **`runtime-seeded-settings.diff`.** `experimentalMobile` is a seeded key; `mobileAutoRestoreFitMs`
  and `showMobileButton` are not - so the seeding patch is not a route for (2).
- **`patches/trusted-proxy-session.diff`.** Owns both guards that keep a phone mint from widening the
  bind. Anything that changes `ensureNetworkExposure` or `resolveInitialWebSocketBindHost` affects
  this pane's safety, and `computer-use` / `browser` share the same trusted-proxy invariant.

## Unverified

- **Whether the pane draws correctly once gate 2 opens.** Nothing was assembled: no `quilt push`, no
  `mise run up`, no `vitest`, no build, no tile drive. The wires are traced; the render was not
  observed. Probe: open gate 2 locally and mount `Settings` with `isWebClient` true.
- **Attribution of the two `mobile`-scope registry entries to the web RPC path.** No renderer process
  exists on the host today and `serve` is the headless branch, so `ipc/mobile.ts` has no caller - but
  those entries date from 8/18 and `main.trace.ndjson` no longer contains any `mobile.*` line, so the
  log that would settle it has rotated. Probe: mint one offer from the tile and watch the registry
  gain a `mobile` entry.
- **`mobile.listDevices` over the wire from a browser.** Not called in this pass - the pane cannot be
  reached and I did not open a runtime-scope socket. Probe: on the live tile,
  `await window.api.mobile.listDevices()`.
- **Whether a phone can complete the WebSocket handshake through the Coder portal.** The advertised
  address is a portal URL carrying a session-token query, so the QR's validity is bound to that
  token's lifetime - which is the case the patch's web notice already warns about. One `mobile`
  device has `lastSeenAt > 0`, which says a phone connected at some point, not that one can today.
  Probe: pair a phone and watch `lastSeenAt` move.
- **`reach` asymmetry.** `createRuntimeGrant` pins `reach: 'this-computer'` for STA-2370;
  `createOffer` passes no `reach`, so mobile offers record `'network'` (confirmed in the live
  registry). Inert while `--trusted-proxy` is on, because `resolveInitialWebSocketBindHost` returns
  loopback before reading any device's reach. Not verified against a start without `--trusted-proxy`,
  which the launch contract does not use.
- **The Auto-restore fit divergence is read from source**, not observed as a phone-visible symptom.
- **Cmd+J and settings search.** Both read gate 1's `searchEntries`, so `mobile` is findable and
  lands on the same blank pane. Not exercised.
