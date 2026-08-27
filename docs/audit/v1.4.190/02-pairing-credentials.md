# pairing-credentials — v1.4.190 re-derivation

## Problem

The web tile could not pair anything: "Generate code" for a phone did nothing, and there was no way
to hand another client access to the running runtime. Both surfaces are desktop-only `ipcMain`
handlers the web preload never had, so every mint and every revoke was a dead control.

## Still present at v1.4.190

yes.

- `src/renderer/src/web/web-preload-api.ts:956,960-963` — all six methods stubbed:
  `getPairingQR: () => Promise.resolve({ available: false })`, `getRuntimePairingUrl` the same,
  `listDevices → { devices: [] }`, `revokeDevice → { revoked: false }`,
  `listRuntimeAccessGrants → { grants: [] }`, `revokeRuntimeAccess → { revoked: false }`.
- `src/renderer/src/components/settings/Settings.tsx:1744` — `canGeneratePairingUrl={!isWebClient}`.
- Mint/revoke reach a client only through `ipcMain` in `src/main/ipc/mobile.ts:80,149,205,226,242,250`.
- `src/main/runtime/rpc/methods/index.ts` registers no `mobile.*` family; `ALL_RPC_METHODS` (`:47-89`)
  has no pairing-credential entry beyond `PAIRING_METHODS`, which is the Relay endpoint/provision
  pair (`src/main/runtime/rpc/methods/pairing.ts:7-27`), not mint/revoke.
- Every upstream file this patch modifies is byte-identical between v1.4.188 and v1.4.190 except
  `Settings.tsx`, whose change is three unrelated deletions at `:310,1205-1211`.

## Who owns this logic now

**Modules split out of `src/main/ipc/*` to keep the runtime graph Electron-free.**

The credential primitives already have an owner and it is not new: `OrcaRuntimeRpcServer` —
`createPairingOffer` (`src/main/runtime/runtime-rpc.ts:664`), `createMobilePairingOffer` (`:734`),
`revokeMobileDevice` (`:630`), `revokeRuntimeAccess` (`:649`), over `DeviceRegistry`
(`src/main/runtime/device-registry.ts:54`). What has **no upstream owner** is the *client-facing
projection* of those primitives — the `scope`/`lastSeenAt` filters, the `pairedAt` sort, the
`DeviceEntry → RuntimeAccessGrant` mapping, the `Mobile <date>`/`Runtime <date>` name templates.
That code exists exactly once, inside the Electron-bound handler file
(`src/main/ipc/mobile.ts:38-45,117,185,214-221,234-239`), which imports
`app, ipcMain, shell` at `:1`.

`runtime-rpc.ts` is one of the two ratchet entry points, and
`config/runtime-electron-baseline.txt` is empty and must stay empty, so `runtime-rpc.ts` **cannot**
import `ipc/mobile.ts`. Extraction is mandatory, not stylistic — which is precisely the block above.

**SecretStore does not own any of this and does not move our code.** `DeviceRegistry` persists
through `writeSecureJsonFile` / `hardenExistingSecureFile` (`device-registry.ts:8`), mode-hardened
plaintext JSON at `orca-devices.json`; the E2EE keypair uses the same seam
(`src/main/runtime/e2ee-keypair.ts:7`). The six non-test `getSecretStore()` consumers at v1.4.190
are `integration-credential-file.ts`, `jira/site-credential-store.ts`, `linear/linear-token-store.ts`,
`protected-secret-persistence.ts`, `speech/openai-api-key-store.ts` and
`host/secret-protection-report.ts:53` — no pairing path among them.

Consequence for the orcad host, whose store reports `isEncryptionAvailable() === false` and throws
on encrypt/decrypt (`src/main/orcad/orcad-entry.ts:70-82`): mint and revoke survive it unchanged,
because they never call it. There is no "cannot seal a pairing credential" case to handle — device
tokens were never sealed on any host, on desktop either.

`src/main/host/secret-protection-report.ts` is consumed by exactly one non-test caller,
`src/main/index.ts:2312`, and its only output is `log()`/`console.warn` to the server console. It
describes at-rest protection for the *other* five stores, not for pairing credentials, so it is out
of this patch's scope. It is a real orca-server gap (a browser user never sees that server console)
but it belongs to whichever patch owns operator diagnostics, not here.

## Verdict

shrink — the capability and its authorization gate are still required and still unowned upstream,
but `buildTrustedMobilePairingContext` re-implements four projections that already exist in
`src/main/ipc/mobile.ts`; extracting them once is the minimal form.

## Correct shape at v1.4.190

