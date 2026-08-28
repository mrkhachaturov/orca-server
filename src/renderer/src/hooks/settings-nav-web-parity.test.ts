import { describe, expect, it } from 'vitest'
import { buildSettingsNavigationMetadata } from './useSettingsNavigationMetadata'

function ids(options: { isWebClient: boolean; isMac?: boolean; isWindows?: boolean }): string[] {
  return buildSettingsNavigationMetadata({
    isMac: options.isMac ?? false,
    isWindows: options.isWindows ?? false,
    isWebClient: options.isWebClient,
    isDev: false,
    repos: []
  }).map((entry) => entry.id)
}

const web = (over: { isMac?: boolean } = {}) => ids({ isWebClient: true, ...over })
const desktop = (over: { isMac?: boolean; isWindows?: boolean } = {}) =>
  ids({ isWebClient: false, ...over })

// Listed because each pane draws real host data in the tile. Orca Account and Plugins are partial —
// no sign-in, and no plugin list until `pluginSystemEnabled` reaches the host — and partial is not a
// reason to hide a capability from the browser.
const WEB_SECTIONS_WITH_A_PANE = [
  'computer-use',
  'mobile',
  'browser',
  'orca-account',
  'plugins'
]

// Not listed, and the reason differs by section. `ssh` is the one that would MISLEAD rather than sit
// empty: `orca serve` never installs the SSH layer, so the registry is null and every control
// reports a host state it never read. `voice` has no `speech` namespace in the web preload,
// `advanced` writes proxy keys the settings schema rejects, `notifications` drives native desktop
// toasts through an inert host port, and the two Mac sections keep upstream's renderer gate.
const WEB_SECTIONS_WITHOUT_A_PANE = [
  'ssh',
  'mobile-emulator',
  'developer-permissions',
  'voice',
  'notifications',
  'advanced',
  'dev'
]

describe('settings navigation — the tile lists only what it can open', () => {
  it.each(WEB_SECTIONS_WITH_A_PANE)('lists %s', (id) => {
    expect(web()).toContain(id)
  })

  it.each(WEB_SECTIONS_WITHOUT_A_PANE)('does not list %s', (id) => {
    expect(web()).not.toContain(id)
  })

  it('does not list the Mac-only sections to a browser running on a Mac', () => {
    expect(web({ isMac: true })).not.toContain('mobile-emulator')
    expect(web({ isMac: true })).not.toContain('developer-permissions')
  })
})

describe('settings navigation — desktop behaviour is unchanged', () => {
  it('still gates macOS Permissions on the renderer being a Mac', () => {
    expect(desktop({ isMac: true })).toContain('developer-permissions')
    expect(desktop({ isMac: false })).not.toContain('developer-permissions')
  })

  it('still lists the emulator on any desktop, as upstream does', () => {
    expect(desktop({ isMac: true })).toContain('mobile-emulator')
    expect(desktop({ isMac: false })).toContain('mobile-emulator')
  })

  it.each([
    'orca-account',
    'mobile',
    'plugins',
    'ssh',
    'browser',
    'computer-use',
    'voice',
    'notifications',
    'advanced'
  ])('still lists %s', (id) => {
    expect(desktop({ isMac: true })).toContain(id)
  })
})

describe('settings navigation — search follows visibility', () => {
  it.each(WEB_SECTIONS_WITH_A_PANE)('makes %s findable by search', (id) => {
    const section = buildSettingsNavigationMetadata({
      isMac: false,
      isWindows: false,
      isWebClient: true,
      isDev: false,
      repos: []
    }).find((entry) => entry.id === id)

    expect(section, `${id} is not in the nav`).toBeDefined()
    expect(section?.searchEntries.length ?? 0).toBeGreaterThan(0)
  })
})
