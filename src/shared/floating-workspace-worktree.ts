import { FLOATING_TERMINAL_WORKTREE_ID } from './constants'
import type { Worktree } from './types'

/**
 * A worktree-shaped record for the floating workspace, rooted at the app-owned floating
 * workspace directory on the host.
 *
 * Why this exists: the floating sentinel is terminal-only on the runtime.
 * `resolveTerminalWorkspaceLaunchScope` answers it with a launch scope, but every other
 * workspace API resolves through `resolveWorktreeSelector`, which searches real worktrees
 * and throws `selector_not_found`. That is what a web client hit the moment it tried to
 * create or read a floating markdown note, since file RPCs address `worktree` +
 * `relativePath` and the server needs a root to join them against.
 *
 * Shape mirrors `folderWorkspaceToWorktree` — the existing precedent for presenting a
 * non-repo directory as a worktree. Git fields are empty for the same reason they are
 * there: this is a plain directory, not a checkout.
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
