import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeRpcResponse } from '../../../shared/runtime-rpc-envelope'
import {
  installBrowserGlobals,
  writeStoredRuntimeEnvironment
} from './web-preload-api-test-harness'

type RuntimeCall = { method: string; params: unknown }

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

const PLUGIN_ENTRY = { key: 'acme.hello', name: 'Hello', enabled: true }

describe('web plugins bridge', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock('./web-runtime-client')
  })

  async function installApi(calls: RuntimeCall[], result: unknown = [PLUGIN_ENTRY]) {
    mockRuntime(calls, result)
    const globals = installBrowserGlobals('Linux')
    writeStoredRuntimeEnvironment(globals.storage)
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()
    return globals
  }

  it('lists the plugins installed on the server, not nothing at all', async () => {
    // Why: with no `plugins` key the namespace fell through createFallbackProxy and every
    // call resolved to undefined, so the Plugins pane rendered an empty list forever.
    const calls: RuntimeCall[] = []
    const globals = await installApi(calls)

    const plugins = await globals.window.api.plugins.list()

    expect(calls.map((call) => call.method)).toEqual(['plugins.list'])
    expect(plugins).toEqual([PLUGIN_ENTRY])
  }, 15_000)

  it('enables a plugin on the host', async () => {
    // Why: the toggle resolved undefined, so the switch snapped back with no error shown.
    const calls: RuntimeCall[] = []
    const globals = await installApi(calls)

    await globals.window.api.plugins.setEnabled({ pluginKey: 'acme.hello', enabled: true })

    expect(calls[0]).toEqual({
      method: 'plugins.setEnabled',
      params: { pluginKey: 'acme.hello', enabled: true }
    })
  }, 15_000)

  it('records consent on the host, which headless serve has no dialog for', async () => {
    const calls: RuntimeCall[] = []
    const globals = await installApi(calls)

    await globals.window.api.plugins.consent({
      pluginKey: 'acme.hello',
      reviewedFingerprint: 'sha256:abc',
      decision: 'approve'
    })

    expect(calls[0]).toEqual({
      method: 'plugins.consent',
      params: {
        pluginKey: 'acme.hello',
        reviewedFingerprint: 'sha256:abc',
        decision: 'approve'
      }
    })
  }, 15_000)

  it('routes the panel bridge and command surfaces to the host', async () => {
    // Each capability gets its own case: the panel bridge is where consented capability
    // enforcement lives, so a silently-undefined relay is a security-relevant no-op.
    const calls: RuntimeCall[] = []
    const globals = await installApi(calls, { outcome: 'ok' })

    await globals.window.api.plugins.readPanelEntry({
      pluginKey: 'acme.hello',
      panelId: 'main'
    })
    await globals.window.api.plugins.invokeCommand({
      pluginKey: 'acme.hello',
      commandId: 'greet'
    })
    await globals.window.api.plugins.panelAction({
      sessionToken: 'tok',
      action: 'read'
    })

    expect(calls.map((call) => call.method)).toEqual([
      'plugins.readPanelEntry',
      'plugins.invokeCommand',
      'plugins.panelAction'
    ])
  }, 15_000)

  it('leaves a member with no runtime method on the existing fallback', async () => {
    // Why: install/marketplace/logs exist only as ipcMain handlers upstream. Routing them
    // would reject where they used to resolve undefined, and `onChanged` must keep
    // returning an unsubscribe function synchronously or the panes that call it break.
    const calls: RuntimeCall[] = []
    const globals = await installApi(calls)

    const unsubscribe = globals.window.api.plugins.onChanged(() => {})

    expect(typeof unsubscribe).toBe('function')
    expect(await globals.window.api.plugins.refresh()).toBeUndefined()
    expect(calls).toEqual([])
  }, 15_000)
})
