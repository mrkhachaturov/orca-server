// `session.patch` hands rememberWebActiveWorkspace a raw Partial, and the restore path reads
// `ui.lastActiveRepoId ?? localSession.activeRepoId`, which cannot fall through a stored null.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeRpcResponse } from '../../../shared/runtime-rpc-envelope'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

function installBrowserGlobals(): {
  window: Window & typeof globalThis
  storage: MemoryStorage
} {
  const storage = new MemoryStorage()
  const windowStub = {
    localStorage: storage,
    location: { protocol: 'http:', reload: vi.fn() },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
    btoa: (value: string) => Buffer.from(value, 'binary').toString('base64')
  } as unknown as Window & typeof globalThis
  vi.stubGlobal('window', windowStub)
  vi.stubGlobal('navigator', { userAgent: 'Linux', hardwareConcurrency: 8 })
  return { window: windowStub, storage }
}

function writeStoredRuntimeEnvironment(storage: Storage, environmentId = 'web-env-1'): void {
  storage.setItem(
    'orca.web.runtimeEnvironment.v1',
    JSON.stringify({
      id: environmentId,
      name: 'Test runtime',
      createdAt: 1,
      updatedAt: 1,
      lastUsedAt: null,
      runtimeId: null,
      preferredEndpointId: `ws-${environmentId}`,
      endpoints: [
        {
          id: `ws-${environmentId}`,
          kind: 'websocket',
          label: 'WebSocket',
          endpoint: 'ws://127.0.0.1:1234',
          deviceToken: 'token',
          publicKeyB64: 'public-key'
        }
      ]
    })
  )
}

function mockRuntimeUiSlice(runtimeCalls: { method: string; params: unknown }[]): void {
  vi.doMock('./web-runtime-client', () => ({
    WebRuntimeClient: class {
      call(method: string, params?: unknown): Promise<RuntimeRpcResponse<unknown>> {
        runtimeCalls.push({ method, params })
        return Promise.resolve({
          id: `call-${runtimeCalls.length}`,
          ok: true,
          result: { ui: { featureInteractions: {}, contextualToursSeenIds: [] } },
          _meta: { runtimeId: 'runtime-1' }
        })
      }

      close(): void {}
    }
  }))
}

async function waitForCall(
  calls: { method: string; params: unknown }[],
  method: string,
  count: number
): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (calls.filter((call) => call.method === method).length >= count) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

describe('web active-workspace pointer under a partial session patch', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock('./web-runtime-client')
  })

  it('keeps the repo pointer when a patch carries only activeWorktreeId', async () => {
    const runtimeCalls: { method: string; params: unknown }[] = []
    mockRuntimeUiSlice(runtimeCalls)

    const globals = installBrowserGlobals()
    writeStoredRuntimeEnvironment(globals.storage)
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()

    await globals.window.api.session.set({
      activeRepoId: 'repo-1',
      activeWorktreeId: 'repo-1::/w/feature'
    } as never)
    await waitForCall(runtimeCalls, 'ui.set', 1)

    expect(runtimeCalls.filter((call) => call.method === 'ui.set')[0]?.params).toEqual({
      lastActiveRepoId: 'repo-1',
      lastActiveWorktreeId: 'repo-1::/w/feature'
    })

    // A partial patch, as switching worktrees does.
    await globals.window.api.session.patch({
      activeWorktreeId: 'repo-1::/w/other'
    } as never)
    await waitForCall(runtimeCalls, 'ui.set', 2)

    const uiSetCalls = runtimeCalls.filter((call) => call.method === 'ui.set')
    const latest = uiSetCalls[uiSetCalls.length - 1]?.params as {
      lastActiveRepoId: string | null
      lastActiveWorktreeId: string | null
    }
    expect(latest).toEqual({
      lastActiveRepoId: 'repo-1',
      lastActiveWorktreeId: 'repo-1::/w/other'
    })
  }, 20_000)

  it('writes the pointer into localStorage before any RPC, with no active environment', async () => {
    const globals = installBrowserGlobals()
    // No stored runtime environment, so requireActiveEnvironmentOrNull() is null.
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()

    await globals.window.api.session.set({
      activeRepoId: 'repo-9',
      activeWorktreeId: 'repo-9::/w/solo'
    } as never)

    expect(JSON.parse(globals.storage.getItem('orca.web.ui.v1') ?? '{}')).toMatchObject({
      lastActiveRepoId: 'repo-9',
      lastActiveWorktreeId: 'repo-9::/w/solo'
    })
  }, 20_000)
})
