import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALL_RPC_METHODS } from './rpc/methods'

// Why this duplicates the shape of `mobile-rpc-allowlist.test.ts` instead of adding cases to it:
// that file is edited by this patch, so popping the patch DELETES the cases rather than failing
// them — the review finding that two shipped patches had no test able to fail without them. This
// file is overlay-owned, survives the pop, and reads `runtime-rpc.ts` as data.

function mobileRpcAllowlist(): Set<string> {
  const source = readFileSync(join(process.cwd(), 'src/main/runtime/runtime-rpc.ts'), 'utf8')
  const allowlist = source.match(/const MOBILE_RPC_METHOD_ALLOWLIST = new Set\(\[([\s\S]*?)\]\)/)
  if (!allowlist) {
    throw new Error('MOBILE_RPC_METHOD_ALLOWLIST not found')
  }
  return new Set([...allowlist[1]!.matchAll(/'([^']+)'/g)].map((match) => match[1]!))
}

const PUBLISH_RAIL = [
  'artifacts.list',
  'artifacts.getPublishedLink',
  'artifacts.share',
  'artifacts.publish',
  'artifacts.update',
  'artifacts.unshare',
  'artifacts.delete',
  'skills.discover',
  'skills.share'
]

// Writes skill folders — which can hold scripts and executables — onto the host, or deletes them.
const SKILL_INSTALL_RAIL = [
  'skills.install',
  'skills.installBundle',
  'skills.removeInstall',
  'skills.previewInstall',
  'skills.cancelInstall',
  'skills.getInstallProgress',
  'skills.listManagedInstalls',
  'skills.beginUpload',
  'skills.uploadChunk',
  'skills.commitUpload',
  'skills.cancelUpload'
]

describe('web share surfaces — mobile scope', () => {
  it('lets a paired phone publish', () => {
    // The owner enables publishing on the server, then pairs the phone; the phone inherits that
    // decision. Each method here shares one document and none admits a client to the runtime.
    const allowed = mobileRpcAllowlist()
    expect(PUBLISH_RAIL.filter((method) => !allowed.has(method))).toEqual([])
  })

  it('does not let a paired phone make the decision it inherits', () => {
    // `settings.update` IS mobile-allowlisted, which is why the two capability keys are carried by
    // their own method instead of being added to `SettingsUpdate`.
    const allowed = mobileRpcAllowlist()
    expect(allowed.has('settings.updateSharingCapabilities')).toBe(false)
  })

  it('does not let a paired phone write or delete skill folders on the host', () => {
    const allowed = mobileRpcAllowlist()
    expect(SKILL_INSTALL_RAIL.filter((method) => allowed.has(method))).toEqual([])
  })

  it('keeps the runtime-admitting pairing methods off the list', () => {
    // The category AGENTS.md actually names: minting a device token admits a NEW client to the
    // host. Pinned here so widening the publish rail can never be read as widening this one.
    const allowed = mobileRpcAllowlist()
    expect(
      ['mobile.createPairingOffer', 'mobile.getRuntimePairingUrl', 'mobile.revokeRuntimeAccess']
        .filter((method) => allowed.has(method))
    ).toEqual([])
  })

  it('registers every method it allowlists', () => {
    // An allowlisted method that was never registered fails at dispatch, not at the allowlist.
    const registered = new Set(ALL_RPC_METHODS.map((method) => method.name))
    expect(PUBLISH_RAIL.filter((method) => !registered.has(method))).toEqual([])
  })
})
