import type { RuntimeStatus } from '../../../shared/runtime-types'
import { isWebClientLocation } from './web-client-location'
import { resolveFloatingWorkspaceRuntimeEnvironmentId } from './floating-workspace-runtime-owner'

/**
 * Which platform will run a command Orca builds for a host?
 *
 * The client answers only when the client IS the host. A focused runtime owns the terminals it
 * spawns, and a browser has no machine of its own — both must build for the runtime, which
 * publishes `hostPlatform` in its status. Returns null when the client is its own host.
 *
 * This is the execution question. The presentation question — keyboard modifiers, shortcut
 * labels — stays with the client and must not read this.
 */
export function resolveExecutionHostPlatform({
  isWebClient,
  activeRuntimeEnvironmentId,
  runtimeEnvironments,
  runtimeStatusByEnvironmentId
}: {
  isWebClient: boolean
  activeRuntimeEnvironmentId: string | null | undefined
  runtimeEnvironments?: readonly { id: string }[]
  runtimeStatusByEnvironmentId?: ReadonlyMap<string, { status: RuntimeStatus | null }>
}): NodeJS.Platform | null {
  // A focused runtime is the execution host on desktop too, so it wins before the browser rule.
  const environmentId =
    activeRuntimeEnvironmentId?.trim() ||
    resolveFloatingWorkspaceRuntimeEnvironmentId({
      isWebClient,
      activeRuntimeEnvironmentId,
      runtimeEnvironments
    })
  if (!environmentId) {
    return null
  }
  return runtimeStatusByEnvironmentId?.get(environmentId)?.status?.hostPlatform ?? null
}

export function getExecutionHostPlatform(state: {
  settings?: { activeRuntimeEnvironmentId?: string | null } | null
  runtimeEnvironments?: readonly { id: string }[]
  runtimeStatusByEnvironmentId?: ReadonlyMap<string, { status: RuntimeStatus | null }>
}): NodeJS.Platform | null {
  return resolveExecutionHostPlatform({
    isWebClient: isWebClientLocation(),
    activeRuntimeEnvironmentId: state.settings?.activeRuntimeEnvironmentId,
    runtimeEnvironments: state.runtimeEnvironments,
    runtimeStatusByEnvironmentId: state.runtimeStatusByEnvironmentId
  })
}
