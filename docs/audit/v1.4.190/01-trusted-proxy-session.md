# trusted-proxy-session — v1.4.190 re-derivation

## Problem

Stock `orca serve` delivers the pairing credential only in the URL fragment, but a Coder tile URL
is fixed at template-build time. A browser opening that fixed URL arrives with no fragment and no
stored environment, so it lands on the paste-a-pairing-code form instead of the Orca UI.

## Still present at v1.4.190

yes.

- The only credential delivery upstream mints is the fragment:
  `createWebClientUrl(endpoint, pairingUrl)` sets `url.hash = 'pairing=…'`
  (`src/main/runtime/runtime-rpc.ts:162-169`), consumed at `:729-730`.
- The only client-side reader is the address bar:
  `readPairingInputFromLocation` (`src/renderer/src/web/web-pairing.ts:36-60`).
- With no fragment and no stored environment, `decideWebPairingStartup` returns
  `{ kind: 'show-connect', initialPairingInput: null }` (`web-pairing.ts:71-73`) and `WebRoot`
  renders `<WebConnect>` — the paste form (`src/renderer/src/web/main.tsx:56-63`).
- The HTTP surface serves two routes only: `/web-index.html` and `/assets/*`
  (`src/main/runtime/rpc/static-web-client-handler.ts:6-7,129-133`). There is no credential route.
- `git grep -i 'trusted-proxy\|trustedProxy\|trusted-session\|x-forwarded' v1.4.190 -- src` returns
  nothing.
- Every file the patch modifies is byte-identical at v1.4.188 and v1.4.190 except
  `src/main/index.ts` (+71/-3, the host-port install block and `reportSecretProtectionGap`) and
  `src/renderer/src/web/web-preload-api.ts` (+1, `onToggleAgentDashboard`). Neither touches a hunk
  this patch owns. `ws-transport.ts`, `static-web-client-handler.ts`, `runtime-rpc.ts`,
  `web-pairing.ts`, `main.tsx`, `web-runtime-client.ts`, `serve-readiness.ts` and all three
  `src/cli/` files: unchanged.

## Who owns this logic now

**no upstream owner.** Nothing at v1.4.190 hands a same-origin web client a pairing credential
without a paste form.

What would have to be added upstream: a credential route on the static web handler
(`static-web-client-handler.ts`) plus a startup probe in the web client
(`web-pairing.ts` / `main.tsx`) — exactly the seams this patch already extends, both unmoved.

Three adjacent facts that constrain the correct shape:

- **`orcad — the plain-Node runtime entrypoint`** is not a candidate host today. `startOrcad`
  constructs `OrcaRuntimeRpcServer` with no `webClientRoot` (`src/main/orcad/orcad-entry.ts:163-170`),
  so orcad serves no web client at all and `createPairingOffer` returns `webClientUrl: null`
  (`runtime-rpc.ts:729-730`). `OrcadOptions` omitting a trusted-proxy flag (`:89-94`) is consistent
  with that, not an unfinished surface. Our AppImage runs the Electron `--serve` path
  (`.mise/tasks/test/e2e.sh:55,66`), never orcad.
- **`SecretStore` does not own the pairing credential.** `DeviceRegistry` persists device tokens
  through `writeSecureJsonFile` (`src/main/runtime/device-registry.ts:8,81`) and never calls
  `getSecretStore()`. The SecretStore port work changes nothing about the loopback-bind-as-
  authentication argument: the offer is readable by any local process because it is served over
  loopback, which was already true, and the token on disk is a 0600 file at both tags.
- **`RuntimePairingReach` (STA-2370) owns "this credential must not widen the listener."**
  `RuntimePairingReach = 'this-computer' | 'network'` (`src/shared/runtime-pairing-reach.ts:5`),
  recorded per device (`device-registry.ts:28,67,103`) and read by
  `resolveInitialWebSocketBindHost` (`runtime-rpc.ts:1246-1255`). `servesThisComputerOnly`
  (`src/main/ipc/mobile.ts:30-36`) is upstream's own gate on `ensureNetworkExposure()`. This patch
  currently reimplements that decision with a `trustedProxy` boolean instead of routing into it.

## Verdict

