import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'
import {
  getRegisteredOrcaProfileAuthStatus,
  runRegisteredOrcaProfileSignOut
} from '../../../orca-profiles/orca-profile-auth-registry'

/**
 * Mirrors the desktop `orcaProfiles:authStatus` handler (src/main/ipc/orca-profiles.ts). A read,
 * so it is safe for any paired client: the status carries the account's display identity and
 * capability flags, never the access or refresh token, which never leave the host.
 */
const AuthStatusParams = z.object({}).default({})

/**
 * Clearing the host's own account session, mirroring the desktop `orcaProfiles:signOutCurrent`
 * handler. Host-mutating, so it stays off `MOBILE_RPC_METHOD_ALLOWLIST`: a paired phone must not be
 * able to sign the server owner out.
 */
const SignOutCurrentParams = z.object({}).default({})

/**
 * The two device-wide publish capabilities. Deliberately NOT folded into upstream's
 * `SettingsUpdate`: that schema is reached by `settings.update`, which IS on
 * `MOBILE_RPC_METHOD_ALLOWLIST`, and enabling publishing is the server owner's decision — the
 * one a paired phone inherits rather than makes. Keeping them on their own method leaves the
 * toggle runtime-scope only while `artifacts.*` and the skill publish rail stay phone-reachable.
 *
 * `.strict()` so an unknown key errors rather than being silently dropped into a partial grant.
 */
const SharingCapabilitiesUpdate = z
  .object({
    artifactSharingEnabled: z.boolean().optional(),
    agentSkillSharingEnabled: z.boolean().optional()
  })
  .strict()
  .refine(
    (update) =>
      update.artifactSharingEnabled !== undefined ||
      update.agentSkillSharingEnabled !== undefined,
    { message: 'Specify at least one sharing capability to update.' }
  )

export const SHARING_SURFACE_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'orcaProfiles.authStatus',
    params: AuthStatusParams,
    handler: () => getRegisteredOrcaProfileAuthStatus()
  }),
  defineMethod({
    name: 'orcaProfiles.signOutCurrent',
    params: SignOutCurrentParams,
    handler: () => runRegisteredOrcaProfileSignOut()
  }),
  defineMethod({
    name: 'settings.updateSharingCapabilities',
    params: SharingCapabilitiesUpdate,
    handler: async (params, { runtime }) => ({
      settings: await runtime.updateClientSettings(params)
    })
  })
]
