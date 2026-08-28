import { describe, expect, it } from 'vitest'
import { buildSettingsNavigationMetadata } from './useSettingsNavigationMetadata'

// Overlay-owned so it survives `quilt pop`: with the patch popped, the blanket
// `showDesktopOnlySettings = !isWebClient` returns and every "web can reach" case below fails.

function ids(options: {
  isWebClient: boolean
  hostPlatform?: string | null
  isMac?: boolean
  isWindows?: boolean
}): string[] {
  return buildSettingsNavigationMetadata({
    isMac: options.isMac ?? false,
    isWindows: options.isWindows ?? false,
    isWebClient: options.isWebClient,
    hostPlatform: options.hostPlatform ?? null,
    isDev: false,
    repos: []
  }).map((entry) => entry.id)
}

const web = (hostPlatform: string | null = 'linux') => ids({ isWebClient: true, hostPlatform })
const desktop = (over: { isMac?: boolean; isWindows?: boolean } = {}) =>
  ids({ isWebClient: false, ...over })

describe('settings navigation — the tile reaches what the host can do', () => {
  it('lists the account pane the sharing features gate on', () => {
    // Both Artifacts and Share Skills render a "Sign in to Orca" affordance; without this entry it
    // pointed at a section a browser could never open.
    expect(web()).toContain('orca-account')
  })

  it('lists the panes our own series already wired', () => {
    // Each of these has a patch behind it whose "To test" says to open it in the tile.
    expect(web()).toContain('plugins')
    expect(web()).toContain('mobile')
  })

  it('lists the host-owned panes whose RPCs the tile already reaches', () => {
    expect(web()).toContain('ssh')
    expect(web()).toContain('browser')
    expect(web()).toContain('computer-use')
  })

  it('still hides what a browser genuinely has no equivalent for', () => {
    // Native desktop notifications (an inert host port with no renderer), the proxy pane whose keys
    // the RPC schema rejects, and dev tooling.
    const listed = web()
    expect(listed).not.toContain('notifications')
    expect(listed).not.toContain('advanced')
    expect(listed).not.toContain('dev')
  })

  it('still hides Voice until its preload namespace exists', () => {
    // `web-preload-api.ts` has no `speech` namespace, so every control in that pane would be
    // undefined. Listing it would be a pane of dead controls.
    expect(web()).not.toContain('voice')
  })
})

describe('settings navigation — host-specific sections ask the host', () => {
  it('offers the iOS simulator to a browser driving a Mac host', () => {
    expect(web('darwin')).toContain('mobile-emulator')
    expect(web('darwin')).toContain('developer-permissions')
  })

  it('does not offer them for a Linux host', () => {
    expect(web('linux')).not.toContain('mobile-emulator')
    expect(web('linux')).not.toContain('developer-permissions')
  })

  it('does not offer them before the host platform is known', () => {
    expect(web(null)).not.toContain('mobile-emulator')
  })

  it('leaves desktop behaviour unchanged, where renderer and host are one machine', () => {
    expect(desktop({ isMac: true })).toContain('mobile-emulator')
    expect(desktop({ isMac: true })).toContain('developer-permissions')
    expect(desktop({ isMac: false })).not.toContain('mobile-emulator')
    // Everything the desktop listed before is still listed.
    for (const id of ['orca-account', 'mobile', 'plugins', 'ssh', 'browser', 'computer-use', 'voice', 'notifications', 'advanced']) {
      expect(desktop({ isMac: true })).toContain(id)
    }
  })
})

describe('settings navigation — search follows visibility', () => {
  it('gives every listed section at least one search entry', () => {
    // A section the nav lists but search cannot find is the same defect in a different place: the
    // hidden panes were unreachable by Cmd+F too, because entries come from this same builder.
    const reachable = buildSettingsNavigationMetadata({
      isMac: false,
      isWindows: false,
      isWebClient: true,
      hostPlatform: 'linux',
      isDev: false,
      repos: []
    })
    for (const id of ['orca-account', 'plugins', 'mobile', 'ssh', 'browser', 'computer-use']) {
      const item = reachable.find((entry) => entry.id === id)
      expect(item, `${id} is not in the nav`).toBeDefined()
      expect(item!.searchEntries.length, `${id} has no search entries`).toBeGreaterThan(0)
    }
  })
})
