/**
 * Headless cold restore: a persisted pane whose agent died with the host must relaunch against its
 * existing provider session, not a bare shell.
 *
 * Live 2026-07-27: after a workspace restart the tile rendered the transcript in chat view, but the
 * composer wrote into a fresh `bash` — `bash: command not found: THIS`. Desktop relaunches with
 * resume flags from the renderer (`pty-connection.ts` coldRestoreStartup); `orca serve` has no
 * renderer, so the host must decide it from its own hook rows.
 */
import { describe, expect, it } from 'vitest'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
import { OrcaRuntimeService } from './orca-runtime'

const TAB = '24f43d36-492f-422e-9472-3b179975ee69'
const LEAF = 'a12b2698-61c1-4cc5-b330-99c7b945f327'
const SESSION_ID = '582f66ac-ab96-4105-a762-8075fbf0f35d'

function hookRow(overrides: Record<string, unknown> = {}): AgentStatusIpcPayload {
  return {
    paneKey: `${TAB}:${LEAF}`,
    tabId: TAB,
    connectionId: null,
    receivedAt: 1785103715009,
    stateStartedAt: 1785103712000,
    state: 'done',
    prompt: 'check what system you are running',
    agentType: 'claude',
    providerSession: {
      key: 'session_id',
      id: SESSION_ID,
      transcriptPath: `/home/coder/.claude/projects/x/${SESSION_ID}.jsonl`
    },
    ...overrides
  } as unknown as AgentStatusIpcPayload
}

type Internals = {
  resolveHeadlessAgentColdRestore: (tab: { parentTabId: string; leafId: string }) => {
    agent: string
    providerSession: { id: string; key: string }
  } | null
}

function runtimeWithRows(rows: AgentStatusIpcPayload[]): Internals {
  return new OrcaRuntimeService({} as never, undefined as never, {
    getAgentStatusSnapshot: () => rows
  } as never) as unknown as Internals
}

describe('headless agent cold restore', () => {
  it('resolves the pane agent and provider session from the host hook rows', () => {
    // Why: this is the decision desktop makes in its renderer. Without it the materialize path only
    // launches an agent when tab.launchAgent is set -- null on every pane measured live -- so the
    // pane gets a plain shell and chat writes into bash.
    const resolved = runtimeWithRows([hookRow()]).resolveHeadlessAgentColdRestore({
      parentTabId: TAB,
      leafId: LEAF
    })

    expect(resolved).not.toBeNull()
    expect(resolved?.agent).toBe('claude')
    expect(resolved?.providerSession).toMatchObject({ key: 'session_id', id: SESSION_ID })
  })

  it('declines a pane with no hook row', () => {
    expect(
      runtimeWithRows([]).resolveHeadlessAgentColdRestore({ parentTabId: TAB, leafId: LEAF })
    ).toBeNull()
  })

  it('declines a non-resumable agent', () => {
    // Why: getAgentResumeArgv has no resume form for these, so a "resume" would silently launch a
    // fresh session against the wrong transcript.
    expect(
      runtimeWithRows([hookRow({ agentType: 'cursor' })]).resolveHeadlessAgentColdRestore({
        parentTabId: TAB,
        leafId: LEAF
      })
    ).toBeNull()
  })

  it('declines a hook row carrying no provider session', () => {
    expect(
      runtimeWithRows([hookRow({ providerSession: undefined })]).resolveHeadlessAgentColdRestore({
        parentTabId: TAB,
        leafId: LEAF
      })
    ).toBeNull()
  })

  it('declines a legacy non-UUID leaf id', () => {
    // Why: makePaneKey throws on a non-UUID leaf; the pane key would not match a hook row anyway.
    expect(
      runtimeWithRows([hookRow()]).resolveHeadlessAgentColdRestore({
        parentTabId: TAB,
        leafId: 'pane:3'
      })
    ).toBeNull()
  })
})
