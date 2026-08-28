import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeRpcResponse } from '../../../shared/runtime-rpc-envelope'
import {
  installBrowserGlobals,
  writeStoredRuntimeEnvironment
} from './web-preload-api-test-harness'

type RuntimeCall = { method: string; params: unknown }

// Overlay-owned so it survives `quilt pop`: with the patch popped the preload restores its
// fabricated auth status and its `requires the desktop app` rejections, and these fail.

function mockRuntime(calls: RuntimeCall[], resultFor: (method: string) => unknown): void {
  vi.doMock('./web-runtime-client', () => ({
    WebRuntimeClient: class {
      call(method: string, params?: unknown): Promise<RuntimeRpcResponse<unknown>> {
        calls.push({ method, params })
        return Promise.resolve({
          id: `call-${calls.length}`,
          ok: true,
          result: resultFor(method),
          _meta: { runtimeId: 'runtime-1' }
        })
      }

      close(): void {}
    }
  }))
}

const HOST_AUTH = {
  activeProfileId: 'local-default',
  configured: true,
  state: 'connected',
  persistence: 'memory-only'
}

describe('web share surfaces', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock('./web-runtime-client')
  })

  async function installApi(
    calls: RuntimeCall[],
    resultFor: (method: string) => unknown = () => HOST_AUTH
  ) {
    mockRuntime(calls, resultFor)
    const globals = installBrowserGlobals('Linux')
    writeStoredRuntimeEnvironment(globals.storage)
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()
    return globals
  }

  it('reports the account status the host actually holds', async () => {
    // Why: the old constant answered `configured: false` unconditionally, so Artifacts rendered
    // "Orca account sign-in is not configured on this machine yet" for a host where it is.
    const calls: RuntimeCall[] = []
    const globals = await installApi(calls)

    const status = await globals.window.api.orcaProfiles.authStatus()

    expect(calls.map((call) => call.method)).toContain('orcaProfiles.authStatus')
    expect(status.configured).toBe(true)
    expect(status.state).toBe('connected')
  }, 15_000)

  it('sends a publish grant on the runtime-scope method, never on settings.update', async () => {
    // `settings.update` is mobile-allowlisted, which is exactly why the capability keys travel on
    // their own method. Sending them the other way would hand a paired phone the toggle.
    const calls: RuntimeCall[] = []
    const globals = await installApi(calls, (method) =>
      method === 'settings.updateSharingCapabilities'
        ? { settings: { artifactSharingEnabled: true, agentSkillSharingEnabled: false } }
        : HOST_AUTH
    )

    await globals.window.api.settings.set({ artifactSharingEnabled: true })

    const grant = calls.find((call) => call.method === 'settings.updateSharingCapabilities')
    expect(grant?.params).toEqual({ artifactSharingEnabled: true })
    expect(calls.some((call) => call.method === 'settings.update')).toBe(false)
  }, 15_000)

  it('mirrors what the host enforced rather than what was asked for', async () => {
    // The host is authoritative: if it refuses half the grant, the tile must show the refusal.
    const calls: RuntimeCall[] = []
    const globals = await installApi(calls, (method) =>
      method === 'settings.updateSharingCapabilities'
        ? { settings: { artifactSharingEnabled: false, agentSkillSharingEnabled: false } }
        : HOST_AUTH
    )

    const next = await globals.window.api.settings.set({ artifactSharingEnabled: true })

    expect(next.artifactSharingEnabled).toBe(false)
  }, 15_000)

  it('asks the host to cancel a skill install instead of claiming it declined', async () => {
    // The old stub resolved `{cancelled: false}` without ever contacting the host.
    const calls: RuntimeCall[] = []
    const globals = await installApi(calls, () => ({ cancelled: true }))

    const result = await globals.window.api.skills.cancelInstall({ operationId: 'op-1' })

    expect(calls.map((call) => call.method)).toContain('skills.cancelInstall')
    expect(result).toEqual({ cancelled: true })
  }, 15_000)

  it('routes the install-management rail and drops environmentId from the strict schemas', async () => {
    const calls: RuntimeCall[] = []
    const globals = await installApi(calls, () => ({ status: 'ok', value: [] }))
    const destination = { kind: 'global' } as never

    await globals.window.api.skills.previewInstall({
      environmentId: 'env-1',
      package: { packageId: 'p', versionId: 'v' } as never,
      name: 'demo',
      destination
    })
    await globals.window.api.skills.removeInstall({ environmentId: 'env-1', name: 'demo', destination })
    await globals.window.api.skills.listManagedInstalls()

    const methods = calls.map((call) => call.method)
    expect(methods).toContain('skills.previewInstall')
    expect(methods).toContain('skills.removeInstall')
    expect(methods).toContain('skills.listManagedInstalls')

    const preview = calls.find((call) => call.method === 'skills.previewInstall')
      ?.params as Record<string, unknown>
    expect(preview).not.toHaveProperty('environmentId')
    const remove = calls.find((call) => call.method === 'skills.removeInstall')?.params as Record<
      string,
      unknown
    >
    expect(remove).not.toHaveProperty('environmentId')
    // The RPC requires an operation id the desktop member does not carry.
    expect(typeof remove.operationId).toBe('string')
  }, 15_000)

  it('says sign-in must happen on the host, rather than blaming the host for not being configured', async () => {
    const calls: RuntimeCall[] = []
    const globals = await installApi(calls)

    const result = await globals.window.api.orcaProfiles.connectCurrent()

    expect(result.status).toBe('failed')
    expect(String((result as { error?: string }).error)).toMatch(/loopback/i)
  }, 15_000)
})
