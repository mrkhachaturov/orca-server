// @vitest-environment happy-dom

// Written without JSX so the pane can be driven from a `.ts` file.
import '@testing-library/jest-dom/vitest'

import { createElement, type ReactNode } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../../../shared/types'

const mocks = vi.hoisted(() => {
  const holder = {
    state: {
      settingsSearchQuery: '',
      recordFeatureInteraction: (_feature: string): void => {}
    }
  }
  const useAppStore = Object.assign(
    (selector: (state: typeof holder.state) => unknown) => selector(holder.state),
    { getState: () => holder.state }
  )
  return {
    holder,
    useAppStore,
    recordFeatureInteraction: vi.fn(),
    onSelectHolder: { select: null as ((path: string) => void) | null },
    toastError: vi.fn()
  }
})

vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }))

vi.mock('../../store', () => ({ useAppStore: mocks.useAppStore }))
vi.mock('@/store', () => ({ useAppStore: mocks.useAppStore }))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback,
  i18n: { language: 'en' }
}))
vi.mock('../../i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback,
  i18n: { language: 'en' }
}))
vi.mock('@/lib/web-client-location', () => ({ isWebClientLocation: () => true }))

// Keep the dialog shell out of the way; the audit targets the grant wiring only.
vi.mock('../ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? createElement('div', null, children) : null,
  DialogContent: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  DialogHeader: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  DialogTitle: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  DialogDescription: ({ children }: { children: ReactNode }) => createElement('div', null, children)
}))

// Stand in for the host-fs browser: one button that reports a chosen directory.
vi.mock('../sidebar/RemoteFileBrowser', () => ({
  RemoteFileBrowser: (props: { onSelect: (path: string) => void }) => {
    mocks.onSelectHolder.select = props.onSelect
    return createElement(
      'button',
      { type: 'button', 'data-testid': 'confirm-pick', onClick: () => props.onSelect(PICKED_PATH) },
      'Select'
    )
  }
}))

const PICKED_PATH = '/srv/workspaces/picked'

const { FloatingWorkspacePane } = await import('./FloatingWorkspacePane')

function makeSettings(): GlobalSettings {
  return {
    floatingTerminalEnabled: true,
    floatingTerminalCwd: '~',
    floatingTerminalTriggerLocation: 'floating-button',
    activeRuntimeEnvironmentId: 'web-env-1'
  } as unknown as GlobalSettings
}

describe('floating workspace directory grant failure', () => {
  let grantFloatingWorkspaceDirectory: ReturnType<typeof vi.fn>
  let updateSettings: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mocks.recordFeatureInteraction.mockReset()
    mocks.toastError.mockReset()
    mocks.holder.state.settingsSearchQuery = ''
    mocks.holder.state.recordFeatureInteraction = mocks.recordFeatureInteraction
    mocks.onSelectHolder.select = null
    grantFloatingWorkspaceDirectory = vi.fn()
    updateSettings = vi.fn()
    ;(window as unknown as { api: unknown }).api = {
      app: {
        getFloatingTerminalCwd: vi.fn().mockResolvedValue(''),
        pickFloatingWorkspaceDirectory: vi.fn().mockResolvedValue(null),
        grantFloatingWorkspaceDirectory
      }
    }
  })

  afterEach(() => {
    cleanup()
  })

  async function pickDirectory(): Promise<void> {
    const user = userEvent.setup()
    render(
      createElement(FloatingWorkspacePane, {
        settings: makeSettings(),
        updateSettings: updateSettings as unknown as (updates: Partial<GlobalSettings>) => void
      })
    )
    await user.click(screen.getByLabelText('Choose floating workspace directory'))
    await user.click(await screen.findByTestId('confirm-pick'))
    await waitFor(() => {
      expect(grantFloatingWorkspaceDirectory).toHaveBeenCalledWith(PICKED_PATH)
    })
  }

  it('stores the picked directory when the server grant succeeds', async () => {
    grantFloatingWorkspaceDirectory.mockResolvedValue(undefined)

    await pickDirectory()

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({ floatingTerminalCwd: PICKED_PATH })
    })
  }, 15_000)

  it('does not store a directory the server refused to authorise', async () => {
    grantFloatingWorkspaceDirectory.mockRejectedValue(
      new Error('floatingWorkspace.grantDirectory: EACCES')
    )

    await pickDirectory()

    // Why: a stored path the server refused resolves to '', which the input then renders
    // as the configured directory — so the pane would show a directory that was never
    // authorised while the floating terminal opened somewhere else.
    await waitFor(() => {
      expect(grantFloatingWorkspaceDirectory).toHaveBeenCalledTimes(1)
    })
    expect(updateSettings).not.toHaveBeenCalled()
  }, 15_000)

  it('tells the user why the directory was refused', async () => {
    // Why: dropping the pick silently is indistinguishable from a misclick. The server's
    // own reason is the only thing that says whether to pick elsewhere or fix a permission.
    grantFloatingWorkspaceDirectory.mockRejectedValue(
      new Error('floatingWorkspace.grantDirectory: EACCES')
    )

    await pickDirectory()

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('floatingWorkspace.grantDirectory: EACCES')
    })
  }, 15_000)
})
