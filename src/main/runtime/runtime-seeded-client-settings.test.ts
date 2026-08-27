import { describe, expect, it } from 'vitest'
import { RUNTIME_SEEDED_SETTING_KEYS } from '../../shared/runtime-seeded-settings'
import { OrcaRuntimeService } from './orca-runtime'

// The seed only reaches a browser if `settings.get` carries it. The picker is covered
// by `runtime-seeded-settings.test.ts` and the load path by
// `web-preload-settings-seeding.test.ts`; this is the projection between them, where a
// key silently drops out because `getClientSettings()` returns an explicit field list.

type SettingsShape = ReturnType<
  NonNullable<ConstructorParameters<typeof OrcaRuntimeService>[0]>['getSettings']
>

function runtimeWithSettings(settings: Partial<SettingsShape>): OrcaRuntimeService {
  return new OrcaRuntimeService({
    getSettings: () => settings as SettingsShape
  } as NonNullable<ConstructorParameters<typeof OrcaRuntimeService>[0]>)
}

/** The store is JSON parsed off disk, so a hand-edited value arrives untyped by construction. */
function runtimeWithRawSettings(raw: Record<string, unknown>): OrcaRuntimeService {
  return runtimeWithSettings(raw as unknown as Partial<SettingsShape>)
}

describe('runtime-seeded settings reach the client payload', () => {
  it('projects a seeded appearance key the explicit field list does not name', () => {
    // Why: without the spread the browser reads stock defaults forever — the workspace
    // sets a theme, every tile ignores it, and the toggle is re-clicked after each create.
    const runtime = runtimeWithSettings({ theme: 'dark', appFontFamily: 'JetBrains Mono' })

    const client = runtime.getClientSettings()

    expect(client.theme).toBe('dark')
    expect(client.appFontFamily).toBe('JetBrains Mono')
  })

  it('projects a seeded experimental flag', () => {
    const runtime = runtimeWithSettings({ experimentalMobile: true })

    expect(runtime.getClientSettings().experimentalMobile).toBe(true)
  })

  it('omits a seeded key the store never set, rather than seeding undefined', () => {
    // Why: an explicit undefined would overwrite the browser's own choice on merge.
    const runtime = runtimeWithSettings({ theme: 'dark' })

    const client = runtime.getClientSettings()

    expect('experimentalMobile' in client).toBe(false)
  })

  it('drops a seeded key whose stored value is not valid for it', () => {
    // Why: a hand-edited store must degrade that one key to its stock default, not fail
    // the whole payload and leave the tile with no settings at all.
    const runtime = runtimeWithRawSettings({
      theme: 'dark',
      uiLanguage: 'not-a-language'
    })

    const client = runtime.getClientSettings()

    expect(client.theme).toBe('dark')
    expect(client.uiLanguage).not.toBe('not-a-language')
  })

  it('never lets an explicit field lose to the seed spread', () => {
    // Why: the spread is first on purpose. If a seeded key ever collides with one the
    // explicit list also returns, the explicit value is the authoritative one.
    const explicitKeys = Object.keys(
      runtimeWithSettings({ theme: 'dark' }).getClientSettings()
    ).filter((key) => !RUNTIME_SEEDED_SETTING_KEYS.includes(key as never))

    expect(explicitKeys.length).toBeGreaterThan(0)
  })
})
