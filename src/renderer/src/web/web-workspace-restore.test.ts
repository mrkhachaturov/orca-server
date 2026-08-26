import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeRpcResponse } from '../../../shared/runtime-rpc-envelope'
import type { WorkspaceSessionState } from '../../../shared/workspace-session-state-types'
import {
  installBrowserGlobals,
  writeStoredRuntimeEnvironment
} from './web-preload-api-test-harness'

/** Annotated, never cast: the compiler has to reject a key that is not on the real state. */
function workspaceSession(overrides: Partial<WorkspaceSessionState>): WorkspaceSessionState {
  return {
    activeRepoId: null,
    activeWorktreeId: null,
    activeTabId: null,
    tabsByWorktree: {},
    terminalLayoutsByTabId: {},
    ...overrides
  }
}

describe('web workspace restore', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function mockRuntimeUiSlice(
    runtimeCalls: { method: string; params: unknown }[],
    ui: Record<string, unknown>
  ): void {
    vi.doMock('./web-runtime-client', () => ({
      WebRuntimeClient: class {
        call(method: string, params?: unknown): Promise<RuntimeRpcResponse<unknown>> {
          runtimeCalls.push({ method, params })
          return Promise.resolve({
            id: `call-${runtimeCalls.length}`,
            ok: true,
            result: { ui: { featureInteractions: {}, contextualToursSeenIds: [], ...ui } },
            _meta: { runtimeId: 'runtime-1' }
          })
        }

        close(): void {}
      }
    }))
  }

  it('records the active workspace on the host so a fresh browser restores it', async () => {
    const writeCalls: { method: string; params: unknown }[] = []
    mockRuntimeUiSlice(writeCalls, {})

    const before = installBrowserGlobals('Linux')
    writeStoredRuntimeEnvironment(before.storage)
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()

    await before.window.api.session.set(
      workspaceSession({ activeRepoId: 'repo-1', activeWorktreeId: 'repo-1::/w/feature' })
    )

    // The pointer upstream's paired-client session read already consumes, finally written.
    expect(writeCalls).toEqual([
      {
        method: 'ui.set',
        params: { lastActiveRepoId: 'repo-1', lastActiveWorktreeId: 'repo-1::/w/feature' }
      }
    ])

    // Restart: a browser with no session and no ui of its own, only the pairing.
    vi.resetModules()
    vi.unstubAllGlobals()
    const readCalls: { method: string; params: unknown }[] = []
    mockRuntimeUiSlice(readCalls, {
      lastActiveRepoId: 'repo-1',
      lastActiveWorktreeId: 'repo-1::/w/feature'
    })

    const after = installBrowserGlobals('Linux')
    writeStoredRuntimeEnvironment(after.storage)
    const restarted = await import('./web-preload-api')
    restarted.installWebPreloadApi()

    // Boot order: App.tsx awaits ui.get() before reading the session.
    await after.window.api.ui.get()
    const restored = await after.window.api.session.get()

    expect(after.storage.getItem('orca.web.workspaceSession.v1')).toBeNull()
    expect(restored.activeRepoId).toBe('repo-1')
    expect(restored.activeWorktreeId).toBe('repo-1::/w/feature')
    expect(readCalls.map((call) => call.method)).toEqual(['ui.get'])
  }, 15_000)

  it('never takes the active workspace from a non-local host partition', async () => {
    const runtimeCalls: { method: string; params: unknown }[] = []
    mockRuntimeUiSlice(runtimeCalls, {})

    const globals = installBrowserGlobals('Linux')
    writeStoredRuntimeEnvironment(globals.storage)
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()

    await globals.window.api.session.set(
      workspaceSession({ activeRepoId: 'repo-2', activeWorktreeId: 'repo-2::/w/other' }),
      'runtime:web-env-1'
    )

    expect(runtimeCalls).toEqual([])
    expect(JSON.parse(globals.storage.getItem('orca.web.ui.v1') ?? '{}')).not.toMatchObject({
      lastActiveWorktreeId: 'repo-2::/w/other'
    })
  }, 15_000)
})
