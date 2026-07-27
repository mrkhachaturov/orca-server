import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../../../shared/types'
import type { AppState } from '../types'
import { createSettingsSlice } from './settings'

const webClientLocation = vi.hoisted(() => ({ value: false }))
vi.mock('../../lib/web-client-location', () => ({
  isWebClientLocation: () => webClientLocation.value
}))

afterEach(() => {
  vi.unstubAllGlobals()
  webClientLocation.value = false
})

async function fetchSettingsWith(isWebClient: boolean): Promise<{ hydrated: boolean }> {
  webClientLocation.value = isWebClient
  vi.stubGlobal('window', {
    api: { settings: { get: () => Promise.resolve({} as GlobalSettings) } }
  })

  let hydrated = false
  let state: Record<string, unknown> = {}
  const set = (patch: unknown): void => {
    const next = typeof patch === 'function' ? (patch as (s: unknown) => object)(state) : patch
    state = { ...state, ...(next as object) }
  }
  const get = (): AppState =>
    ({
      ...state,
      // A macrotask, so a fire-and-forget call provably has NOT completed by the time
      // fetchSettings resolves — that is the window under test.
      hydrateRuntimeEnvironmentCatalog: () =>
        new Promise((resolve) => {
          setTimeout(() => {
            hydrated = true
            resolve([])
          }, 0)
        }),
      hydrateRuntimeEnvironmentStatuses: () => Promise.resolve()
    }) as unknown as AppState

  const slice = createSettingsSlice(
    set as never,
    get as never,
    {} as never
  ) as unknown as { fetchSettings: () => Promise<void> }
  await slice.fetchSettings()
  return { hydrated }
}

describe('runtime environment catalog at boot', () => {
  it('has the catalog before fetchSettings resolves in a web client', async () => {
    // Ownership resolution reads the catalog synchronously from store state, and an empty one
    // resolves to local — the answer a web client can never act on. Listing is a localStorage
    // read in a browser, not a network probe.
    const { hydrated } = await fetchSettingsWith(true)
    expect(hydrated).toBe(true)
  })

  it('keeps the desktop boot off the network round trip', async () => {
    // On the desktop the probe hits the network and ownership has a valid local answer while
    // it is missing, so fire-and-forget stays.
    const { hydrated } = await fetchSettingsWith(false)
    expect(hydrated).toBe(false)
  })
})