keep — the capability has no upstream owner and the symptom is unchanged, but three hunks must
change shape: the credential route must respect upstream's proxy-prefix mapping, the offer must
carry `reach: 'this-computer'`, and the bind guard must stop being the only thing holding the
loopback invariant.

## Correct shape at v1.4.190

**1. Route `/trusted-session` through `mapProxyPrefixedStaticPathname`, not a separate exact match.**

`src/main/runtime/rpc/static-web-client-handler.ts:115-127` already maps a forwarded reverse-proxy
prefix for both served routes — `/orca/web-index.html` → `/web-index.html`, `/orca/assets/app.js` →
`/assets/app.js` (upstream test: `ws-transport-static-web.test.ts:45-65`). The patch's
`pathname === '/trusted-session'` check runs after that mapper and matches nothing prefixed, so
under a path-forwarding proxy the page loads and its probe 404s. The client fetch is
`new URL('trusted-session', window.location.href)`, which from `/orca/web-index.html` resolves to
`/orca/trusted-session`. Coder subdomain apps are unaffected; Coder path-based apps
(`/@user/ws.agent/apps/orca/`) are.

Change: inside `mapProxyPrefixedStaticPathname`, **after** the `/assets/` branch, add
`if (pathname.endsWith('/trusted-session')) return '/trusted-session'`. Order matters —
`/assets/foo/trusted-session` must stay in the asset branch or the credential becomes reachable
from under `/assets/`, which is the property the patch header names. Then the handler's own check
stays `pathname === '/trusted-session'` on the already-mapped value.

**2. Mint the trusted-session offer with `reach: 'this-computer'`.**

`buildTrustedSessionOffer` calls `createPairingOffer` with no `reach`, so it defaults to `'network'`
(`runtime-rpc.ts:716`, `device-registry.ts:103`). `getOrCreatePendingDevice` widens but never
narrows: `pairingReach === 'network' && existing.pairingReach === 'this-computer'` →
`setPairingReach(existing, 'network')` (`device-registry.ts:105-113`). The pending runtime device
is shared with patch 02's `createRuntimeGrant`, which does pass `reach: 'this-computer'` — so today
every trusted-session probe silently widens the reach patch 02 just narrowed. Add
`reach: 'this-computer'` to the `createPairingOffer` args in `buildTrustedSessionOffer`.

**3. Keep both bind guards, but as defence in depth rather than the load-bearing rule.**

After (2), `resolveInitialWebSocketBindHost`'s `hasConnectedNetworkDevice` scan no longer counts
trusted-session devices. The `if (this.trustedProxy) return WS_BIND_HOST_LOOPBACK` hunk still earns
its place because it must outrank `exposeNetworkByDefault`, which `src/main/index.ts:3157` sets
from `Boolean(serveOptions)`, and because a host that paired a LAN device before switching to
`--trusted-proxy` would otherwise bind `0.0.0.0` from history. The `ensureNetworkExposure` guard
also stays: `createMobilePairingOffer` calls it unconditionally at `runtime-rpc.ts:744`, before the
`connectionMode === 'local-only'` branch — so it is patch 01's guard, not patch 02's `local-only`
pin, that keeps patch 02's web-tile mobile pairing from publishing the runtime on every interface.
Record that dependency in the patch header; today neither header states it.

**4. Everything else stands as written.** The `trustedSessionProvider` option on
`WebSocketTransportOptions` and its wiring in `createHttpServer`
(`ws-transport.ts:27-39,173-179`) sit on an unmoved shape. The client half —
`fetchTrustedSessionPairingInput`, `sameOriginWebSocketEndpoint`, the `WebRoot` probe, the
`onAuthFailed` re-probe — has no upstream counterpart to route into; `web-pairing.ts` and
`main.tsx` are unchanged at the tag. The `--trusted-proxy` flag path through
`src/cli/specs/serve.ts`, `src/cli/handlers/core.ts` and `src/cli/runtime/launch.ts` is unchanged
upstream and applies as-is.

**5. Ratchet constraint for whoever rewrites this.** `runtime-rpc.ts` is one of the two entry
points of `The runtime-electron ratchet`, whose baseline is empty and may only shrink
(`config/runtime-electron-baseline.txt`, `config/scripts/check-runtime-electron-ratchet.mjs:35-38`).
The patch adds no import there today; any new one fails `pnpm lint`.

