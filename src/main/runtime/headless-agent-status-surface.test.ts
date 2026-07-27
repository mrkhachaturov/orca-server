/**
 * Headless session-tab surfaces must carry CURRENT hook-reported agent status.
 *
 * Regression: `mergeMobileSessionSnapshotTabs` dedupes by tab identity and keeps the CACHED tab, so
 * a rebuild that stamped agentStatus at build time had it discarded. The only path that replaced
 * wholesale was a `force: true` rebuild, whose sole trigger is a hook CHANGE — which never fires on
 * a host whose agents all exited before the last restart. Every pane then stayed a plain terminal
 * with no chat toggle until an agent ran again. Measured live 2026-07-27: `session.tabs.listAll`
 * returned 19 terminal surfaces, 0 with agentStatus, while the same host's `worktree.ps` reported 5
 * agents on exactly those pane keys.
 */
import { describe, expect, it } from 'vitest'
import type {
  RuntimeMobileSessionTabsSnapshot,
  RuntimeMobileSessionTerminalTab
} from '../../shared/runtime-types'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
import type { WorkspaceSessionState } from '../../shared/types'
import { OrcaRuntimeService } from './orca-runtime'

const WT = 'repo-1::/tmp/worktree-a'
const TAB = '24f43d36-492f-422e-9472-3b179975ee69'
const LEAF = 'a12b2698-61c1-4cc5-b330-99c7b945f327'
const PANE_KEY = `${TAB}:${LEAF}`
const SERVE_PTY = 'serve-pty-1'

const storeBase = {
  getRepo: () => ({
    id: 'repo-1',
    path: '/tmp/repo',
    displayName: 'repo',
    badgeColor: 'blue',
    addedAt: 1
  }),
  getRepos: () => [storeBase.getRepo()],
  addRepo: () => {},
  updateRepo: () => undefined as never,
  getAllWorktreeMeta: () => ({}),
  getWorktreeMeta: () => undefined,
  getGitHubCache: () => ({ pr: {}, issue: {} }),
  setWorktreeMeta: () => undefined as never,
  removeWorktreeMeta: () => {},
  getSettings: () => ({
    workspaceDir: '/tmp/workspaces',
    nestWorkspaces: false,
    refreshLocalBaseRefOnWorktreeCreate: false,
    branchPrefix: 'none',
    branchPrefixCustom: ''
  })
}

function makeSession(): WorkspaceSessionState {
  return {
    activeRepoId: 'repo-1',
    activeWorktreeId: WT,
    activeTabId: null,
    tabsByWorktree: {
      [WT]: [
        {
          id: TAB,
          ptyId: null,
          worktreeId: WT,
          title: 'Terminal 1',
          customTitle: null,
          color: null,
          sortOrder: 0,
          createdAt: 1
        }
      ]
    },
    terminalLayoutsByTabId: {
      [TAB]: {
        root: { type: 'leaf', leafId: LEAF },
        activeLeafId: LEAF,
        expandedLeafId: null,
        ptyIdsByLeafId: { [LEAF]: SERVE_PTY }
      }
    }
  } as unknown as WorkspaceSessionState
}

function hookRow(): AgentStatusIpcPayload {
  return {
    paneKey: PANE_KEY,
    tabId: TAB,
    worktreeId: WT,
    connectionId: null,
    receivedAt: 1785103715009,
    stateStartedAt: 1785103712000,
    state: 'done',
    prompt: 'check what system you are running',
    agentType: 'claude',
    model: 'claude-opus-4-8',
    providerSession: {
      key: 'session_id',
      id: '582f66ac-ab96-4105-a762-8075fbf0f35d',
      transcriptPath: '/home/coder/.claude/projects/x/582f66ac.jsonl'
    }
  } as unknown as AgentStatusIpcPayload
}

