// The load path for runtime-seeded settings: which visit adopts the workspace's declaration,
// what reaches localStorage, and what goes back over the wire.
//
// Why this sits beside `web-preload-api.test.ts` rather than in
// `src/shared/runtime-seeded-settings.test.ts`: that file tests the pure key picker, and none of
// the claims here are reachable from it. That gap is why they rested on review.

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

// Why this and not `settings.setActiveRuntimeEnvironmentPreference`: trusted-proxy pairing writes
// the environment key directly and never touches the settings blob, so a browser that auto-paired
// behind the proxy still arrives at its first `settings.get` with no settings of its own. Pairing
// through this key is what keeps the first visit available to be seeded.
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
 * Every key on which two loaded settings objects disagree.
 *
 * Why a computed diff rather than a list of key names: a hand-written denylist only catches the
 * credentials somebody thought to name. Comparing a declared load against a control load that
 * declared nothing makes the seed's whole footprint visible, so a key that starts being seeded
 * shows up here whether or not anyone anticipated it.
 */
function keysChangedBy(control: GlobalSettings, seeded: GlobalSettings): string[] {
  const base = control as unknown as Record<string, unknown>
  const next = seeded as unknown as Record<string, unknown>
  return Array.from(new Set([...Object.keys(base), ...Object.keys(next)]))
    .filter((key) => JSON.stringify(base[key]) !== JSON.stringify(next[key]))
    .sort()
}

// A workspace that has declared how its Orca should look and which features are on. `theme` and
// the experimental flags are the point: neither is among the five keys the web client already
// pulled from the runtime, so before seeding, writing them into `orca-data.json` changed nothing.
const DECLARED_APPEARANCE: Partial<GlobalSettings> = {
  theme: 'light',
  experimentalPet: true,
  experimentalMobile: true
}

// Things that share the GlobalSettings object with the declared appearance and must not travel.
// A credential here would be readable by every browser that opens the tile; a per-device size
// would overrule whichever screen the user happens to be on.
// No cast: the annotation alone must reject a key that is not a GlobalSettings key, or a fixture
// can name one that does not exist and the assertion below silently tests nothing.
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

    // Fixture guard: if upstream ever ships these as the stock defaults this test proves nothing,
    // and the right response is to pick a different declaration, not to delete the assertion.
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
    // seeding moved. Anything beyond the declared appearance keys is a leak.
    expect(keysChangedBy(withoutAppearance, seeded)).toEqual([
      'experimentalMobile',
      'experimentalPet',
      'theme'
    ])

    // Stated directly as well, because these two are the ones that would matter.
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

    // Read-only in both directions: the workspace's declaration is a default the browser adopts,
    // and the browser's own choice stays in this browser. Asserted over every call rather than
    // over one method name, so a seeded key travelling upstream by some other route still fails.
    expect(calls.map((call) => call.method)).not.toContain('settings.update')
    expect(JSON.stringify(calls.map((call) => call.params))).not.toContain('dark')
  }, 15_000)

  it('does not re-impose a workspace declaration that changed after the first visit', async () => {
    const calls: RecordedCall[] = []
    let declaration: Partial<GlobalSettings> = { ...DECLARED_APPEARANCE }
    const first = await loadBrowser({ declares: () => declaration, calls })

    expect((await first.api.settings.get()).theme).toBe('light')

    // The workspace is re-provisioned with a different declared look. The browser already has
    // settings, so this is policy, not a default, and must not reach it.
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

    // The runtime was unreachable, so nothing was adopted and nothing was persisted. "First
    // visit" means "this browser has never taken a seed", not "this browser has loaded once" —
    // otherwise an offline first load would deny the workspace its declared defaults forever,
    // with no way back short of clearing site data.
    const offlineSettings = await browser.api.settings.get()
    expect(offlineSettings.theme).not.toBe('light')
    expect(browser.storage.getItem(SETTINGS_STORAGE_KEY)).toBeNull()

    offline = false
    expect((await browser.api.settings.get()).theme).toBe('light')
  }, 15_000)
})