## Blocks this touches that other patches may share

- **`The runtime-electron ratchet`** — this patch edits `src/main/runtime/runtime-rpc.ts`, one of
  its two entry points. Suspected sharers: `pairing-credentials.diff` (confirmed — it edits
  `runtime-rpc.ts` and `rpc/core.ts`, `rpc/dispatcher.ts`). The other entry point,
  `src/main/runtime/orca-runtime.ts`, is edited by `floating-workspace-picker.diff`,
  `runtime-seeded-settings.diff`, `execution-owner.diff`, `headless-orchestration-delivery.diff`,
  `usage-analytics.diff` and `agent-cold-restore.diff` — all suspected sharers of the same gate.
- **`orcad — the plain-Node runtime entrypoint`** — this patch does not touch it and neither does
  any other patch in `patches/series` (verified: no `Index:` line names `orcad-entry.ts`).
  Suspicion only: audits 02 (`pairing-credentials`) and 09 (`headless-orchestration-delivery`) are
  the two most likely to propose routing into `startOrcad`/`OrcadOptions`, and if any of them does,
  the `webClientRoot` gap named above becomes a shared decision rather than mine alone.
- **`SecretStore`** — checked and *not* touched by this patch (device tokens bypass it). Named here
  only so the cross-patch pass does not re-open the question: any patch claiming SecretStore owns a
  pairing credential is wrong at v1.4.190.

Non-block surfaces this patch shares, for the same pass:

- `src/main/runtime/runtime-rpc.ts` — shared with `pairing-credentials.diff`. **Hard coupling, not
  a suspicion:** patch 02's `buildTrustedMobilePairingContext` reads `this.trustedProxyAddress`, a
  private field patch 01 declares (`pairing-credentials.diff`, hunk `@@ -1007,6 +1011,90 @@`).
  Patch 02 does not apply without patch 01. Merge candidate.
- `src/renderer/src/web/web-preload-api.ts` — shared with `pairing-credentials.diff`,
  `resource-manager.diff`, `cli-registration.diff`, `floating-workspace-picker.diff`,
  `runtime-seeded-settings.diff`, `execution-owner.diff`, `usage-analytics.diff`,
  `workspace-restore.diff`. This patch's hunks there are at `@@ -3714` and the import block; a
  restack conflict is likely but mechanical.
- `src/main/index.ts` — shared with `usage-analytics.diff`. This patch's two hunks (`ServeOptions`
  at `@@ -1893`, the RPC-server construction at `@@ -3098`) both shift by upstream's +71 lines.
- `src/renderer/src/lib/web-client-location.ts` — `execution-owner.diff` patches it; it holds
  `isWebClientLocation()`, the other place the client asks "am I the web client". Suspicion: if
  audit 08 proposes a shared same-origin helper, `sameOriginWebSocketEndpoint` belongs beside it
  rather than in `web-pairing.ts`.

## Unverified

- Nothing here was executed. Every claim is read from upstream source at `v1.4.190` or from the
  patch text; no build, no `quilt push`, no `orca serve` run. In particular I did not confirm that
  the patch still applies at the new pin — the task was read-only and forbade quilt.
- The proxy-prefix defect in item 1 is derived from upstream's own test
  (`ws-transport-static-web.test.ts:45-65`) plus the patch's exact-match branch. I did not reproduce
  a 404 against a running server, and I did not verify which Coder app mode this deployment uses.
- I did not check whether `--trusted-proxy` interacts with `--recipe-json` or `--mobile-pairing` on
  the same command line; `src/cli/specs/serve.ts` allows all three flags together and I did not
  trace what `getServeOptions` does with the combination.
- I did not read `WebConnect.tsx`, so I did not verify what the paste form shows when
  `initialPairingInput` is null beyond `main.tsx:56-63` routing to it.
- The claim that Coder subdomain apps do not forward a path prefix is from how the patch is
  deployed, not from Coder documentation I read this session.
- I did not enumerate every consumer of `ensureNetworkExposure` beyond the three non-test call
  sites `git grep` returned (`mobile.ts:164`, `runtime-rpc.ts:744`, the definition). A grep
  returning three hits is not proof there is no fourth reached by indirection.
