import { z } from 'zod'
import { defineMethod, type RpcAnyMethod } from '../core'

// Authorization is the presence of ctx.trustedMobilePairing: the transport injects it only
// for runtime-scope connections. None of these may join MOBILE_RPC_METHOD_ALLOWLIST — a
// paired phone minting or revoking a device credential would be privilege escalation.
export const MOBILE_PAIRING_METHODS: readonly RpcAnyMethod[] = [
  defineMethod({
    name: 'mobile.createPairingOffer',
    // strict: address and connection mode are server policy (--pairing-address, local-only);
    // a caller-supplied address must error rather than be silently stripped.
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
  // "Share this Orca server": runtime→runtime grants. Same gate — runtime→runtime is not
  // an escalation, a phone minting a runtime grant would be.
  defineMethod({
    name: 'mobile.getRuntimePairingUrl',
    // strict: the advertised address is server policy (--pairing-address).
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
