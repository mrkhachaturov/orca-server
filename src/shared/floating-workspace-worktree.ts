import { FLOATING_TERMINAL_WORKTREE_ID } from './constants'
import type { Worktree } from './types'

/**
 * The floating sentinel is terminal-only on the runtime: every non-terminal workspace API
 * resolves through `resolveWorktreeSelector`, which searches real worktrees and throws
 * `selector_not_found`. Shape mirrors `folderWorkspaceToWorktree`.
 */
export function floatingWorkspaceToWorktree(folderPath: string): Worktree {
  return {
    id: FLOATING_TERMINAL_WORKTREE_ID,
    repoId: `floating-workspace:${FLOATING_TERMINAL_WORKTREE_ID}`,
    displayName: 'Floating Workspace',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    linkedGitLabMR: null,
    linkedGitLabIssue: null,
    linkedBitbucketPR: null,
    linkedAzureDevOpsPR: null,
    linkedGiteaPR: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    manualOrder: 0,
    lastActivityAt: 0,
    pendingFirstAgentMessageRename: false,
    firstAgentMessageRenameError: null,
    path: folderPath,
    head: '',
    branch: '',
    isBare: false,
    isSparse: false,
    isMainWorktree: false
  }
}
