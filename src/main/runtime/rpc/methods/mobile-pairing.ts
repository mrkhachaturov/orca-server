import { z } from 'zod'
import { defineMethod, type RpcAnyMethod } from '../core'

// Why: the web client behind a trusted proxy has no Electron IPC, so Settings →
// Mobile needs an RPC path to the same mint/list/revoke operations the desktop
// reaches via mobile: IPC. Authorization is the presence of
// ctx.trustedMobilePairing: the transport injects it only for runtime-scope
// connections, and none of these methods are in MOBILE_RPC_METHOD_ALLOWLIST —
// a paired phone must never mint a new device credential (privilege escalation)
// or revoke its siblings.
export const MOBILE_PAIRING_METHODS: readonly RpcAnyMethod[] = [
  defineMethod({
    name: 'mobile.createPairingOffer',
    // Why: strict — the advertised address and connection mode are server policy
    // (--pairing-address, local-only); a caller-supplied address must be an
    // error, not silently stripped, so a redirect attempt is visible.
    params: z.object({ rotate: z.boolean().optional() }).strict(),
    handler: async (params, ctx) => {
      if (!ctx.trustedMobilePairing) {
        throw new Error('trusted_mobile_pairing_unavailable')
      }
      return await ctx.trustedMobilePairing.createOffer({ rotate: params.rotate })
    }
  }),
  defineMethod({
    name: 'mobile.listDevices',
    params: null,
    handler: (_params, ctx) => {
      if (!ctx.trustedMobilePairing) {
        throw new Error('trusted_mobile_pairing_unavailable')
      }
      return ctx.trustedMobilePairing.listDevices()
    }
  }),
  defineMethod({
    name: 'mobile.revokeDevice',
    params: z.object({ deviceId: z.string().min(1) }),
    handler: async (params, ctx) => {
      if (!ctx.trustedMobilePairing) {
        throw new Error('trusted_mobile_pairing_unavailable')
      }
      return await ctx.trustedMobilePairing.revokeDevice(params.deviceId)
    }
  }),
  // Why: the "Share this Orca server" surface for web clients — full runtime
  // grants for desktop/browser clients. Same authorization story as above:
  // context injected only for runtime-scope connections; runtime→runtime is
  // not an escalation, but a phone minting a runtime grant would be.
  defineMethod({
    name: 'mobile.getRuntimePairingUrl',
    // Why: strict — the advertised address is server policy (--pairing-address).
    params: z.object({ rotate: z.boolean().optional() }).strict(),
    handler: (params, ctx) => {
      if (!ctx.trustedMobilePairing) {
        throw new Error('trusted_mobile_pairing_unavailable')
      }
      return ctx.trustedMobilePairing.createRuntimeGrant({ rotate: params.rotate })
    }
  }),
  defineMethod({
    name: 'mobile.listRuntimeAccessGrants',
    params: null,
    handler: (_params, ctx) => {
      if (!ctx.trustedMobilePairing) {
        throw new Error('trusted_mobile_pairing_unavailable')
      }
      return ctx.trustedMobilePairing.listRuntimeGrants()
    }
  }),
  defineMethod({
    name: 'mobile.revokeRuntimeAccess',
    params: z.object({ deviceId: z.string().min(1) }).strict(),
    handler: (params, ctx) => {
      if (!ctx.trustedMobilePairing) {
        throw new Error('trusted_mobile_pairing_unavailable')
      }
      return ctx.trustedMobilePairing.revokeRuntimeGrant(params.deviceId)
    }
  })
]
