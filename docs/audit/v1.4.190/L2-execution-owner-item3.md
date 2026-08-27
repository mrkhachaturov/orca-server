# 08 item 3 — what would settle it

Still unverified. This says how to answer it, and what was and was not established from source.

## The question

Can a worktree row stamped `hostId: 'runtime:<env>'` coexist with a null
`state.activeWorkspaceExecutionHostId` in the tile? If it can, `createUnifiedTab` on that worktree
stamps the new tab `LOCAL_EXECUTION_HOST_ID`, `isExecutionHostAliasForWorktree` fails both arms, and
`isUnifiedTabOwnedByWorktree` returns false for a tab on its own worktree.

The chain, all at v1.4.190:

- `tabs.ts:863` — `init?.executionHostId ?? getActiveExecutionHostIdForWorktree(state, worktreeId)`
- `unified-tab-host-ownership.ts:26-30` — that returns `activeWorkspaceExecutionHostId ?? 'local'`
  when the worktree is the active one
- `unified-tab-host-ownership.ts:41` — `tab.executionHostId` truthy, so the alias comparison runs
  rather than the ambiguity fallback
- `set-active-worktree.ts:189` — `activeWorkspaceExecutionHostId: executionHostId ?? null`, straight
  from the caller's second argument

## Established from source, and no further

`setActiveWorktree` has callers on both sides. `runtime/web-runtime-session.ts` passes
`toRuntimeExecutionHostId(environmentId)`; `dashboard/launch-dashboard-agent.ts`,
`AgentDashboardDrawer.tsx` and `useDashboardPopoutBridge.ts` pass an explicit id. At least six
callers pass none — `Terminal.tsx`, `McpConfigSection.tsx`, `terminal-handle-links.ts`,
`useIpcEvents.ts` (twice), `sleep-worktree-flow.ts`, `ActivityPrototypePage.tsx` — and each writes
`null`.

So the second case is **structurally reachable**: one no-argument activation after a runtime-stamped
one leaves the pair inconsistent. That is a lead, not a finding. AGENTS.md: a path existing in
source is not evidence it is taken. Whether any of those six runs in the tile, on a worktree whose
row carries `runtime:<env>`, before a tab is created, is renderer store state — it is not decidable
from the call graph, because the ordering is what decides it.

## What would settle it

One paired browser session against the built AppImage, on a Linux host of the artifact's
architecture. Not a unit test: the premise is the *live* pairing of a runtime-stamped worktree row
with the store's activation history.

1. Boot `orca serve --trusted-proxy` from the AppImage and open the tile; pair it so
   `web-runtime-session.ts` has run and the worktree rows carry `runtime:<env>`.
2. In the browser console read, on the active worktree:

   ```js
   const s = window.__ORCA_STORE__?.getState?.()   // confirm the store's exposed handle first
   s.activeWorkspaceExecutionHostId
   s.worktrees.find(w => w.id === s.activeWorktreeId)?.hostId
   ```

   A `hostId` of `runtime:<env>` beside a null `activeWorkspaceExecutionHostId` **is** the second
   case. Both non-null and equal, or both null, is the harmless one.
3. If step 2 shows them consistent, drive one of the six no-argument callers — open a file from a
   terminal handle (`terminal-handle-links.ts`), or open Settings > MCP and pick a different
   worktree (`McpConfigSection.tsx`) — and read the pair again.
4. With the pair inconsistent, create a tab on that worktree and read its `executionHostId`. `local`
   against a `runtime:<env>` row is the defect reproducing.

If the store is not reachable from the console, the same four steps work from a React DevTools
inspection of the store provider, or by adding a temporary `console.log` in `createUnifiedTab` to a
dev build — but the AppImage is the environment that matters, because the pairing is the premise.

## If it reproduces

08's own ruling stands and is unchanged by this note: do not touch `isUnifiedTabOwnedByWorktree`.
Either make the caller pass the host id, or have `getActiveExecutionHostIdForWorktree` fall back to
`getExecutionHostIdForWorktree(state, worktreeId)` — the patch's already-corrected resolver — instead
of the bare `LOCAL_EXECUTION_HOST_ID`. One call site, `unified-tab-host-ownership.ts:27-29`, and it
fixes the desktop multi-host case too, so it is contributable rather than a divergence.

## Unverified

- Everything above about the live session. No browser was attached; this session is macOS and the
  artifact is a Linux AppImage.
- Whether the store is exposed on `window` at all in a production tile build. The console recipe in
  step 2 assumes a handle that was not checked.
- Whether any of the six no-argument callers is reachable in the tile's UI. They were found by
  grep over `src/renderer/src`, not by exercising the interface.
