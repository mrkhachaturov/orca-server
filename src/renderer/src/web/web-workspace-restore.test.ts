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

  it('reopens the workspace the host says was last active', async () => {
    // Why: nothing consumed `ui.lastActive*` into the session, so a restarted tile landed on
    // "Select a workspace from the sidebar" with every worktree already listed beside it.
    const readCalls: { method: string; params: unknown }[] = []
    mockRuntimeUiSlice(readCalls, {
      lastActiveRepoId: 'repo-1',
      lastActiveWorktreeId: 'repo-1::/w/feature'
    })

    const globals = installBrowserGlobals('Linux')
    writeStoredRuntimeEnvironment(globals.storage)
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()

    // Boot order: App.tsx awaits ui.get() before reading the session.
    await globals.window.api.ui.get()
    const restored = await globals.window.api.session.get()

    // A paired browser keeps no session of its own: the tabs come back over session.tabs.
    expect(globals.storage.getItem('orca.web.workspaceSession.v1')).toBeNull()
    expect(restored.activeRepoId).toBe('repo-1')
    expect(restored.activeWorktreeId).toBe('repo-1::/w/feature')
    expect(readCalls.map((call) => call.method)).toEqual(['ui.get'])
  }, 15_000)

  it('falls back to this browser\'s own copy when the host has no pointer yet', async () => {
    // Why: a client paired before the pointer was ever recorded must still restore. The host
    // half is authoritative, so this is a fallback and never an override.
    const runtimeCalls: { method: string; params: unknown }[] = []
    mockRuntimeUiSlice(runtimeCalls, {})

    const globals = installBrowserGlobals('Linux')
    writeStoredRuntimeEnvironment(globals.storage)
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()

    await globals.window.api.ui.get()
    await globals.window.api.session.set(
      workspaceSession({ activeRepoId: 'repo-3', activeWorktreeId: 'repo-3::/w/local' })
    )

    const restored = await globals.window.api.session.get()

    expect(restored.activeRepoId).toBe('repo-3')
    expect(restored.activeWorktreeId).toBe('repo-3::/w/local')
  }, 15_000)

  it('carries the unchanged half forward through a partial patch', async () => {
    // Why: session.patch merges onto getStoredWorkspaceSession, so without the fallback the
    // merge base is the host's null and switching worktree erases the repo pointer with it.
    const runtimeCalls: { method: string; params: unknown }[] = []
    mockRuntimeUiSlice(runtimeCalls, {})

    const globals = installBrowserGlobals('Linux')
    writeStoredRuntimeEnvironment(globals.storage)
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()

    await globals.window.api.ui.get()
    await globals.window.api.session.set(
      workspaceSession({ activeRepoId: 'repo-1', activeWorktreeId: 'repo-1::/w/feature' })
    )
    await globals.window.api.session.patch({ activeWorktreeId: 'repo-1::/w/other' })

    const restored = await globals.window.api.session.get()

    expect(restored.activeRepoId).toBe('repo-1')
    expect(restored.activeWorktreeId).toBe('repo-1::/w/other')
  }, 15_000)

  it('never takes the active workspace from a non-local host partition', async () => {
    const runtimeCalls: { method: string; params: unknown }[] = []
    mockRuntimeUiSlice(runtimeCalls, {})

    const globals = installBrowserGlobals('Linux')
    writeStoredRuntimeEnvironment(globals.storage)
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()

    await globals.window.api.ui.get()
    await globals.window.api.session.set(
      workspaceSession({ activeRepoId: 'repo-2', activeWorktreeId: 'repo-2::/w/other' }),
      'runtime:web-env-1'
    )

    // Why: the pointer is a global session field owned by the local partition. A non-local
    // host must not read it back, or two hosts would fight over which workspace is open.
    const nonLocal = await globals.window.api.session.get('runtime:web-env-1')

    expect(nonLocal.activeRepoId).toBe('repo-2')
    expect(await globals.window.api.session.get()).toMatchObject({ activeRepoId: null })
  }, 15_000)
})
