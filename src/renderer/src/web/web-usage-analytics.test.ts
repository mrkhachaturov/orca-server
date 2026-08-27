import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeRpcResponse } from '../../../shared/runtime-rpc-envelope'
import {
  installBrowserGlobals,
  writeStoredRuntimeEnvironment
} from './web-preload-api-test-harness'

type RuntimeCall = { method: string; params: unknown }

const SCAN_STATE = { enabled: true, scanning: false, lastScanAt: 1 }

function mockRuntime(calls: RuntimeCall[], result: unknown): void {
  vi.doMock('./web-runtime-client', () => ({
    WebRuntimeClient: class {
      call(method: string, params?: unknown): Promise<RuntimeRpcResponse<unknown>> {
        calls.push({ method, params })
        return Promise.resolve({
          id: `call-${calls.length}`,
          ok: true,
          result,
          _meta: { runtimeId: 'runtime-1' }
        })
      }

      close(): void {}
    }
  }))
}

describe('web usage analytics', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock('./web-runtime-client')
  })

  async function installApi(calls: RuntimeCall[], result: unknown = SCAN_STATE) {
    mockRuntime(calls, result)
    const globals = installBrowserGlobals('Linux')
    writeStoredRuntimeEnvironment(globals.storage)
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()
    return globals
  }

  it('reads the scan state off the host instead of resolving undefined', async () => {
    // Why: with no claudeUsage key the namespace fell through createFallbackProxy, so
    // Stats & Usage read undefined and rendered "Not scanned yet" forever.
    const calls: RuntimeCall[] = []
    const globals = await installApi(calls)

    const state = await globals.window.api.claudeUsage.getScanState()

    expect(calls).toEqual([{ method: 'usage.getScanState', params: { provider: 'claude' } }])
    expect(state).toEqual(SCAN_STATE)
  }, 15_000)

  it('enables a provider on the host', async () => {
    // Why: the Enable button did nothing at all — no error, no effect.
    const calls: RuntimeCall[] = []
    const globals = await installApi(calls)

    await globals.window.api.claudeUsage.setEnabled({ enabled: true })

    expect(calls).toEqual([
      { method: 'usage.setEnabled', params: { provider: 'claude', enabled: true } }
    ])
  }, 15_000)

  it('rescans on demand, and omits force rather than sending undefined', async () => {
    // Why: the RPC schema rejects unknown keys, so an explicit `force: undefined` on the
    // no-argument Refresh would fail the whole call.
    const calls: RuntimeCall[] = []
    const globals = await installApi(calls)

    await globals.window.api.claudeUsage.refresh()
    await globals.window.api.claudeUsage.refresh({ force: true })

    expect(calls).toEqual([
      { method: 'usage.refresh', params: { provider: 'claude' } },
      { method: 'usage.refresh', params: { provider: 'claude', force: true } }
    ])
  }, 15_000)

  it('fetches the whole ledger in one snapshot call', async () => {
    // Why: the pane batches through getSnapshot, so this is the call the empty ledger
    // was actually missing.
    const calls: RuntimeCall[] = []
    const globals = await installApi(calls)

    await globals.window.api.claudeUsage.getSnapshot({ scope: 'orca', range: '30d', limit: 20 })

    expect(calls).toEqual([
      {
        method: 'usage.getSnapshot',
        params: { provider: 'claude', scope: 'orca', range: '30d', limit: 20 }
      }
    ])
  }, 15_000)

  it('fetches the summary the desktop claudeUsage:getSummary handler answers', async () => {
    const calls: RuntimeCall[] = []
    const globals = await installApi(calls)

    await globals.window.api.claudeUsage.getSummary({ scope: 'all', range: '7d' })

    expect(calls).toEqual([
      { method: 'usage.getSummary', params: { provider: 'claude', scope: 'all', range: '7d' } }
    ])
  }, 15_000)

  it('fetches the daily series the desktop claudeUsage:getDaily handler answers', async () => {
    const calls: RuntimeCall[] = []
    const globals = await installApi(calls)

    await globals.window.api.claudeUsage.getDaily({ scope: 'orca', range: '90d' })

    expect(calls).toEqual([
      { method: 'usage.getDaily', params: { provider: 'claude', scope: 'orca', range: '90d' } }
    ])
  }, 15_000)

  it('carries the breakdown kind through, so model and project are not one call', async () => {
    const calls: RuntimeCall[] = []
    const globals = await installApi(calls)

    await globals.window.api.claudeUsage.getBreakdown({
      scope: 'orca',
      range: '30d',
      kind: 'project'
    })

    expect(calls).toEqual([
      {
        method: 'usage.getBreakdown',
        params: { provider: 'claude', scope: 'orca', range: '30d', kind: 'project' }
      }
    ])
  }, 15_000)

  it('fetches recent sessions the desktop claudeUsage:getRecentSessions handler answers', async () => {
    const calls: RuntimeCall[] = []
    const globals = await installApi(calls)

    await globals.window.api.claudeUsage.getRecentSessions({
      scope: 'orca',
      range: 'all',
      limit: 5
    })

    expect(calls).toEqual([
      {
        method: 'usage.getRecentSessions',
        params: { provider: 'claude', scope: 'orca', range: 'all', limit: 5 }
      }
    ])
  }, 15_000)

  it('names each of the three providers on the wire', async () => {
    // Why: one factory serves three namespaces; a wrong key would silently report
    // Claude's ledger under Codex.
    const calls: RuntimeCall[] = []
    const globals = await installApi(calls)

    await globals.window.api.codexUsage.getScanState()
    await globals.window.api.openCodeUsage.getScanState()

    expect(calls.map((call) => call.params)).toEqual([
      { provider: 'codex' },
      { provider: 'openCode' }
    ])
  }, 15_000)
})
