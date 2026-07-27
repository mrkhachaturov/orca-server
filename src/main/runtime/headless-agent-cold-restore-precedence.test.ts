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
  const seen: Record<string, unknown>[] = []
  internals.resolveMobileSessionTerminalCommand = async (
    _workspace: unknown,
    opts: Record<string, unknown>
  ) => {
    seen.push(opts)
    return {}
  }
  internals.createHeadlessMobileSessionTerminal = async () => ({})
  internals.getMobileSessionTabsForWorktree = () => ({ tabs: [] })
  internals.applyMobileSessionTabNavigation = (result: unknown) => result
  return { runtime, seen }
}

describe('cold-restore agent precedence', () => {
  it('honours the explicitly configured tab.launchAgent over the hook-cache agent', async () => {
    const { runtime, seen } = activateHarness([hookRow({ agentType: 'claude' })], 'codex')
    await runtime.activateMobileSessionTab(WORKTREE, TAB, LEAF)

    expect(seen).toHaveLength(1)
    expect(seen[0]?.agent).toBe('codex')
  })

  it('still uses the hook-cache agent when the tab configures none', async () => {
    const { runtime, seen } = activateHarness([hookRow({ agentType: 'claude' })], undefined)
    await runtime.activateMobileSessionTab(WORKTREE, TAB, LEAF)

    expect(seen[0]?.agent).toBe('claude')
  })
})

function commandResolver() {
  const runtime = new OrcaRuntimeService(
    { getSettings: () => SETTINGS } as never,
    undefined,
    {} as never
  ) as unknown as {
    resolveMobileSessionTerminalCommand: (
      workspace: unknown,
      opts: Record<string, unknown>
    ) => Promise<{
      command?: string
      resumeProviderSession?: unknown
      followup?: { expectedProcess?: string; prompt?: string }
    }>
  }
  return (opts: Record<string, unknown>) =>
    runtime.resolveMobileSessionTerminalCommand({ path: '/tmp/audit' }, opts)
}

describe('agentPrompt on a resuming launch', () => {
  const PROMPT = 'audit-prompt-marker'

  it('delivers the caller prompt as a follow-up when resuming a provider session', async () => {
    const resolved = await commandResolver()({
      agent: 'claude',
      agentPrompt: PROMPT,
      resumeProviderSession: { key: 'session_id', id: SESSION_ID }
    })

    // A resume launches from the session id alone, so the prompt cannot ride the argv — it is
    // typed into the pane once the agent is up.
    expect(resolved.resumeProviderSession).toMatchObject({ id: SESSION_ID })
    expect(resolved.command).not.toContain(PROMPT)
    expect(resolved.followup).toMatchObject({ prompt: PROMPT })
  })

  it('carries the caller prompt into a fresh (non-resuming) launch command', async () => {
    const resolved = await commandResolver()({ agent: 'claude', agentPrompt: PROMPT })

    expect(resolved.command).toContain(PROMPT)
  })
})
