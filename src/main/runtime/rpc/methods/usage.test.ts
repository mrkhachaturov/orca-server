import { describe, expect, it, vi, beforeEach } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { RpcRequest } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { RuntimeUsageProvider } from '../../../../shared/runtime-usage-providers'
import type {
  ClaudeUsageBreakdownRow,
  ClaudeUsageDailyPoint,
  ClaudeUsageScanState,
  ClaudeUsageSessionRow,
  ClaudeUsageSnapshot,
  ClaudeUsageSummary
} from '../../../../shared/claude-usage-types'
import { USAGE_METHODS } from './usage'

function makeRequest(method: string, params?: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method, params }
}

function createUsageStoreStub() {
  return {
    getScanState: vi.fn(),
    setEnabled: vi.fn(),
    refresh: vi.fn(),
    getSnapshot: vi.fn(),
    getSummary: vi.fn(),
    getDaily: vi.fn(),
    getBreakdown: vi.fn(),
    getRecentSessions: vi.fn()
  }
}

type UsageStoreStub = ReturnType<typeof createUsageStoreStub>

// Refuses an unresolvable provider the way OrcaRuntimeService.getUsageStore does — answering
// `undefined` is the exact failure this surface exists to remove.
function createRuntime(
  stores: Partial<Record<RuntimeUsageProvider, UsageStoreStub>>
): OrcaRuntimeService {
  return {
    getRuntimeId: () => 'test-runtime',
    getUsageStore: (provider: RuntimeUsageProvider) => {
      const store = stores[provider]
      if (!store) {
        throw new Error(`usage_provider_unavailable:${provider}`)
      }
      return store
    }
  } as unknown as OrcaRuntimeService
}

// Fixtures are what the desktop stores hand their IPC handlers.
const scanState: ClaudeUsageScanState = {
  enabled: true,
  isScanning: false,
  lastScanStartedAt: 1_756_000_000_000,
  lastScanCompletedAt: 1_756_000_030_000,
  lastScanError: null,
  hasAnyClaudeData: true
}

const summary: ClaudeUsageSummary = {
  scope: 'orca',
  range: '30d',
  sessions: 42,
  turns: 918,
  zeroCacheReadTurns: 12,
  inputTokens: 1_204_500,
  outputTokens: 318_200,
  cacheReadTokens: 8_940_000,
  cacheWriteTokens: 512_000,
  cacheReuseRate: 0.87,
  estimatedCostUsd: 41.37,
  topModel: 'claude-opus-4',
  topProject: 'orca-server',
  hasAnyClaudeData: true
}

const daily: ClaudeUsageDailyPoint[] = [
  {
    day: '2026-07-25',
    inputTokens: 120_000,
    outputTokens: 31_000,
    cacheReadTokens: 900_000,
    cacheWriteTokens: 40_000
  },
  {
    day: '2026-07-26',
    inputTokens: 98_000,
    outputTokens: 27_500,
    cacheReadTokens: 812_000,
    cacheWriteTokens: 36_000
  }
]

const modelBreakdown: ClaudeUsageBreakdownRow[] = [
  {
    key: 'claude-opus-4',
    label: 'Claude Opus 4',
    sessions: 30,
    turns: 700,
    inputTokens: 900_000,
    outputTokens: 240_000,
    cacheReadTokens: 6_400_000,
    cacheWriteTokens: 380_000,
    estimatedCostUsd: 33.1
  }
]

const projectBreakdown: ClaudeUsageBreakdownRow[] = [
  {
    key: '/home/coder/orca-server',
    label: 'orca-server',
    sessions: 25,
    turns: 610,
    inputTokens: 780_000,
    outputTokens: 205_000,
    cacheReadTokens: 5_100_000,
    cacheWriteTokens: 300_000,
    estimatedCostUsd: 28.4
  }
]

const recentSessions: ClaudeUsageSessionRow[] = [
  {
    sessionId: 'ses-1',
    lastActiveAt: '2026-07-26T18:04:11.000Z',
    durationMinutes: 73,
    projectLabel: 'orca-server',
    branch: 'audit/patch-headers',
    model: 'claude-opus-4',
    turns: 88,
    inputTokens: 41_000,
    outputTokens: 12_400,
    cacheReadTokens: 610_000,
    cacheWriteTokens: 22_000
  }
]

