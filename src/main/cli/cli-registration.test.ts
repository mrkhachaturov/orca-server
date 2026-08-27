import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CliInstallStatus } from '../../shared/cli-install-types'
import type {
  HydrationResult,
  hydrateShellPath,
  mergePathSegments
} from '../startup/hydrate-shell-path'

const mocks = vi.hoisted(() => ({
  hydrateShellPath: vi.fn<typeof hydrateShellPath>(),
  mergePathSegments: vi.fn<typeof mergePathSegments>(),
  getStatus: vi.fn<() => Promise<CliInstallStatus>>(),
  install: vi.fn<() => Promise<CliInstallStatus>>(),
  remove: vi.fn<() => Promise<CliInstallStatus>>(),
  calls: [] as string[]
}))

vi.mock('../startup/hydrate-shell-path', () => ({
  hydrateShellPath: mocks.hydrateShellPath,
  mergePathSegments: mocks.mergePathSegments
}))

vi.mock('./cli-installer', () => ({
  CliInstaller: class {
    getStatus = mocks.getStatus
    install = mocks.install
    remove = mocks.remove
  }
}))

const {
  getCliInstallStatusWithShellPathHydration,
  installCliWithShellPathHydration,
  removeCliWithShellPathHydration
} = await import('./cli-registration')

const INSTALLED: CliInstallStatus = {
  platform: 'linux',
  commandName: 'orca-ide',
  commandPath: '/home/orca/.local/bin/orca-ide',
  pathDirectory: '/home/orca/.local/bin',
  pathConfigured: true,
  launcherPath: '/opt/orca/resources/bin/orca-ide',
  installMethod: 'symlink',
  supported: true,
  state: 'installed',
  currentTarget: '/opt/orca/resources/bin/orca-ide',
  unsupportedReason: null,
  detail: null
}

const HYDRATED: HydrationResult = {
  ok: true,
  segments: ['/opt/homebrew/bin'],
  failureReason: 'none'
}

const HYDRATION_FAILED: HydrationResult = {
  ok: false,
  segments: [],
  failureReason: 'spawn_error'
}

describe('cli registration off the ipcMain graph', () => {
  beforeEach(() => {
    mocks.calls.length = 0
    mocks.hydrateShellPath.mockReset()
    mocks.mergePathSegments.mockReset()
    mocks.getStatus.mockReset()
    mocks.install.mockReset()
    mocks.remove.mockReset()
    mocks.hydrateShellPath.mockImplementation(async () => {
      mocks.calls.push('hydrate')
      return HYDRATED
    })
    mocks.getStatus.mockImplementation(async () => {
      mocks.calls.push('getStatus')
      return INSTALLED
    })
    mocks.install.mockImplementation(async () => {
      mocks.calls.push('install')
      return INSTALLED
    })
    mocks.remove.mockImplementation(async () => {
      mocks.calls.push('remove')
      return INSTALLED
    })
  })

  it('hydrates the shell PATH before probing status', async () => {
    // Why: `pathConfigured` is measured against PATH. Probing first reports the
    // sparse GUI PATH, so the card claims the CLI is unregistered when it is not.
    await getCliInstallStatusWithShellPathHydration()

    expect(mocks.calls).toEqual(['hydrate', 'getStatus'])
  })

  it('forces re-hydration before installing, not before reading', async () => {
    // Why: install writes the launcher against the resolved PATH, so it may not
    // reuse a PATH cached before the user edited their shell profile.
    await installCliWithShellPathHydration()
    expect(mocks.hydrateShellPath).toHaveBeenCalledWith({ force: true })

    mocks.hydrateShellPath.mockClear()
    await getCliInstallStatusWithShellPathHydration()
    expect(mocks.hydrateShellPath).toHaveBeenCalledWith(undefined)
  })

  it('hydrates before removing', async () => {
    await removeCliWithShellPathHydration()

    expect(mocks.calls).toEqual(['hydrate', 'remove'])
  })

  it('merges the hydrated segments into the live PATH', async () => {
    // Why: hydrateShellPath only reports segments; without the merge the child
    // process the installer spawns still runs with the GUI PATH.
    await getCliInstallStatusWithShellPathHydration()

    expect(mocks.mergePathSegments).toHaveBeenCalledWith(HYDRATED.segments)
  })

  it('does not merge when hydration failed', async () => {
    mocks.hydrateShellPath.mockResolvedValue(HYDRATION_FAILED)

    await getCliInstallStatusWithShellPathHydration()

    expect(mocks.mergePathSegments).not.toHaveBeenCalled()
  })
})
