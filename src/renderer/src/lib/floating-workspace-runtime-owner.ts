import { isWebClientLocation } from './web-client-location'
import type { WorktreeRuntimeOwnerState } from './worktree-runtime-owner-state'

/**
 * Who owns the floating workspace — the client machine, or the connected runtime?
 *
 * On the desktop app the answer is always "this machine". The floating workspace is a
 * local scratch surface on purpose: it stays independent of whichever runtime happens to
 * be focused, so a remote-heavy session still has a terminal, a notes pad and a browser
 * on the laptop. Nothing below changes that.
 *
 * The web client has no local machine to own it. `window.api.pty.spawn` rejects, there is
 * no `<webview>` to host a browser pane, and there is no native file dialog — every local
 * affordance the floating workspace reaches for is a stub. So its floating workspace
 * belongs to the runtime that served the page, which floating-workspace-picker already assumed
 * when it moved the floating terminal's cwd resolution onto the host
 * (`floatingWorkspace.resolveCwd`): the cwd was resolved on the server while the terminal
 * itself was still being spawned against the client. This is the other half of that.
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
  // Why not `getSingleFocusedRuntimeEnvironmentId`: it starts from an explicit choice and
  // returns null without one, which is right for a worktree of unknown provenance. Here the
  // absence of a choice is not ambiguity — a browser saves exactly one environment, the
  // server that served it, so an unset preference means that server rather than "local".
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
 * The runtime a web client must use when ownership resolved to "this machine".
 *
 * Ownership resolving local is a correct answer on the desktop app and an impossible
 * one in the browser: there is no local shell there, only a rejecting `pty.spawn`
 * stub. Owner resolution can still land on local for reasons that have nothing to do
 * with the floating workspace — a freshly created project whose catalog rows have not
 * been published with their runtime host yet is the one users hit, and it clears on
 * reload once hydration supplies the host.
 *
 * So this is a floor, not a diagnosis: whatever made ownership come out local, the
 * connected runtime is a better destination than an exception. Same value as the
 * floating owner above; separate name because the reason differs and the floating
 * rule is deliberate while this one is a backstop.
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