Keep unchanged: the `trustedMobilePairing` context type and the `RpcContext` field
(`rpc/core.ts:14`, field beside `pairing?:` at `:100` inside `RpcContext` `:64`), the dispatcher
plumbing (`rpc/dispatcher.ts:209,267`,
`rpc/dispatcher-stream-options.ts:13`), the scope gate at the injection site
(`runtime-rpc.ts:1728`, where `pairing:` already sits — inject
`trustedMobilePairing: device.scope === 'runtime' ? … : undefined`), the six `defineMethod`s with
`.strict()` params in the overlay `src/main/runtime/rpc/methods/mobile-pairing.ts`, the
`mobile-rpc-allowlist.test.ts` assertion, the QR geometry overlay, and every
`isWebClientLocation()` renderer branch.

Change three things.

**1. New overlay module `src/main/runtime/mobile-pairing-service.ts`** (Electron-free; lands at
`lib/orca/src/main/runtime/mobile-pairing-service.ts` via `mise run overlay`). Exports:

- `listPairedMobileDevices(registry: DeviceRegistry | null)` — the `scope === 'mobile' &&
  lastSeenAt > 0` filter and four-field mapping now duplicated at `ipc/mobile.ts:214-221` and in our
  `buildTrustedMobilePairingContext.listDevices`.
- `listRuntimeAccessGrants(registry: DeviceRegistry | null): { grants: RuntimeAccessGrant[] }` — the
  `scope === 'runtime'` filter, the `b.pairedAt - a.pairedAt` sort and `toRuntimeAccessGrant`
  (`ipc/mobile.ts:38-45,234-239`), duplicated in our `listRuntimeGrants`.
- `mobilePairingDeviceName()` / `runtimeGrantDeviceName()` — the `Mobile ${date}` and
  `Runtime ${date}` templates, currently written out at `ipc/mobile.ts:117,185` and twice in our
  patch. `trusted-proxy-session.diff` writes a third, `Web session ${date}`; it should import from
  here too.

**2. Patch `src/main/ipc/mobile.ts`** — a file this patch does not currently touch — so
`mobile:listDevices`, `mobile:listRuntimeAccessGrants` and the two name templates delegate to that
module, and `toRuntimeAccessGrant` is deleted from it. This is upstream's own refactor pattern
(`preflight/agent-detection.ts`, `ssh/ssh-target-registry.ts`, `plugins/plugin-client-list.ts` are
the v1.4.190 precedents), so it merges rather than conflicts on the next bump.

**3. Shrink `buildTrustedMobilePairingContext`** (`runtime-rpc.ts`, ~90 lines today) to six
delegating members: `listDevices → listPairedMobileDevices(this.deviceRegistry)`,
`listRuntimeGrants → listRuntimeAccessGrants(this.deviceRegistry)`, the two `create*` calls keeping
only the orca-server-specific arguments (`address: this.trustedProxyAddress`,
`connectionMode: 'local-only'`, `scope: 'runtime'`, `reach: 'this-computer'`) with the name coming
from the shared helper, and the two revokes as they are. Retype
`TrustedMobilePairingRpcContext.listRuntimeGrants` in `rpc/core.ts` as
`{ grants: RuntimeAccessGrant[] }`, importing from `src/shared/runtime-access-grants.ts:1` instead
of restating the four fields; do the same for the inline generic in `web-preload-api.ts`, which can
take its shape from `MobileApi['listRuntimeAccessGrants']` (`src/preload/api/mobile-api.ts:79`).

The `reach: 'this-computer'` hardcode stays and must not be replaced by upstream's
`servesThisComputerOnly()` (`ipc/mobile.ts:30-36`): that helper resolves the *advertised* hostname,
and `--pairing-address` is a public proxy URL, so it would classify non-loopback and trigger
`ensureNetworkExposure()` — voiding the trusted-proxy loopback bind. That decision is
orca-server-specific and belongs in our code, with the STA-2370 comment kept.

**QR: no change.** `src/main/runtime/mobile-pairing-qr.ts` is byte-identical between the tags, and
`MobileApi.getPairingQR`'s result type (`src/preload/api/mobile-api.ts:11-34`) still carries
`qrDataUrl: string | null`, `qrSize: number | null`, `qrError?: 'encoding_failed'` and
`endpoint: string | null`. The v1.4.188 contract note holds; `src/shared/mobile-pairing-qr-geometry.ts`
and the patch that routes the node encoder through it carry forward unmodified.

