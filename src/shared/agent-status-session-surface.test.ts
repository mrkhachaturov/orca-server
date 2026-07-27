import { describe, expect, it } from 'vitest'
import type { AgentStatusIpcPayload } from './agent-status-types'
import {
  agentStatusEntriesByPaneKey,
  toSessionSurfaceAgentStatusEntry
} from './agent-status-session-surface'

const PANE_KEY = '24f43d36-492f-422e-9472-3b179975ee69:a12b2698-61c1-4cc5-b330-99c7b945f327'

function hookRow(overrides: Record<string, unknown> = {}): AgentStatusIpcPayload {
  return {
    paneKey: PANE_KEY,
    tabId: '24f43d36-492f-422e-9472-3b179975ee69',
    worktreeId: 'repo::/home/coder/orca/workspaces/146 Test/testing',
    connectionId: null,
    receivedAt: 1785103715009,
    stateStartedAt: 1785103712000,
    state: 'done',
    prompt: 'hi claude',
    agentType: 'claude',
    model: 'claude-opus-4-8',
    providerSession: {
      key: 'session_id',
      id: '582f66ac-ab96-4105-a762-8075fbf0f35d',
      transcriptPath: '/home/coder/.claude/projects/x/582f66ac.jsonl'
    },
    ...overrides
  } as unknown as AgentStatusIpcPayload
}

describe('session-surface agent status', () => {
  it('carries providerSession and model onto the surface entry', () => {
    // providerSession is the only field native chat resolves a session id and transcript path
    // from; model fills the composer's model picker.
    const entry = toSessionSurfaceAgentStatusEntry(hookRow())

    expect(entry.providerSession).toEqual({
      key: 'session_id',
      id: '582f66ac-ab96-4105-a762-8075fbf0f35d',
      transcriptPath: '/home/coder/.claude/projects/x/582f66ac.jsonl'
    })
    expect(entry.model).toBe('claude-opus-4-8')
    expect(entry.paneKey).toBe(PANE_KEY)
  })

  it('maps receivedAt onto updatedAt and starts an empty history', () => {
    // The renderer store keys freshness off updatedAt; undefined loses to
    // `existing.updatedAt > entry.updatedAt`.
    const entry = toSessionSurfaceAgentStatusEntry(hookRow())

    expect(entry.updatedAt).toBe(1785103715009)
    expect(entry.stateStartedAt).toBe(1785103712000)
    expect(entry.stateHistory).toEqual([])
  })

  it('indexes rows by pane key', () => {
    const other = hookRow({ paneKey: 'aaaaaaaa-0000-4000-8000-000000000000:bbbbbbbb-0000-4000-8000-000000000000' })
    const byPaneKey = agentStatusEntriesByPaneKey([hookRow(), other])

    expect([...byPaneKey.keys()].sort()).toEqual([other.paneKey, PANE_KEY].sort())
    expect(byPaneKey.get(PANE_KEY)?.agentType).toBe('claude')
  })

  it('skips providerSessionOnly placeholders', () => {
    // Pi session_start rows only refresh resume identity while idle; the renderer discards them.
    const byPaneKey = agentStatusEntriesByPaneKey([hookRow({ providerSessionOnly: true })])

    expect(byPaneKey.size).toBe(0)
  })

  it('does not leak providerSessionOnly onto a converted entry', () => {
    const entry = toSessionSurfaceAgentStatusEntry(hookRow({ providerSessionOnly: true }))
    expect('providerSessionOnly' in entry).toBe(false)
  })
})