const snapshot: ClaudeUsageSnapshot = {
  scanState,
  summary,
  daily,
  modelBreakdown,
  projectBreakdown,
  recentSessions
}

describe('usage RPC methods', () => {
  let stores: Record<RuntimeUsageProvider, UsageStoreStub>
  let dispatcher: RpcDispatcher

  beforeEach(() => {
    stores = {
      claude: createUsageStoreStub(),
      codex: createUsageStoreStub(),
      openCode: createUsageStoreStub()
    }
    dispatcher = new RpcDispatcher({ runtime: createRuntime(stores), methods: USAGE_METHODS })
  })

  it('answers the pane with the host scan state', async () => {
    // The pane's first call: resolving to nothing leaves it at "Not scanned yet".
    stores.claude.getScanState.mockReturnValue(scanState)

    const response = await dispatcher.dispatch(
      makeRequest('usage.getScanState', { provider: 'claude' })
    )

    expect(stores.claude.getScanState.mock.calls[0]).toEqual([])
    expect(response).toMatchObject({ ok: true, result: scanState })
  })

  it('enables scanning on the host and returns the new scan state', async () => {
    // Both halves matter: the pane bails when the toggle answers nothing.
    const enabled: ClaudeUsageScanState = { ...scanState, enabled: true, isScanning: true }
    stores.codex.setEnabled.mockReturnValue(enabled)

    const response = await dispatcher.dispatch(
      makeRequest('usage.setEnabled', { provider: 'codex', enabled: true })
    )

    expect(stores.codex.setEnabled).toHaveBeenCalledWith(true)
    expect(response).toMatchObject({ ok: true, result: enabled })

    stores.codex.setEnabled.mockReturnValue({ ...scanState, enabled: false })
    await dispatcher.dispatch(makeRequest('usage.setEnabled', { provider: 'codex', enabled: false }))

    expect(stores.codex.setEnabled).toHaveBeenLastCalledWith(false)
  })

  it('runs a scan, defaulting to the desktop non-forced refresh', async () => {
    // `force` is optional on the desktop signature and defaults to false there.
    stores.claude.refresh.mockResolvedValue(undefined)

    await dispatcher.dispatch(makeRequest('usage.refresh', { provider: 'claude', force: true }))
    expect(stores.claude.refresh).toHaveBeenCalledWith(true)

    await dispatcher.dispatch(makeRequest('usage.refresh', { provider: 'claude' }))
    expect(stores.claude.refresh).toHaveBeenLastCalledWith(false)
  })

  it('returns the ledger snapshot for the requested window', async () => {
    stores.claude.getSnapshot.mockReturnValue(snapshot)

    const response = await dispatcher.dispatch(
      makeRequest('usage.getSnapshot', {
        provider: 'claude',
        scope: 'orca',
        range: '30d',
        limit: 10
      })
    )

    expect(stores.claude.getSnapshot).toHaveBeenCalledWith('orca', '30d', 10)
    expect(response).toMatchObject({ ok: true, result: snapshot })

    await dispatcher.dispatch(
      makeRequest('usage.getSnapshot', { provider: 'claude', scope: 'all', range: 'all' })
    )
    const withoutLimit = stores.claude.getSnapshot.mock.calls[1] ?? []
    expect(withoutLimit.slice(0, 2)).toEqual(['all', 'all'])
    expect(withoutLimit[2]).toBeUndefined()
  })

  it('returns the usage summary for the requested window', async () => {
    stores.claude.getSummary.mockReturnValue(summary)

    const response = await dispatcher.dispatch(
      makeRequest('usage.getSummary', { provider: 'claude', scope: 'orca', range: '7d' })
    )

    expect(stores.claude.getSummary).toHaveBeenCalledWith('orca', '7d')
    expect(response).toMatchObject({ ok: true, result: summary })
  })

  it('returns the daily series for the requested window', async () => {
    stores.openCode.getDaily.mockReturnValue(daily)

    const response = await dispatcher.dispatch(
      makeRequest('usage.getDaily', { provider: 'openCode', scope: 'all', range: '90d' })
    )

    expect(stores.openCode.getDaily).toHaveBeenCalledWith('all', '90d')
    expect(response).toMatchObject({ ok: true, result: daily })
  })

  it('returns the breakdown the caller asked for, by model or by project', async () => {
    stores.claude.getBreakdown
      .mockReturnValueOnce(modelBreakdown)
      .mockReturnValueOnce(projectBreakdown)

    const byModel = await dispatcher.dispatch(
      makeRequest('usage.getBreakdown', {
        provider: 'claude',
        scope: 'orca',
        range: '30d',
        kind: 'model'
      })
    )
    expect(stores.claude.getBreakdown).toHaveBeenCalledWith('orca', '30d', 'model')
    expect(byModel).toMatchObject({ ok: true, result: modelBreakdown })

    const byProject = await dispatcher.dispatch(
      makeRequest('usage.getBreakdown', {
        provider: 'claude',
        scope: 'orca',
        range: '30d',
        kind: 'project'
      })
    )
    expect(stores.claude.getBreakdown).toHaveBeenLastCalledWith('orca', '30d', 'project')
    expect(byProject).toMatchObject({ ok: true, result: projectBreakdown })
  })

  it('returns the recent sessions for the requested window', async () => {
    stores.claude.getRecentSessions.mockReturnValue(recentSessions)

    const response = await dispatcher.dispatch(
      makeRequest('usage.getRecentSessions', {
        provider: 'claude',
        scope: 'orca',
        range: '30d',
        limit: 5
      })
    )

    expect(stores.claude.getRecentSessions).toHaveBeenCalledWith('orca', '30d', 5)
    expect(response).toMatchObject({ ok: true, result: recentSessions })
  })

  it('reads each provider from its own store', async () => {
    // provider is a parameter rather than three copies of the surface, so it is the only thing
    // keeping Claude's ledger out of the Codex pane.
    stores.claude.getSummary.mockReturnValue(summary)
    stores.codex.getSummary.mockReturnValue({ ...summary, sessions: 7, topModel: 'gpt-5-codex' })
    stores.openCode.getSummary.mockReturnValue({ ...summary, sessions: 3, topModel: 'qwen3-coder' })

    const codex = await dispatcher.dispatch(
      makeRequest('usage.getSummary', { provider: 'codex', scope: 'orca', range: '30d' })
    )

    expect(codex).toMatchObject({ ok: true, result: { sessions: 7, topModel: 'gpt-5-codex' } })
    expect(stores.claude.getSummary).not.toHaveBeenCalled()
    expect(stores.openCode.getSummary).not.toHaveBeenCalled()
  })

  it('rejects a provider this surface does not serve', async () => {
    const response = await dispatcher.dispatch(
      makeRequest('usage.getSummary', { provider: 'grok', scope: 'orca', range: '30d' })
    )

    expect(response).toMatchObject({ ok: false })
    expect(stores.claude.getSummary).not.toHaveBeenCalled()
    expect(stores.codex.getSummary).not.toHaveBeenCalled()
    expect(stores.openCode.getSummary).not.toHaveBeenCalled()
  })

  it('rejects a window the desktop contract does not offer', async () => {
    // scope and range are closed unions on the store.
    const badRange = await dispatcher.dispatch(
      makeRequest('usage.getDaily', { provider: 'claude', scope: 'orca', range: '1y' })
    )
    const badScope = await dispatcher.dispatch(
      makeRequest('usage.getDaily', { provider: 'claude', scope: 'everything', range: '30d' })
    )

    expect(badRange).toMatchObject({ ok: false })
    expect(badScope).toMatchObject({ ok: false })
    expect(stores.claude.getDaily).not.toHaveBeenCalled()
  })

  it('fails loudly when a provider store is unavailable', async () => {
    // The preload fallback's silent `undefined` is what made the pane look broken rather than
    // unavailable.
    const withoutCodex = new RpcDispatcher({
      runtime: createRuntime({ claude: stores.claude, openCode: stores.openCode }),
      methods: USAGE_METHODS
    })

    const response = await withoutCodex.dispatch(
      makeRequest('usage.getScanState', { provider: 'codex' })
    )

    expect(response).toMatchObject({ ok: false })
    expect(response).not.toHaveProperty('result')
  })
})
