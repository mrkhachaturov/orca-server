/** Substituted with the worktree's absolute path, URL-encoded. */
export const OPEN_IN_URL_PATH_PLACEHOLDER = '{path}'

/**
 * Resolve an "Open in" URL template against a worktree path, or null when unusable so a bad
 * entry renders disabled instead of throwing at click time.
 *
 * The template stays opaque on purpose: deployment-specific knowledge (app slug, wildcard
 * domain, reachability) belongs to whoever provisions the host, not to Orca.
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
  // Templates can arrive seeded from the runtime's settings store, so `javascript:` or `data:`
  // here would turn a menu click into script execution in the client.
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null
  }
  return parsed.toString()
}

/**
 * Any path answers this identically: substitution runs through `encodeURIComponent`, which can
 * never introduce a scheme, an authority or a delimiter.
 */
const OPEN_IN_URL_PROBE_PATH = '/probe'

/** True when this template would actually navigate — for menus deciding enabledness at render
 *  time, where no worktree path is in scope. */
export function isOpenInUrlTemplateUsable(template: string | undefined): boolean {
  return resolveOpenInUrl(template, OPEN_IN_URL_PROBE_PATH) !== null
}

/** True when this entry opens a URL rather than spawning a local command. */
export function isOpenInUrlEntry(entry: { url?: string }): boolean {
  return Boolean(entry.url?.trim())
}
