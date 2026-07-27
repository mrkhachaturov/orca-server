import { describe, expect, it, vi, beforeEach } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { RpcRequest } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { FLOATING_WORKSPACE_METHODS } from './floating-workspace'

const mocks = vi.hoisted(() => ({
  resolveFloatingTerminalCwd: vi.fn(),
  grantFloatingWorkspaceDirectory: vi.fn()
}))

function makeRequest(method: string, params?: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method, params }
}

// Why: the handlers delegate straight to the runtime service — a bare stub with
// the two floating-workspace methods is enough for the dispatcher wiring.
const runtime = {
  getRuntimeId: () => 'test-runtime',
  resolveFloatingTerminalCwd: mocks.resolveFloatingTerminalCwd,
  grantFloatingWorkspaceDirectory: mocks.grantFloatingWorkspaceDirectory
} as unknown as OrcaRuntimeService

describe('floating-workspace RPC methods', () => {
  beforeEach(() => {
    mocks.resolveFloatingTerminalCwd.mockReset()
    mocks.grantFloatingWorkspaceDirectory.mockReset()
  })

  it('resolves the floating terminal cwd on the server host', async () => {
    mocks.resolveFloatingTerminalCwd.mockResolvedValue('/home/coder/.codex')
    const dispatcher = new RpcDispatcher({ runtime, methods: FLOATING_WORKSPACE_METHODS })

    const response = await dispatcher.dispatch(
      makeRequest('floatingWorkspace.resolveCwd', { path: '~/.codex' })
    )

    expect(mocks.resolveFloatingTerminalCwd).toHaveBeenCalledWith({ path: '~/.codex' })
    expect(response).toMatchObject({ ok: true, result: '/home/coder/.codex' })
  })

  it('grants a picker-approved directory on the server host', async () => {
    mocks.grantFloatingWorkspaceDirectory.mockResolvedValue(undefined)
    const dispatcher = new RpcDispatcher({ runtime, methods: FLOATING_WORKSPACE_METHODS })

    const response = await dispatcher.dispatch(
      makeRequest('floatingWorkspace.grantDirectory', { path: '/home/coder/.codex' })
    )

    expect(mocks.grantFloatingWorkspaceDirectory).toHaveBeenCalledWith('/home/coder/.codex')
    expect(response).toMatchObject({ ok: true, result: { ok: true } })
  })

  it('rejects a grant request without a path', async () => {
    const dispatcher = new RpcDispatcher({ runtime, methods: FLOATING_WORKSPACE_METHODS })

    const response = await dispatcher.dispatch(makeRequest('floatingWorkspace.grantDirectory', {}))

    expect(response).toMatchObject({ ok: false })
    expect(mocks.grantFloatingWorkspaceDirectory).not.toHaveBeenCalled()
  })
})
