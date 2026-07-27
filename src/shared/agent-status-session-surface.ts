import type { AgentStatusEntry, AgentStatusIpcPayload } from './agent-status-types'

// Why: on a desktop host, `buildMobileTerminalSurfaceTabs` hangs the renderer store's
// `AgentStatusEntry` off each session-tab surface, so every paired client (phone AND web) receives
// agent status — including `providerSession` and `model` — and mirrors it under its own pane key
// via `remapHostAgentStatus`. `orca serve` has no renderer store, so the headless builder omitted
// the field entirely: `remapHostAgentStatus` returned null for every surface, native chat could not
// resolve a session, and `buildMirroredAgentStatusPatch` actively deleted any mirrored row it did
// not see in the snapshot. The hook rows are on the host all along; only this shape was missing.

/** Hook-row wire shape -> the store shape a session-tab surface carries. Mirrors what the desktop
 *  renderer would have had in `state.agentStatusByPaneKey` for the same pane. */
export function toSessionSurfaceAgentStatusEntry(row: AgentStatusIpcPayload): AgentStatusEntry {
  const {
    paneKey,
    receivedAt,
    stateStartedAt,
    // Why: dropped deliberately — `providerSessionOnly` rows are Pi placeholders the renderer
    // discards, and re-publishing one as a surface entry would show a phantom agent on the tab.
    providerSessionOnly: _providerSessionOnly,
    ...rest
  } = row
  return {
    ...rest,
    paneKey,
    updatedAt: receivedAt,
    stateStartedAt,
    // Why: history accrues in the renderer store across live updates; a snapshot has no past to
    // replay, and the desktop entry starts the same way on a cold pane.
    stateHistory: []
  } as AgentStatusEntry
}

/** Index hook rows by pane key so a surface builder can look each leaf up in one pass. */
export function agentStatusEntriesByPaneKey(
  rows: readonly AgentStatusIpcPayload[]
): Map<string, AgentStatusEntry> {
  const byPaneKey = new Map<string, AgentStatusEntry>()
  for (const row of rows) {
    if (row.providerSessionOnly === true || typeof row.paneKey !== 'string' || !row.paneKey) {
      continue
    }
    byPaneKey.set(row.paneKey, toSessionSurfaceAgentStatusEntry(row))
  }
  return byPaneKey
}
