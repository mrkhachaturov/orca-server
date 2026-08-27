import { describe, expect, it, vi, beforeEach } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { RpcRequest } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { CliInstallStatus } from '../../../../shared/cli-install-types'

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  install: vi.fn(),
  remove: vi.fn()
}))

vi.mock('../../../cli/cli-registration', () => ({
  getCliInstallStatusWithShellPathHydration: mocks.getStatus,
  installCliWithShellPathHydration: mocks.install,
  removeCliWithShellPathHydration: mocks.remove
}))

// Imported after the mock so the method module binds to the stubs.
const { CLI_METHODS } = await import('./cli')

function makeRequest(method: string, params?: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method, params }
}

const installedStatus: CliInstallStatus = {
  platform: 'linux',
  commandName: 'orca-ide',
  commandPath: '/home/coder/.local/bin/orca-ide',
  pathDirectory: '/home/coder/.local/bin',
  pathConfigured: true,
  launcherPath: '/opt/orca.AppImage',
  installMethod: 'wrapper',
  supported: true,
  state: 'installed',
  currentTarget: '/opt/orca.AppImage',
  unsupportedReason: null,
  detail: 'Registered at /home/coder/.local/bin/orca-ide.'
}

describe('cli RPC methods', () => {
  const runtime = { getRuntimeId: () => 'test-runtime' } as unknown as OrcaRuntimeService

  beforeEach(() => {
    mocks.getStatus.mockReset()
    mocks.install.mockReset()
    mocks.remove.mockReset()
  })

  it('returns the server CLI install status', async () => {
    mocks.getStatus.mockResolvedValue(installedStatus)
    const dispatcher = new RpcDispatcher({ runtime, methods: CLI_METHODS })

    const response = await dispatcher.dispatch(makeRequest('cli.getInstallStatus'))

    expect(mocks.getStatus).toHaveBeenCalledTimes(1)
    expect(response).toMatchObject({ ok: true, result: installedStatus })
  })

  it('registers the CLI via the server installer', async () => {
    mocks.install.mockResolvedValue(installedStatus)
    const dispatcher = new RpcDispatcher({ runtime, methods: CLI_METHODS })

    const response = await dispatcher.dispatch(makeRequest('cli.install'))

    expect(mocks.install).toHaveBeenCalledTimes(1)
    expect(response).toMatchObject({ ok: true, result: installedStatus })
  })

  it('removes the CLI registration via the server installer', async () => {
    const removedStatus: CliInstallStatus = { ...installedStatus, state: 'not_installed' }
    mocks.remove.mockResolvedValue(removedStatus)
    const dispatcher = new RpcDispatcher({ runtime, methods: CLI_METHODS })

    const response = await dispatcher.dispatch(makeRequest('cli.remove'))

    expect(mocks.remove).toHaveBeenCalledTimes(1)
    expect(response).toMatchObject({ ok: true, result: removedStatus })
  })

  it('registers the three methods on the runtime', async () => {
    // Why: the web preload routes cli.getInstallStatus/install/remove over RPC. A family
    // missing from ALL_RPC_METHODS is refused by the dispatcher, so every setup card
    // reverts to "Orca CLI registration is unavailable" with this handler still green.
    const { ALL_RPC_METHODS } = await import('./index')
    const registered = new Set(ALL_RPC_METHODS.map((method) => method.name))

    expect(
      ['cli.getInstallStatus', 'cli.install', 'cli.remove'].filter(
        (method) => !registered.has(method)
      )
    ).toEqual([])
  })
})
