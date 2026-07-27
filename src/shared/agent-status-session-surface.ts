import type { AgentStatusEntry, AgentStatusIpcPayload } from './agent-status-types'

// Desktop hangs the renderer store's `AgentStatusEntry` off each session-tab surface, which the
// client mirrors via `remapHostAgentStatus`. `orca serve` has no renderer store, so this rebuilds
// that shape from the host's hook rows.
export function toSessionSurfaceAgentStatusEntry(row: AgentStatusIpcPayload): AgentStatusEntry {
  const {
    paneKey,
    receivedAt,
    stateStartedAt,
    // `providerSessionOnly` rows are Pi placeholders the renderer discards; republishing one as
    // a surface entry shows a phantom agent on the tab.
    providerSessionOnly: _providerSessionOnly,
    ...rest
  } = row
  return {
    ...rest,
    paneKey,
    updatedAt: receivedAt,
    stateStartedAt,
    // History accrues in the renderer store across live updates; a snapshot has no past to replay.
    stateHistory: []
  } as AgentStatusEntry
}

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
