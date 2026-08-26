import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeRpcResponse } from '../../../shared/runtime-rpc-envelope'
import {
  installBrowserGlobals,
  writeStoredRuntimeEnvironment
} from './web-preload-api-test-harness'

describe('floating markdown directory in the web tile', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function mockRuntime(
    calls: { method: string; params: unknown }[],
    result: unknown
  ): void {
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

  it('asks the host for the directory its own floating notes live in', async () => {
    const calls: { method: string; params: unknown }[] = []
    mockRuntime(calls, { path: '/srv/orca/floating-notes' })

    const globals = installBrowserGlobals('Linux')
    writeStoredRuntimeEnvironment(globals.storage)
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()

    const directory = await globals.window.api.app.getFloatingMarkdownDirectory()

    // The symptom: '' is falsy, and the floating panel reads a falsy directory as "nowhere to
    // put a note", so New/Open Markdown Note did nothing at all — no error, no file.
    expect(directory).toBe('/srv/orca/floating-notes')
    expect(calls.map((call) => call.method)).toEqual(['floatingWorkspace.markdownDirectory'])
  }, 15_000)

  it('answers nothing rather than a client path when no environment is active', async () => {
    const calls: { method: string; params: unknown }[] = []
    mockRuntime(calls, { path: '/srv/orca/floating-notes' })

    const globals = installBrowserGlobals('Linux')
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()

    // The notes live on the server beside its floating terminals; unpaired there is no server.
    expect(await globals.window.api.app.getFloatingMarkdownDirectory()).toBe('')
    expect(calls).toEqual([])
  }, 15_000)
})
