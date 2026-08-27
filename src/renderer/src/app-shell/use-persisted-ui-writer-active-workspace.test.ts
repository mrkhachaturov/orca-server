// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'

// The producer for `ui.lastActive*`, which the startup path reads back to reopen the
// workspace that was open. Written without JSX so the hook runs from a `.ts` file.

type WriterState = {
  persistedUIReady: boolean
  activeView: string
  activeRepoId: string | null
  activeWorktreeId: string | null
  sidebarWidth: number
  rightSidebarOpen: boolean
  rightSidebarTab: string
  rightSidebarExplorerView: string
  rightSidebarWidth: number
  markdownTocPanelWidth: number
  combinedDiffFileTreeWidth: number
  groupBy: string
  sortBy: string
  projectOrderBy: string
  showSleepingWorkspaces: boolean
  hideDefaultBranchWorkspace: boolean
  hideAutomationGeneratedWorkspaces: boolean
  hideCliCreatedWorkspaces: boolean
  hideDetachedHeadWorkspaces: boolean
  hideWorkspacesFromOtherDevices: boolean
  alwaysShowDefaultBranchWorkspace: boolean
  showDotfilesByWorktree: Record<string, boolean>
  filterRepoIds: readonly string[]
  acknowledgedAgentsByPaneKey: Record<string, unknown>
}

const mocks = vi.hoisted(() => {
  const holder = { state: null as unknown as WriterState }
  const useAppStore = (selector: (state: WriterState) => unknown): unknown => selector(holder.state)
  return {
    holder,
    useAppStore,
    uiSet: vi.fn<(updates: Record<string, unknown>) => Promise<void>>()
  }
})

vi.mock('../store', () => ({ useAppStore: mocks.useAppStore }))

const { usePersistedUIWriter } = await import('./use-persisted-ui-writer')

function baseState(overrides: Partial<WriterState> = {}): WriterState {
  return {
    persistedUIReady: true,
    activeView: 'workspaces',
    activeRepoId: null,
    activeWorktreeId: null,
    sidebarWidth: 280,
    rightSidebarOpen: false,
    rightSidebarTab: 'diff',
    rightSidebarExplorerView: 'files',
    rightSidebarWidth: 320,
    markdownTocPanelWidth: 200,
    combinedDiffFileTreeWidth: 240,
    groupBy: 'repo',
    sortBy: 'recent',
    projectOrderBy: 'manual',
    showSleepingWorkspaces: true,
    hideDefaultBranchWorkspace: false,
    hideAutomationGeneratedWorkspaces: false,
    hideCliCreatedWorkspaces: false,
    hideDetachedHeadWorkspaces: false,
    hideWorkspacesFromOtherDevices: false,
    alwaysShowDefaultBranchWorkspace: false,
    showDotfilesByWorktree: {},
    filterRepoIds: [],
    acknowledgedAgentsByPaneKey: {},
    ...overrides
  }
}

function pointerWrites(): Record<string, unknown>[] {
  return mocks.uiSet.mock.calls
    .map(([updates]) => updates)
    .filter((updates) => 'lastActiveRepoId' in updates)
}

describe('the active-workspace pointer producer', () => {
  beforeEach(() => {
    mocks.uiSet.mockReset()
    mocks.uiSet.mockResolvedValue(undefined)
    ;(window as unknown as { api: unknown }).api = { ui: { set: mocks.uiSet } }
  })

  afterEach(() => {
    cleanup()
  })

  it('records which workspace is open, so a restart can reopen it', () => {
    // Why: nothing wrote `ui.lastActive*`, so the startup read found null and the tile
    // landed on "Select a workspace from the sidebar" with every worktree listed.
    mocks.holder.state = baseState({
      activeRepoId: 'repo-1',
      activeWorktreeId: 'repo-1::/w/feature'
    })

    renderHook(() => usePersistedUIWriter())

    expect(pointerWrites()).toEqual([
      { lastActiveRepoId: 'repo-1', lastActiveWorktreeId: 'repo-1::/w/feature' }
    ])
  })

  it('follows a worktree switch within the same repo', () => {
    mocks.holder.state = baseState({
      activeRepoId: 'repo-1',
      activeWorktreeId: 'repo-1::/w/feature'
    })
    const { rerender } = renderHook(() => usePersistedUIWriter())

    mocks.holder.state = baseState({
      activeRepoId: 'repo-1',
      activeWorktreeId: 'repo-1::/w/other'
    })
    rerender()

    expect(pointerWrites()[1]).toEqual({
      lastActiveRepoId: 'repo-1',
      lastActiveWorktreeId: 'repo-1::/w/other'
    })
  })

  it('writes nothing before the persisted UI has loaded', () => {
    // Why: writing first would overwrite the stored pointer with the pre-hydration null,
    // which is the value the restore is supposed to read.
    mocks.holder.state = baseState({
      persistedUIReady: false,
      activeRepoId: 'repo-1',
      activeWorktreeId: 'repo-1::/w/feature'
    })

    renderHook(() => usePersistedUIWriter())

    expect(pointerWrites()).toEqual([])
  })

  it('does not ride the debounced durable-state save', () => {
    // Why (#9002): the active workspace changes as often as activeView, and that writer
    // is the multi-MB save activeView was deliberately moved off. At 0ms the debounce
    // has not fired, so a write present now came from a dedicated effect.
    mocks.holder.state = baseState({
      activeRepoId: 'repo-1',
      activeWorktreeId: 'repo-1::/w/feature'
    })

    renderHook(() => usePersistedUIWriter())

    expect(pointerWrites()).toHaveLength(1)
    expect(pointerWrites()[0]).not.toHaveProperty('sidebarWidth')
  })
})