**Allowlist: no change and it did not move.** `MOBILE_RPC_METHOD_ALLOWLIST` is still
`src/main/runtime/runtime-rpc.ts:179`, enforced at `:1656`, and the set is byte-identical between
v1.4.188 and v1.4.190. It contains zero `mobile.*` entries, so none of our six methods is on it;
the patch's regression test in `mobile-rpc-allowlist.test.ts` still asserts exactly that.

## Blocks this touches that other patches may share

- **Modules split out of `src/main/ipc/*` to keep the runtime graph Electron-free** — the block this
  patch's correct shape routes into. Suspect `cli-registration.diff` (patches `src/main/ipc/cli.ts`
  *and* `rpc/methods/index.ts` — the same "ipcMain-only capability needs an RPC" shape) and
  `floating-workspace-picker.diff` (patches `src/main/ipc/app.ts`,
  `src/main/ipc/floating-workspace-directory.ts` and `rpc/methods/index.ts`). Suspicion:
  all three may be extracting the same way and could share one convention.
- **The runtime-electron ratchet** — this patch adds imports to `runtime-rpc.ts`, one of the two
  ratchet entry points. Confirmed co-owner: `trusted-proxy-session.diff` (also patches
  `runtime-rpc.ts`). Suspect `execution-owner.diff`, `agent-cold-restore.diff`,
  `headless-orchestration-delivery.diff`, `runtime-seeded-settings.diff`, `usage-analytics.diff`
  and `floating-workspace-picker.diff`, which all patch `src/main/runtime/orca-runtime.ts`, the
  other entry point.
- **orcad — the plain-Node runtime entrypoint** — `orcad-entry.ts:176-186` mints a third
  runtime-scope credential (`CLI <date>`) through the same `createPairingOffer`. Suspect
  `trusted-proxy-session.diff` and `cli-registration.diff` care about that call site.
- **SecretStore** — checked and *not* touched by this patch. Suspicion: no patch in the series
  touches it; worth one confirming sweep in the cross-patch pass.
- `MOBILE_RPC_METHOD_ALLOWLIST` and its test (`src/main/runtime/mobile-rpc-allowlist.test.ts`) —
  shared with `cli-registration.diff`, `execution-owner.diff`, `floating-workspace-picker.diff`,
  `usage-analytics.diff`. Four patches append cases to one upstream test file; the merge order in
  `patches/series` is load-bearing.
- `src/main/runtime/rpc/methods/index.ts` (`ALL_RPC_METHODS`) — shared with `cli-registration.diff`,
  `floating-workspace-picker.diff`, `usage-analytics.diff`. Every new RPC family lands in the same
  two hunks.
- `src/renderer/src/web/web-preload-api.ts` — shared with eight other patches:
  `cli-registration`, `execution-owner`, `floating-workspace-picker`, `resource-manager`,
  `runtime-seeded-settings`, `trusted-proxy-session`, `usage-analytics`, `workspace-restore`.
- `src/renderer/src/lib/web-client-location.ts` (`isWebClientLocation`) — **owned by**
  `execution-owner.diff`, which patches that file; this patch and
  `floating-workspace-picker.diff` are consumers. A change to the predicate reaches all three.
- `createPairingOffer` and the shared *pending runtime device* — confirmed collision with
  `trusted-proxy-session.diff:268` (`buildTrustedSessionOffer`). Both mint runtime-scope credentials
  from the same pending slot; our patch header already records the rotate-in-between hazard.
  The cross-patch pass should decide whether one of them owns the mint.

## Unverified

- Nothing here was executed. Every claim is read from upstream source at the tags, or from the
  patch text. No `quilt push`, no build, no `orca serve` run.
- Whether extracting `ipc/mobile.ts` actually keeps `runtime-rpc.ts` clean under the ratchet — I did
  not run `node config/scripts/check-runtime-electron-ratchet.mjs` against a tree with the proposed
  module. The reasoning is from the baseline file's contents, not from the gate.
- Whether the proposed patch to `src/main/ipc/mobile.ts` collides with any other patch — no other
  patch in the series lists that path today, but I did not check for context overlap with
  `cli-registration.diff`'s `src/main/ipc/cli.ts` hunks.
- Whether `mobile-android-v0.0.44` (the only other v1.4.190 change under `components/mobile/`)
  changes anything about pairing on the phone side — I read only the two URL constants, not the
  APK.
- Whether upstream intends to give `describeProtectionGap()` a wire representation. I found one
  consumer, `src/main/index.ts:2312`; a grep returning one hit is not proof there is no plan.
- The claim that no patch in the series touches SecretStore rests on a grep of `patches/*.diff` for
  `secret-store`/`getSecretStore`, which returned nothing. That is a lead, not proof of absence.
