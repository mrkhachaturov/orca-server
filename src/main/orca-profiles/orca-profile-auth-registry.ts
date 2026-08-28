import type { OrcaProfileAuthStatus } from '../../shared/orca-profiles'

/**
 * The Orca account auth-status provider, split out of the `orcaProfiles:*` IPC handlers.
 *
 * Why: the web tile has no account status at all — `web-preload-api.ts` answers a fabricated
 * `{configured: false, state: 'unconfigured'}`, so Artifacts renders "Orca account sign-in is not
 * configured on this machine yet" for a host where it IS configured, and both share panes hide
 * their sign-in affordance behind a lie. Reading the real status means
 * `getCurrentOrcaProfileAuthStatus`, whose import chain reaches `electron` twice
 * (`profile-cloud-auth-config.ts` imports `app`, `profile-cloud-session-store.ts` imports
 * `safeStorage`), and `config/runtime-electron-baseline.txt` requires the runtime graph to stay
 * empty of Electron importers — so the import here is type-only and erased.
 *
 * A registry rather than a runtime constructor dependency, for the same reason as
 * `usage/usage-store-registry.ts`: the profile index and the cloud-session cache are
 * process singletons keyed by userData path, so resolving them a second time runtime-side
 * would answer from a different cache than the one sign-in writes.
 *
 * Read-only by design. This registry reports whether the host holds a session; it never mints,
 * refreshes or clears one. Initiating sign-in from the tile needs the authorization code to reach
 * the host, which upstream's loopback PKCE flow cannot deliver to a browser on another machine.
 */

export type OrcaProfileAuthStatusProvider = () => OrcaProfileAuthStatus

let provider: OrcaProfileAuthStatusProvider | null = null

export function setOrcaProfileAuthStatusProvider(
  next: OrcaProfileAuthStatusProvider | null
): void {
  provider = next
}

/**
 * Why this throws rather than answering an `unconfigured` status: a fabricated "not configured"
 * is the exact defect this bridge replaces, and a host that cannot report its own account state
 * must say so instead of impersonating a host that has none.
 */
export function getRegisteredOrcaProfileAuthStatus(): OrcaProfileAuthStatus {
  if (!provider) {
    throw new Error('orca_profile_auth_unavailable')
  }
  return provider()
}
