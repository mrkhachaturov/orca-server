// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// Overlay-owned so it survives `quilt pop`: with the patch popped both switches carry
// `disabled={isWebClient}` again and every case below fails.
//
// Why this matters more than it looks: on orca-server the host is headless, so the pane's own
// "Desktop only. Open Settings on the host device to change this setting." named a UI that does
// not exist anywhere. The control was not merely inconvenient, it was the only one there is.

const storeState: Record<string, unknown> = {}

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(storeState)
}))

beforeEach(() => {
  Object.assign(storeState, {
    openArtifactsPage: vi.fn(),
    openSkillsPage: vi.fn(),
    openSkillsSharedLinks: vi.fn(),
    orcaProfileAuthStatus: { activeProfileId: 'local-default', configured: true, state: 'connected', persistence: 'memory-only' },
    orcaProfileConnecting: false,
    connectCurrentOrcaProfile: vi.fn(),
    fetchOrcaProfileAuthStatus: vi.fn(),
    settings: { agentSkillSharingEnabled: false },
    updateSettings: vi.fn()
  })
  Object.assign(window, { __ORCA_WEB_CLIENT__: true })
})

afterEach(() => {
  cleanup()
  Object.assign(window, { __ORCA_WEB_CLIENT__: undefined })
  vi.clearAllMocks()
})

function switchFor(label: string): HTMLElement {
  const row = screen.getByText(label).closest('div')?.parentElement
  const control = row?.querySelector('button[role="switch"]')
  if (!control) {
    throw new Error(`no switch found for "${label}"`)
  }
  return control as HTMLElement
}

describe('Artifacts pane in the browser', () => {
  async function renderPane(artifactSharingEnabled = false) {
    const { ArtifactsSettingsPane } = await import('./ArtifactsSettingsPane')
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    render(
      <ArtifactsSettingsPane
        settings={{ artifactSharingEnabled } as never}
        updateSettings={updateSettings}
      />
    )
    return updateSettings
  }

  it('lets the operator turn publishing on', async () => {
    await renderPane(false)
    expect(switchFor('Allow publishing public artifact links')).toBeEnabled()
  })

  it('sends the grant when the switch is used', async () => {
    const updateSettings = await renderPane(false)
    switchFor('Allow publishing public artifact links').click()
    expect(updateSettings).toHaveBeenCalledWith({ artifactSharingEnabled: true })
  })

  it('no longer tells the operator to open a UI the host does not have', async () => {
    await renderPane(false)
    expect(
      screen.queryByText(/Desktop only\. Open Settings . Artifacts on the host device/)
    ).toBeNull()
    expect(
      screen.queryByText(/Open Settings . Artifacts in the Orca desktop app on the host device/)
    ).toBeNull()
  })
})

describe('Share Skills pane in the browser', () => {
  async function renderPane() {
    const { ShareSkillsSettingsPane } = await import('./ShareSkillsSettingsPane')
    render(<ShareSkillsSettingsPane />)
  }

  it('lets the operator authorise agents and the CLI', async () => {
    await renderPane()
    expect(switchFor('Allow agents and the Orca CLI to publish skill links')).toBeEnabled()
  })

  it('sends the grant when the switch is used', async () => {
    await renderPane()
    switchFor('Allow agents and the Orca CLI to publish skill links').click()
    expect(storeState.updateSettings).toHaveBeenCalledWith({ agentSkillSharingEnabled: true })
  })

  it('no longer tells the operator to open a UI the host does not have', async () => {
    await renderPane()
    expect(
      screen.queryByText(/Desktop only\. Open Settings . Share Skills on the host device/)
    ).toBeNull()
  })
})
