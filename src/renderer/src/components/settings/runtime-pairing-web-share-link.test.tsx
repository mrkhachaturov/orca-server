// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { RuntimePairingGeneratorForm } from './RuntimePairingGeneratorForm'
import { TooltipProvider } from '../ui/tooltip'

// Why: in the web client the advertised address is server policy (serve --pairing-address), so the
// form hides every address control. A gate that requires a selected address can therefore never
// open, and "Share this Orca server" becomes a dead button.

afterEach(() => {
  cleanup()
  Object.assign(window, { __ORCA_WEB_CLIENT__: undefined })
})

function renderForm(
  overrides: Partial<React.ComponentProps<typeof RuntimePairingGeneratorForm>> = {}
) {
  const props: React.ComponentProps<typeof RuntimePairingGeneratorForm> = {
    intent: 'another',
    loopbackAddress: '127.0.0.1',
    // Empty because the web preload reports no interfaces: a proxied workspace's own
    // interfaces are never reachable from where the browser sits.
    networkInterfaces: [],
    selectedAddress: '',
    refreshingNetworkInterfaces: false,
    isGeneratingPairing: false,
    webClientUrl: null,
    runtimePairingUrl: null,
    copiedTarget: null,
    generatedAddress: null,
    onIntentChange: vi.fn(),
    onSelectedAddressChange: vi.fn(),
    onRefreshNetworkInterfaces: vi.fn(),
    onGenerate: vi.fn(),
    onCopy: vi.fn(),
    ...overrides
  }
  return render(
    <TooltipProvider>
      <RuntimePairingGeneratorForm {...props} />
    </TooltipProvider>
  )
}

describe('sharing this Orca server from the web client', () => {
  it('offers Generate Access Link with no address to choose', () => {
    Object.assign(window, { __ORCA_WEB_CLIENT__: true })
    renderForm()

    expect(screen.getByRole('button', { name: 'Generate Access Link' })).toBeEnabled()
  })

  it('still waits for an address on the desktop app', () => {
    // Regression guard, not proof: green with or without the fix. A desktop app picks its own
    // advertised interface, so an unchosen address must keep the button shut.
    Object.assign(window, { __ORCA_WEB_CLIENT__: false })
    renderForm()

    expect(screen.getByRole('button', { name: 'Generate Access Link' })).toBeDisabled()
  })
})
