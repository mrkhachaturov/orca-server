import { describe, expect, it } from 'vitest'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
import { OrcaRuntimeService } from './orca-runtime'

const TAB = '24f43d36-492f-422e-9472-3b179975ee69'
const LEAF = 'a12b2698-61c1-4cc5-b330-99c7b945f327'
const SESSION_ID = '582f66ac-ab96-4105-a762-8075fbf0f35d'
const WORKTREE = 'wt-audit'

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

const SETTINGS = {
  disabledTuiAgents: [],
  agentCmdOverrides: {},
  agentDefaultArgs: {},
  agentDefaultEnv: {},
  terminalWindowsShell: undefined
}

/** Real `activateMobileSessionTab`; `resolveMobileSessionTerminalCommand` is captured because
 *  that is where `startupAgent` lands. */
function activateHarness(rows: AgentStatusIpcPayload[], launchAgent: string | undefined) {
  const runtime = new OrcaRuntimeService({ getSettings: () => SETTINGS } as never, undefined, {
    getAgentStatusSnapshot: () => rows
  } as never) as unknown as Record<string, unknown> & {
    activateMobileSessionTab: (w: string, t: string, l?: string) => Promise<unknown>
  }
  const tab = {
    id: 'tab-row-1',
    type: 'terminal',
    parentTabId: TAB,
    leafId: LEAF,
    launchAgent,
    startupCwd: '/tmp/audit',
    ptyId: undefined,
    parentLayout: undefined,
    isActive: false
  }
  const snapshot = { worktreeId: WORKTREE, tabs: [tab], tabGroups: [] }
  const internals = runtime as never as {
    mobileSessionTabsByWorktree: Map<string, unknown>
  } & Record<string, unknown>
  internals.mobileSessionTabsByWorktree.set(WORKTREE, snapshot)
  internals.getValidatedExplicitWorktreeIdSelector = () => WORKTREE
  internals.hydrateHeadlessMobileSessionTabsFromWorkspaceSession = () => undefined
  internals.refreshMobileSessionPtyRecords = async () => null
  internals.toMobileSessionTabsResult = (snap: { tabs: unknown[] }) => ({
    tabs: (snap.tabs as Record<string, unknown>[]).map((t) => ({ ...t, status: 'pending' }))
  })
  internals.shouldMaterializeHeadlessMobileSessionTab = () => true
  internals.resolveTerminalWorkspaceLaunchScope = async () => ({ path: '/tmp/audit' })
  internals.resolveMobileSessionTerminalCommand = async () => ({})
  internals.getMobileSessionTabsForWorktree = () => ({ tabs: [] })
  internals.applyMobileSessionTabNavigation = (result: unknown) => result

  // Upstream's resume entry point, stubbed because it spawns a PTY. The request it receives is
  // the whole contract this patch supplies.
  const resumes: Record<string, unknown>[] = []
  internals.ensureAgentSession = async (request: Record<string, unknown>) => {
    resumes.push(request)
    return { terminal: {}, disposition: 'created' }
  }
  const plainCreates: Record<string, unknown>[] = []
  internals.createRuntimeOwnedMobileSessionTerminal = async (
    _w: string,
    _a: boolean,
    _after: string | undefined,
    opts: Record<string, unknown>
  ) => {
    plainCreates.push(opts)
    return {}
  }
  return { runtime, resumes, plainCreates }
}

describe('cold-restore agent precedence', () => {
  it('resumes the hook-cache session through upstream ensureAgentSession', async () => {
    const { runtime, resumes, plainCreates } = activateHarness(
      [hookRow({ agentType: 'claude' })],
      undefined
    )
    await runtime.activateMobileSessionTab(WORKTREE, TAB, LEAF)

    // Why assert the request and not a launch command: ensureAgentSession owns the claim, the
    // resume startup plan and the headless background spawn. The only thing a serve host must
    // supply is WHICH session to resume, because that normally comes from the renderer.
    expect(resumes).toHaveLength(1)
    expect(resumes[0]).toMatchObject({
      kind: 'explicit',
      agent: 'claude',
      providerSession: { id: SESSION_ID },
      placement: { tabId: TAB, leafId: LEAF }
    })
    expect(plainCreates).toHaveLength(0)
  })

  it('honours the explicitly configured tab.launchAgent over the hook-cache agent', async () => {
    const { runtime, resumes, plainCreates } = activateHarness(
      [hookRow({ agentType: 'claude' })],
      'codex'
    )
    await runtime.activateMobileSessionTab(WORKTREE, TAB, LEAF)

    // Why no resume: agent and provider session move together, so resuming a claude session
    // under a tab configured for codex would attach the wrong provider to that session id.
    expect(resumes).toHaveLength(0)
    expect(plainCreates).toHaveLength(1)
    expect(plainCreates[0]?.launchAgent).toBe('codex')
  })

  it('falls back to a plain create when the pane has no provider session', async () => {
    const { runtime, resumes, plainCreates } = activateHarness(
      [hookRow({ agentType: 'claude', providerSession: undefined })],
      undefined
    )
    await runtime.activateMobileSessionTab(WORKTREE, TAB, LEAF)

    expect(resumes).toHaveLength(0)
    expect(plainCreates).toHaveLength(1)
  })
})
