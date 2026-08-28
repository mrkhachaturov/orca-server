import { describe, expect, it, beforeEach } from 'vitest'
import { ALL_RPC_METHODS } from './index'
import { SHARING_SURFACE_METHODS } from './sharing-surfaces'
import {
  setOrcaProfileAuthStatusProvider,
  setOrcaProfileSignOutProvider
} from '../../../orca-profiles/orca-profile-auth-registry'
import type {
  OrcaProfileAuthStatus,
  SignOutCurrentOrcaProfileResult
} from '../../../../shared/orca-profiles'

// Why this file lives in the overlay and not beside the patched allowlist test: a patch's
// assertions inside a file the patch itself edits are DELETED when the patch pops, so they cannot
// fail without it. These survive the pop and fail on the registration the patch contributes.

const method = (name: string) => ALL_RPC_METHODS.find((m) => m.name === name)
// Handlers are invoked off the typed export: ALL_RPC_METHODS is a union with the streaming methods,
// whose handler takes a third `emit` argument.
const own = (name: string) => {
  const found = SHARING_SURFACE_METHODS.find((m) => m.name === name)
  if (!found) {
    throw new Error(`${name} is missing from SHARING_SURFACE_METHODS`)
  }
  return found
}
const emptyCtx = {} as Parameters<ReturnType<typeof own>['handler']>[1]

const connectedStatus: OrcaProfileAuthStatus = {
  activeProfileId: 'local-default',
  configured: true,
  state: 'connected',
  persistence: 'memory-only'
}

describe('sharing surface RPC registration', () => {
  it('registers all three methods in ALL_RPC_METHODS', () => {
    // Without the patch, rpc/methods/index.ts never spreads SHARING_SURFACE_METHODS, so the tile's
    // toggle has nowhere to send the grant and Artifacts keeps reading a fabricated auth status.
    expect(method('settings.updateSharingCapabilities')).toBeDefined()
    expect(method('orcaProfiles.authStatus')).toBeDefined()
    expect(method('orcaProfiles.signOutCurrent')).toBeDefined()
  })

  it('exports exactly the three methods it registers', () => {
    expect(SHARING_SURFACE_METHODS.map((m) => m.name).sort()).toEqual([
      'orcaProfiles.authStatus',
      'orcaProfiles.signOutCurrent',
      'settings.updateSharingCapabilities'
    ])
  })
})

describe('settings.updateSharingCapabilities params', () => {
  const params = () => {
    const schema = method('settings.updateSharingCapabilities')?.params
    if (!schema) {
      throw new Error('settings.updateSharingCapabilities is not registered')
    }
    return schema
  }

  it('accepts either capability alone and both together', () => {
    expect(params().safeParse({ artifactSharingEnabled: true }).success).toBe(true)
    expect(params().safeParse({ agentSkillSharingEnabled: true }).success).toBe(true)
    expect(
      params().safeParse({ artifactSharingEnabled: false, agentSkillSharingEnabled: true }).success
    ).toBe(true)
  })

  it('rejects an empty update rather than writing nothing and reporting success', () => {
    expect(params().safeParse({}).success).toBe(false)
  })

  it('rejects a non-boolean grant', () => {
    // The persistence layer coerces with `=== true`, so a truthy string would silently persist as
    // "off" while the caller believed it had granted publishing.
    expect(params().safeParse({ artifactSharingEnabled: 'yes' }).success).toBe(false)
  })

  it('rejects an unknown key instead of dropping it', () => {
    expect(
      params().safeParse({ artifactSharingEnabled: true, showArtifactsButton: true }).success
    ).toBe(false)
  })

  it('does not carry any other settings key', () => {
    // Guards the whole point of a separate method: it must never become a second settings.update.
    for (const key of ['theme', 'showSkillsButton', 'agentStatusHooksEnabled', 'defaultTuiAgent']) {
      expect(params().safeParse({ artifactSharingEnabled: true, [key]: true }).success).toBe(false)
    }
  })
})

describe('orcaProfiles.authStatus', () => {
  beforeEach(() => {
    setOrcaProfileAuthStatusProvider(null)
  })

  it('answers the host status the registry holds', () => {
    setOrcaProfileAuthStatusProvider(() => connectedStatus)
    expect(own('orcaProfiles.authStatus').handler({}, emptyCtx)).toEqual(connectedStatus)
  })

  it('throws rather than impersonating a host with no account configured', () => {
    // A fabricated `configured: false` is the exact defect this method replaces — it made the
    // Artifacts page blame the host for a browser limitation.
    expect(() => own('orcaProfiles.authStatus').handler({}, emptyCtx)).toThrow(
      'orca_profile_auth_unavailable'
    )
  })
})

describe('orcaProfiles.signOutCurrent', () => {
  beforeEach(() => {
    setOrcaProfileSignOutProvider(null)
  })

  it('clears the session the host holds', async () => {
    const signedOut: SignOutCurrentOrcaProfileResult = {
      status: 'signed-out',
      auth: {
        activeProfileId: 'local-default',
        configured: false,
        state: 'unconfigured',
        persistence: 'none'
      },
      activeProfileId: 'local-default',
      profiles: []
    }
    setOrcaProfileSignOutProvider(() => Promise.resolve(signedOut))

    await expect(own('orcaProfiles.signOutCurrent').handler({}, emptyCtx)).resolves.toEqual(
      signedOut
    )
  })

  it('rejects rather than reporting a sign-out no host performed', async () => {
    // The only status this result carries is 'signed-out', so a fabricated one reads as success at
    // every caller — the defect this method exists to remove.
    await expect(own('orcaProfiles.signOutCurrent').handler({}, emptyCtx)).rejects.toThrow(
      'orca_profile_sign_out_unavailable'
    )
  })
})
