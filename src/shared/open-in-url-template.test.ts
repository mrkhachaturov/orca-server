import { describe, expect, it } from 'vitest'
import { isOpenInUrlTemplateUsable, resolveOpenInUrl } from './open-in-url-template'

const WORKTREE = '/home/coder/orca/workspaces/my-feature'

describe('resolveOpenInUrl', () => {
  it('substitutes the worktree path, URL-encoded', () => {
    expect(resolveOpenInUrl('https://code-server.example.com/?folder={path}', WORKTREE)).toBe(
      'https://code-server.example.com/?folder=%2Fhome%2Fcoder%2Forca%2Fworkspaces%2Fmy-feature'
    )
  })

  it('substitutes every occurrence', () => {
    expect(resolveOpenInUrl('https://e.com/{path}?folder={path}', '/a b')).toBe(
      'https://e.com/%2Fa%20b?folder=%2Fa%20b'
    )
  })

  it('encodes characters that would otherwise break out of the query', () => {
    const resolved = resolveOpenInUrl('https://e.com/?folder={path}', '/tmp/x&y=z#frag')
    expect(resolved).toBe('https://e.com/?folder=%2Ftmp%2Fx%26y%3Dz%23frag')
  })

  it('leaves a template without the placeholder alone', () => {
    expect(resolveOpenInUrl('https://e.com/fixed', WORKTREE)).toBe('https://e.com/fixed')
  })

  // These templates can arrive seeded from the runtime's settings store.
  it('refuses javascript: and data: URLs', () => {
    expect(resolveOpenInUrl('javascript:alert(1)//{path}', WORKTREE)).toBeNull()
    expect(resolveOpenInUrl('data:text/html,<script>alert(1)</script>', WORKTREE)).toBeNull()
  })

  it('refuses non-web schemes even when they parse', () => {
    expect(resolveOpenInUrl('file:///etc/passwd', WORKTREE)).toBeNull()
    expect(resolveOpenInUrl('vscode://coder.coder-remote/open?folder={path}', WORKTREE)).toBeNull()
  })

  it('accepts http as well as https', () => {
    expect(resolveOpenInUrl('http://localhost:8080/?folder={path}', '/x')).toBe(
      'http://localhost:8080/?folder=%2Fx'
    )
  })

  it('returns null for unusable templates instead of throwing', () => {
    expect(resolveOpenInUrl(undefined, WORKTREE)).toBeNull()
    expect(resolveOpenInUrl('', WORKTREE)).toBeNull()
    expect(resolveOpenInUrl('   ', WORKTREE)).toBeNull()
    expect(resolveOpenInUrl('not a url', WORKTREE)).toBeNull()
  })
})

// Separate from resolveOpenInUrl because menus decide enabledness while rendering, where no
// worktree path is in scope.
describe('isOpenInUrlTemplateUsable', () => {
  it('accepts templates that would navigate', () => {
    expect(isOpenInUrlTemplateUsable('https://cs.example.com/?folder={path}')).toBe(true)
    expect(isOpenInUrlTemplateUsable('http://localhost:8080/')).toBe(true)
  })

  it('rejects non-web schemes without needing a real path', () => {
    expect(isOpenInUrlTemplateUsable('javascript:alert(1)//{path}')).toBe(false)
    expect(isOpenInUrlTemplateUsable('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isOpenInUrlTemplateUsable('file:///etc/passwd')).toBe(false)
    expect(isOpenInUrlTemplateUsable('vscode://coder.coder-remote/open?folder={path}')).toBe(false)
  })

  it('rejects empty and unparseable templates', () => {
    expect(isOpenInUrlTemplateUsable(undefined)).toBe(false)
    expect(isOpenInUrlTemplateUsable('   ')).toBe(false)
    expect(isOpenInUrlTemplateUsable('not a url')).toBe(false)
    expect(isOpenInUrlTemplateUsable('//evil.example.com/{path}')).toBe(false)
  })

  // Substitution is encodeURIComponent, which cannot produce a scheme or an authority.
  it('agrees with resolveOpenInUrl for a real worktree path', () => {
    for (const template of [
      'https://cs.example.com/?folder={path}',
      'javascript:alert(1)//{path}',
      'https://{path}.example.com/',
      'not a url'
    ]) {
      expect(isOpenInUrlTemplateUsable(template)).toBe(resolveOpenInUrl(template, WORKTREE) !== null)
    }
  })
})
