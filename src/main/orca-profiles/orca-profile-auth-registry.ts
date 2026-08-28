import type {
  OrcaProfileAuthStatus,
  SignOutCurrentOrcaProfileResult
} from '../../shared/orca-profiles'

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
 * Two providers, and the split is the point. The status read never mints, refreshes or clears a
 * session. Sign-out clears one, and it is here rather than left to the client because the web
 * preload's own `signOutCurrent` returned a canned `signed-out` that never reached the host: the
 * pane toasted success, re-read the host status, and showed the account still signed in.
 *
 * Initiating sign-in from the tile is still not here — the authorization code has to reach the
 * host, which upstream's loopback PKCE flow cannot deliver to a browser on another machine.
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

export type OrcaProfileSignOutProvider = () => Promise<SignOutCurrentOrcaProfileResult>

let signOutProvider: OrcaProfileSignOutProvider | null = null

export function setOrcaProfileSignOutProvider(next: OrcaProfileSignOutProvider | null): void {
  signOutProvider = next
}

/**
 * Why this throws rather than answering a `signed-out` shape: the result type has one status, so a
 * fabricated success is indistinguishable from a real one at every caller. A host that cannot clear
 * its own session must say so.
 */
export function runRegisteredOrcaProfileSignOut(): Promise<SignOutCurrentOrcaProfileResult> {
  if (!signOutProvider) {
    return Promise.reject(new Error('orca_profile_sign_out_unavailable'))
  }
  return signOutProvider()
}
