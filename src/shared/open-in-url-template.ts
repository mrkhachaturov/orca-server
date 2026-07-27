/** Substituted with the worktree's absolute path, URL-encoded. */
export const OPEN_IN_URL_PATH_PLACEHOLDER = '{path}'

/**
 * Resolve an "Open in" URL template against a worktree path.
 *
 * Why templates at all: a `command` entry spawns a local process, which is meaningless when the
 * worktree lives on another machine — the runtime blocks those, correctly, for remote runtimes.
 * A browser-based editor served by the same host has no such problem: it is just a URL that
 * happens to take the path as a query parameter, e.g.
 *
 *   https://code-server--<workspace>--<owner>.<wildcard>/?folder={path}
 *
 * Keeping this as an opaque template is deliberate. Deployment-specific knowledge — the app's
 * slug, the wildcard domain, whether it is even reachable — belongs to whoever provisions the
 * host, not to Orca. Orca only learns to open a link.
 *
 * Returns null when the template is unusable, so a bad entry renders disabled instead of
 * throwing at click time.
 */
export function resolveOpenInUrl(template: string | undefined, path: string): string | null {
  const trimmed = template?.trim()
  if (!trimmed) {
    return null
  }
  const substituted = trimmed.split(OPEN_IN_URL_PATH_PLACEHOLDER).join(encodeURIComponent(path))
  let parsed: URL
  try {
    parsed = new URL(substituted)
  } catch {
    return null
  }
  // Why an explicit scheme allowlist: these templates can arrive from the runtime's own settings
  // store, which a host operator seeds. `javascript:` or `data:` here would turn a menu click
  // into script execution in the client, so anything but plain web navigation is refused.
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null
  }
  return parsed.toString()
}

/**
 * Stand-in worktree path for testing a template when no real one is in scope.
 *
 * Why a probe is faithful: substitution runs through `encodeURIComponent`, whose output is always
 * unreserved characters and `%XX` escapes. It can therefore never introduce a scheme, an
 * authority or a delimiter — so whether a template resolves is a property of the template alone,
 * and every path answers the question identically.
 */
const OPEN_IN_URL_PROBE_PATH = '/probe'

/**
 * True when this template would actually navigate — parses, and lands on http(s).
 *
 * Menus need this while rendering, where the worktree path is not available: without it a
 * `javascript:` or malformed entry renders enabled and only fails at click time, which is the
 * one thing `resolveOpenInUrl`'s contract promises it will not do.
 */
export function isOpenInUrlTemplateUsable(template: string | undefined): boolean {
  return resolveOpenInUrl(template, OPEN_IN_URL_PROBE_PATH) !== null
}

/** True when this entry opens a URL rather than spawning a local command. */
export function isOpenInUrlEntry(entry: { url?: string }): boolean {
  return Boolean(entry.url?.trim())
}
