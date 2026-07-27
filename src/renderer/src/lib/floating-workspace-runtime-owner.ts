import { isWebClientLocation } from './web-client-location'
import type { WorktreeRuntimeOwnerState } from './worktree-runtime-owner-state'

/**
 * Who owns the floating workspace — the client machine, or the connected runtime?
 *
 * Desktop: always local, deliberately — a scratch surface independent of whichever runtime is
 * focused. The browser has no local machine to own it (`pty.spawn` rejects, no `<webview>`, no
 * file dialog), so it belongs to the runtime that served the page.
 */
export function resolveFloatingWorkspaceRuntimeEnvironmentId({
  isWebClient,
  activeRuntimeEnvironmentId,
  runtimeEnvironments
}: {
  isWebClient: boolean
  activeRuntimeEnvironmentId: string | null | undefined
  runtimeEnvironments?: readonly { id: string }[]
}): string | null {
  if (!isWebClient) {
    return null
  }
  const focused = activeRuntimeEnvironmentId?.trim()
  if (focused) {
    return focused
  }
  // Not `getSingleFocusedRuntimeEnvironmentId`: it returns null without an explicit choice. A
  // browser saves exactly one environment — the server that served it — so an unset preference
  // means that server, not "local".
  const savedIds = runtimeEnvironments?.map((environment) => environment.id.trim()) ?? []
  return savedIds.length === 1 ? (savedIds[0] || null) : null
}

export function getFloatingWorkspaceRuntimeEnvironmentId(
  state: Pick<WorktreeRuntimeOwnerState, 'settings' | 'runtimeEnvironments'>
): string | null {
  return resolveFloatingWorkspaceRuntimeEnvironmentId({
    isWebClient: isWebClientLocation(),
    activeRuntimeEnvironmentId: state.settings?.activeRuntimeEnvironmentId,
    runtimeEnvironments: state.runtimeEnvironments
  })
}

/**
 * A floor for a web client whose ownership resolved to "this machine" — impossible in a
 * browser, and reachable when a fresh project's catalog rows lack their runtime host.
 * Same value as the floating owner above; separate name because that rule is deliberate
 * and this one is a backstop.
 */
export function getWebClientLocalFallbackEnvironmentId(
  state: Pick<WorktreeRuntimeOwnerState, 'settings' | 'runtimeEnvironments'>
): string | null {
  return resolveFloatingWorkspaceRuntimeEnvironmentId({
    isWebClient: isWebClientLocation(),
    activeRuntimeEnvironmentId: state.settings?.activeRuntimeEnvironmentId,
    runtimeEnvironments: state.runtimeEnvironments
  })
}
