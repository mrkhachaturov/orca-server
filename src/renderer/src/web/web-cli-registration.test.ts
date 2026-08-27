import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CliInstallStatus } from '../../../shared/cli-install-types'
import type { RuntimeRpcResponse } from '../../../shared/runtime-rpc-envelope'
import {
  installBrowserGlobals,
  writeStoredRuntimeEnvironment
} from './web-preload-api-test-harness'

type RuntimeCall = { method: string; params: unknown }

const SERVER_STATUS: CliInstallStatus = {
  platform: 'linux',
  commandName: 'orca-ide',
  commandPath: '/home/coder/.local/bin/orca-ide',
  pathDirectory: '/home/coder/.local/bin',
  pathConfigured: true,
  launcherPath: '/opt/orca-server.AppImage',
  installMethod: 'wrapper',
  supported: true,
  state: 'installed',
  currentTarget: '/opt/orca-server.AppImage',
  unsupportedReason: null,
  detail: 'Registered at /home/coder/.local/bin/orca-ide.'
}

function mockRuntime(calls: RuntimeCall[], respond: () => unknown): void {
  vi.doMock('./web-runtime-client', () => ({
    WebRuntimeClient: class {
      call(method: string, params?: unknown): Promise<RuntimeRpcResponse<unknown>> {
        calls.push({ method, params })
        return Promise.resolve({
          id: `call-${calls.length}`,
          ok: true,
          result: respond(),
          _meta: { runtimeId: 'runtime-1' }
        })
      }

      close(): void {}
    }
  }))
}

describe('web CLI registration', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock('./web-runtime-client')
  })

  async function installApi(
    calls: RuntimeCall[],
    options: { connected?: boolean; respond?: () => unknown } = {}
  ) {
    mockRuntime(calls, options.respond ?? (() => SERVER_STATUS))
    const globals = installBrowserGlobals('Linux')
    if (options.connected !== false) {
      writeStoredRuntimeEnvironment(globals.storage)
    }
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()
    return globals
  }

  it('reports the connected server CLI status, not "unavailable"', async () => {
    // Why: the stub answered supported:false with no call, so every agent-skill setup
    // card read "Orca CLI registration is unavailable" against a server that has one.
    const calls: RuntimeCall[] = []
    const globals = await installApi(calls)

    const status = await globals.window.api.cli.getInstallStatus()

    expect(calls.map((call) => call.method)).toEqual(['cli.getInstallStatus'])
    expect(status).toEqual(SERVER_STATUS)
  }, 15_000)

  it('registers orca-ide on the server', async () => {
    // Why: the Register button resolved a canned unsupported status, so nothing was
    // ever written to the workspace PATH and the card never changed state.
    const calls: RuntimeCall[] = []
    const globals = await installApi(calls)

    const status = await globals.window.api.cli.install()

    expect(calls.map((call) => call.method)).toEqual(['cli.install'])
    expect(status).toEqual(SERVER_STATUS)
  }, 15_000)

  it('removes the registration on the server', async () => {
    const removed: CliInstallStatus = { ...SERVER_STATUS, state: 'not_installed' }
    const calls: RuntimeCall[] = []
    const globals = await installApi(calls, { respond: () => removed })

    const status = await globals.window.api.cli.remove()

    expect(calls.map((call) => call.method)).toEqual(['cli.remove'])
    expect(status).toEqual(removed)
  }, 15_000)

  it('reports unsupported with no server connected', async () => {
    // Regression guard: green on upstream too. A browser with no environment has no
    // CLI to register, and the card must say so rather than dial nothing.
    const calls: RuntimeCall[] = []
    const globals = await installApi(calls, { connected: false })

    const status = await globals.window.api.cli.getInstallStatus()

    expect(calls).toEqual([])
    expect(status.supported).toBe(false)
    expect(status.state).toBe('unsupported')
  }, 15_000)

  it('leaves WSL registration unsupported and unrouted', async () => {
    // Why: WSL is a Windows-desktop affordance; a headless Linux serve implements no
    // such method, so routing it would reject where the card expects a status.
    const calls: RuntimeCall[] = []
    const globals = await installApi(calls)

    const status = await globals.window.api.cli.getWslInstallStatus({ distro: 'Ubuntu' })

    expect(calls).toEqual([])
    expect(status.supported).toBe(false)
  }, 15_000)
})
