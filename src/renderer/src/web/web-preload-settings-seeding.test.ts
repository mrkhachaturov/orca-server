// The load path for runtime-seeded settings. `src/shared/runtime-seeded-settings.test.ts` tests
// the pure key picker; none of the claims here are reachable from it.

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PreloadApi } from '../../../preload/api-types'
import type { RuntimeRpcResponse } from '../../../shared/runtime-rpc-envelope'
import type { GlobalSettings } from '../../../shared/types'

const SETTINGS_STORAGE_KEY = 'orca.web.settings.v1'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

function installBrowserGlobals(storage: MemoryStorage): Window & typeof globalThis {
  const windowStub = {
    localStorage: storage,
    location: {
      protocol: 'http:',
      reload: vi.fn()
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
    btoa: (value: string) => Buffer.from(value, 'binary').toString('base64')
  } as unknown as Window & typeof globalThis
  vi.stubGlobal('window', windowStub)
  vi.stubGlobal('navigator', { userAgent: 'Linux', hardwareConcurrency: 8 })
  return windowStub
}

// Not `settings.setActiveRuntimeEnvironmentPreference`: trusted-proxy pairing writes the
// environment key directly and never touches the settings blob, which is what leaves the first
// visit available to be seeded.
function writeStoredRuntimeEnvironment(storage: Storage, environmentId = 'web-env-1'): void {
  storage.setItem(
    'orca.web.runtimeEnvironment.v1',
    JSON.stringify({
      id: environmentId,
      name: 'Test runtime',
      createdAt: 1,
      updatedAt: 1,
      lastUsedAt: null,
      runtimeId: null,
      preferredEndpointId: `ws-${environmentId}`,
      endpoints: [
        {
          id: `ws-${environmentId}`,
          kind: 'websocket',
          label: 'WebSocket',
          endpoint: 'ws://127.0.0.1:1234',
          deviceToken: 'token',
          publicKeyB64: 'public-key'
        }
      ]
    })
  )
}

type RecordedCall = { method: string; params: unknown }

type LoadOptions = {
  /** Pass an existing storage to model a reload of the same browser. */
  storage?: MemoryStorage
  /** What the workspace's `orca-data.json` declares, as `settings.get` would project it. */
  declares: () => Partial<GlobalSettings>
  /** Model an offline or erroring runtime for `settings.get` only. */
  settingsGetFails?: () => boolean
  calls: RecordedCall[]
}

/** Boot a browser tile: fresh module registry, fresh globals, paired, runtime mocked. */
async function loadBrowser({
  storage = new MemoryStorage(),
  declares,
  settingsGetFails = () => false,
  calls
}: LoadOptions): Promise<{ api: PreloadApi; storage: MemoryStorage }> {
  vi.resetModules()
  vi.unstubAllGlobals()
  vi.doMock('./web-runtime-client', () => ({
    WebRuntimeClient: class {
      call(method: string, params?: unknown): Promise<RuntimeRpcResponse<unknown>> {
        calls.push({ method, params })
        if (method === 'settings.get' && settingsGetFails()) {
          return Promise.reject(new Error('runtime unreachable'))
        }
        return Promise.resolve({
          id: `call-${calls.length}`,
          ok: true,
          result: method === 'settings.get' ? { settings: declares() } : {},
          _meta: { runtimeId: 'runtime-1' }
        })
      }

      close(): void {}
    }
  }))
  const windowStub = installBrowserGlobals(storage)
  writeStoredRuntimeEnvironment(storage)
  const { installWebPreloadApi } = await import('./web-preload-api')
  installWebPreloadApi()
  return { api: windowStub.api, storage }
}

/**
 * A computed diff rather than a denylist: a hand-written list only catches the credentials
 * somebody thought to name, while this makes the seed's whole footprint visible.
 */
function keysChangedBy(control: GlobalSettings, seeded: GlobalSettings): string[] {
  const base = control as unknown as Record<string, unknown>
  const next = seeded as unknown as Record<string, unknown>
  return Array.from(new Set([...Object.keys(base), ...Object.keys(next)]))
    .filter((key) => JSON.stringify(base[key]) !== JSON.stringify(next[key]))
    .sort()
}

// Neither `theme` nor the experimental flags are among the keys the web client already pulled
// from the runtime, so before seeding, declaring them in `orca-data.json` changed nothing.
const DECLARED_APPEARANCE: Partial<GlobalSettings> = {
  theme: 'light',
  experimentalPet: true,
  experimentalMobile: true
}

// Shares the GlobalSettings object with the declared appearance and must not travel. No cast:
// the annotation alone must reject a key that is not a GlobalSettings key, or a fixture can name
// one that does not exist and the assertion below silently tests nothing.
const NOT_FOR_CLIENTS: Partial<GlobalSettings> = {
  opencodeSessionCookie: 'runtime-only-secret',
  terminalFontSize: 22
}

describe('web settings seeded from the runtime store', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('starts a first-visit browser at the appearance the workspace declares', async () => {
    const calls: RecordedCall[] = []
    const control = await loadBrowser({ declares: () => ({}), calls })
    const stock = await control.api.settings.get()

    const declared = await loadBrowser({ declares: () => DECLARED_APPEARANCE, calls })
    const seeded = await declared.api.settings.get()

    // Fixture guard: if upstream ever ships these as stock defaults, pick a different
    // declaration rather than deleting the assertion.
    expect(stock.theme).not.toBe('light')
    expect(stock.experimentalPet).not.toBe(true)

    expect(seeded.theme).toBe('light')
    expect(seeded.experimentalPet).toBe(true)
    expect(seeded.experimentalMobile).toBe(true)
  }, 15_000)

  it('seeds look and capability and nothing else — no credential, no per-device size', async () => {
    const calls: RecordedCall[] = []
    const control = await loadBrowser({ declares: () => ({ ...NOT_FOR_CLIENTS }), calls })
    const withoutAppearance = await control.api.settings.get()

    const declared = await loadBrowser({
      declares: () => ({ ...DECLARED_APPEARANCE, ...NOT_FOR_CLIENTS }),
      calls
    })
    const seeded = await declared.api.settings.get()

    // The declaration is the ONLY difference between the two loads, so the diff is exactly what
    // seeding moved.
    expect(keysChangedBy(withoutAppearance, seeded)).toEqual([
      'experimentalMobile',
      'experimentalPet',
      'theme'
    ])

    expect(seeded.opencodeSessionCookie).not.toBe('runtime-only-secret')
    expect(seeded.terminalFontSize).not.toBe(22)
    expect(declared.storage.getItem(SETTINGS_STORAGE_KEY)).not.toContain('runtime-only-secret')
  }, 15_000)

  it('lets the user overrule the workspace, and never writes that choice back', async () => {
    const calls: RecordedCall[] = []
    const first = await loadBrowser({ declares: () => DECLARED_APPEARANCE, calls })

    expect((await first.api.settings.get()).theme).toBe('light')

    await first.api.settings.set({ theme: 'dark' })
    const reloaded = await loadBrowser({
      storage: first.storage,
      declares: () => DECLARED_APPEARANCE,
      calls
    })

    expect((await reloaded.api.settings.get()).theme).toBe('dark')

    // Asserted over every call rather than one method name, so a seeded key travelling upstream
    // by some other route still fails.
    expect(calls.map((call) => call.method)).not.toContain('settings.update')
    expect(JSON.stringify(calls.map((call) => call.params))).not.toContain('dark')
  }, 15_000)

  it('does not re-impose a workspace declaration that changed after the first visit', async () => {
    const calls: RecordedCall[] = []
    let declaration: Partial<GlobalSettings> = { ...DECLARED_APPEARANCE }
    const first = await loadBrowser({ declares: () => declaration, calls })

    expect((await first.api.settings.get()).theme).toBe('light')

    // The browser already has settings, so a changed declaration is policy, not a default.
    declaration = { ...DECLARED_APPEARANCE, theme: 'dark' }
    const reloaded = await loadBrowser({
      storage: first.storage,
      declares: () => declaration,
      calls
    })

    expect((await reloaded.api.settings.get()).theme).toBe('light')
  }, 15_000)

  it('does not spend the first visit on a load that never reached the store', async () => {
    const calls: RecordedCall[] = []
    let offline = true
    const browser = await loadBrowser({
      declares: () => DECLARED_APPEARANCE,
      settingsGetFails: () => offline,
      calls
    })

    // "First visit" means "has never taken a seed", not "has loaded once" — otherwise an offline
    // first load denies the workspace its declared defaults forever.
    const offlineSettings = await browser.api.settings.get()
    expect(offlineSettings.theme).not.toBe('light')
    expect(browser.storage.getItem(SETTINGS_STORAGE_KEY)).toBeNull()

    offline = false
    expect((await browser.api.settings.get()).theme).toBe('light')
  }, 15_000)
})