/** The snapshot a restart leaves behind: real panes, no agent status on them. */
function cachedStatuslessSnapshot(): RuntimeMobileSessionTabsSnapshot {
  return {
    worktree: WT,
    publicationEpoch: 'headless-hydrated:boot',
    snapshotVersion: 1,
    activeGroupId: 'group-1',
    activeTabId: `${TAB}::${LEAF}`,
    activeTabType: 'terminal',
    tabs: [
      {
        type: 'terminal',
        id: `${TAB}::${LEAF}`,
        parentTabId: TAB,
        leafId: LEAF,
        title: 'Terminal 1',
        ptyId: SERVE_PTY,
        isActive: true
      }
    ]
  } as unknown as RuntimeMobileSessionTabsSnapshot
}

type RuntimeInternals = {
  mobileSessionTabsByWorktree: Map<string, RuntimeMobileSessionTabsSnapshot>
}

function createRuntime(rows: AgentStatusIpcPayload[]) {
  const session = makeSession()
  const runtime = new OrcaRuntimeService(
    {
      ...storeBase,
      getWorkspaceSession: () => session,
      setWorkspaceSession: () => {}
    } as never,
    undefined as never,
    { getAgentStatusSnapshot: () => rows } as never
  )
  ;(runtime as unknown as RuntimeInternals).mobileSessionTabsByWorktree.set(
    WT,
    cachedStatuslessSnapshot()
  )
  return runtime
}

function terminalSurfaces(
  results: { worktree: string; tabs: unknown[] }[]
): RuntimeMobileSessionTerminalTab[] {
  return results
    .filter((result) => result.worktree === WT)
    .flatMap((result) => result.tabs as RuntimeMobileSessionTerminalTab[])
    .filter((tab) => tab.type === 'terminal')
}

describe('headless session-tab surfaces: agent status survives the snapshot merge', () => {
  it('stamps a hook row onto a pane whose cached snapshot has no agent status', async () => {
    // Why: this is the post-restart state — hook rows hydrated from disk, snapshot built without
    // them, and no hook will fire again because the agent already exited. Without post-merge
    // resolution the cached statusless tab wins and the pane never offers native chat.
    const runtime = createRuntime([hookRow()])

    const surfaces = terminalSurfaces(await runtime.listAllMobileSessionTabs())

    expect(surfaces).toHaveLength(1)
    expect(surfaces[0]?.agentStatus).toMatchObject({
      paneKey: PANE_KEY,
      agentType: 'claude',
      state: 'done',
      providerSession: {
        id: '582f66ac-ab96-4105-a762-8075fbf0f35d',
        transcriptPath: '/home/coder/.claude/projects/x/582f66ac.jsonl'
      }
    })
  })

  it('survives another producer re-publishing the snapshot without status', async () => {
    // Why: THE regression that shipped. 11 producers write these tabs with a bare `headless:` epoch,
    // and mergeMobileSessionSnapshotTabs keeps the CACHED tab — so filling the field in one producer
    // is undone by whichever runs next (live: opening a worktree bumped the snapshot and every pane
    // lost its chat toggle again). Resolution must be at the publish boundary, not in a producer.
    const runtime = createRuntime([hookRow()])
    const internals = runtime as unknown as RuntimeInternals

    expect(terminalSurfaces(await runtime.listAllMobileSessionTabs())[0]?.agentStatus).toBeTruthy()

    const republished = cachedStatuslessSnapshot()
    republished.publicationEpoch = 'headless:another-producer'
    republished.snapshotVersion = 4
    internals.mobileSessionTabsByWorktree.set(WT, republished)

    const surfaces = terminalSurfaces(await runtime.listAllMobileSessionTabs())
    expect(surfaces).toHaveLength(1)
    expect(surfaces[0]?.agentStatus).toMatchObject({
      agentType: 'claude',
      providerSession: { id: '582f66ac-ab96-4105-a762-8075fbf0f35d' }
    })
  })

  it('emits no agent status for a pane the host reports no hook row for', async () => {
    // Why: the resolution must not invent an agent on an ordinary shell pane.
    const runtime = createRuntime([])

    const surfaces = terminalSurfaces(await runtime.listAllMobileSessionTabs())

    expect(surfaces).toHaveLength(1)
    expect(surfaces[0]?.agentStatus ?? null).toBeNull()
  })
})
