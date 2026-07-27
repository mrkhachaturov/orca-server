// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { OpenInMenuRow, type OpenInMenuRowProps } from './OpenInMenuRow'
import type { OpenInApplication } from '../../../../shared/types'

afterEach(cleanup)

const TEMPLATE = 'https://code-server--proj--me.example.com/?folder={path}'

// Typed from the component's own props: a bare `vi.fn()` is `Mock<Procedure>`, which satisfies
// nothing, so a prop renamed upstream would still compile here and stop testing the row.
type Handlers = {
  [K in 'onEditToggle' | 'onRemove' | 'onChange' | 'onCommit']: Mock<OpenInMenuRowProps[K]>
}

function renderRow(application: OpenInApplication, editing = true): Handlers {
  const handlers: Handlers = {
    onEditToggle: vi.fn(),
    onRemove: vi.fn(),
    onChange: vi.fn(),
    onCommit: vi.fn()
  }
  render(<OpenInMenuRow application={application} editing={editing} {...handlers} />)
  return handlers
}

// Located by visible heading, not by label: these Labels are not bound to their Inputs by
// `htmlFor`, so `getByLabelText` cannot see them.
function queryField(labelText: string): HTMLInputElement | null {
  const label = Array.from(document.querySelectorAll('label')).find(
    (node) => node.textContent?.trim() === labelText
  )
  return label?.parentElement?.querySelector('input') ?? null
}

function getField(labelText: string): HTMLInputElement {
  const input = queryField(labelText)
  if (!input) {
    throw new Error(`no input under the "${labelText}" field`)
  }
  return input
}

describe('OpenInMenuRow: adding a browser-editor entry', () => {
  it('offers a Web URL field on a custom app', () => {
    renderRow({ id: 'custom-1', label: 'My editor', command: '' })

    expect(queryField('Web URL')).not.toBeNull()
  })

  it('reports the typed template to its owner so it can be saved', () => {
    const { onChange } = renderRow({ id: 'custom-1', label: 'My editor', command: '' })

    fireEvent.change(getField('Web URL'), { target: { value: TEMPLATE } })

    expect(onChange).toHaveBeenCalledWith({ url: TEMPLATE })
  })

  // focusOut, not blur — React routes onBlur through the bubbling focusout event, so a
  // non-bubbling `blur` never reaches the handler.
  it('commits the entry when the field is left', () => {
    const { onCommit } = renderRow({ id: 'custom-1', label: 'My editor', command: '' })

    fireEvent.focusOut(getField('Web URL'))

    expect(onCommit).toHaveBeenCalled()
  })

  it('commits the entry on Enter', () => {
    const { onCommit } = renderRow({ id: 'custom-1', label: 'My editor', command: '' })

    fireEvent.keyDown(getField('Web URL'), { key: 'Enter' })

    expect(onCommit).toHaveBeenCalled()
  })
})

describe('OpenInMenuRow: an entry seeded by the runtime', () => {
  // A seeded browser-editor row has no command by construction.
  const seeded: OpenInApplication = {
    id: 'code-server',
    label: 'code-server',
    command: '',
    url: TEMPLATE
  }

  it('shows what the entry opens without expanding it', () => {
    renderRow(seeded, false)

    expect(screen.getByText(TEMPLATE)).toBeTruthy()
    expect(screen.queryByText(/Set a command or a URL/i)).toBeNull()
  })

  it('shows the seeded template in the editor', () => {
    renderRow(seeded)

    expect(getField('Web URL').value).toBe(TEMPLATE)
  })

  it('lets the user clear a seeded template', () => {
    const { onChange } = renderRow(seeded)

    fireEvent.change(getField('Web URL'), { target: { value: '' } })

    expect(onChange).toHaveBeenCalledWith({ url: '' })
  })
})

// The `!isPreset` gate decides whether the Web URL field renders at all.
describe('OpenInMenuRow: the preset gate', () => {
  it('gives the full editor to a preset-id row that carries a URL', () => {
    renderRow({ id: 'vscode', label: 'My VS Code', command: 'code', url: TEMPLATE })

    expect(queryField('Web URL')).not.toBeNull()
    expect(getField('Web URL').value).toBe(TEMPLATE)
    expect(queryField('Menu label')).not.toBeNull()
  })

  // The gate's second recogniser is the row's label, not just its id.
  it('gives the full editor to a preset-labelled row that carries a URL', () => {
    renderRow({ id: 'custom-9', label: 'VS Code', command: 'code', url: TEMPLATE })

    expect(queryField('Web URL')).not.toBeNull()
    expect(getField('Web URL').value).toBe(TEMPLATE)
  })

  // The desktop pane this was extracted from shows only the command for a preset row; opening
  // the extra fields would regress the desktop UI.
  it('keeps a plain preset row collapsed to its command', () => {
    renderRow({ id: 'vscode', label: 'VS Code', command: 'code' })

    expect(queryField('Terminal command')).not.toBeNull()
    expect(queryField('Web URL')).toBeNull()
    expect(queryField('Menu label')).toBeNull()
  })
})

// open-in-url-template.test.ts owns the http/https rule itself; this is only the row's half —
// enforced where the user typed, not silently at click time in some menu.
describe('OpenInMenuRow: an unusable template', () => {
  it('marks a non-web template invalid and says why', () => {
    renderRow({ id: 'custom-1', label: 'My editor', command: '', url: 'javascript:alert(1)' })

    expect(getField('Web URL').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText(/http:\/\/ or https:\/\//i)).toBeTruthy()
  })

  it('leaves a usable template unmarked', () => {
    renderRow({ id: 'custom-1', label: 'My editor', command: '', url: TEMPLATE })

    expect(getField('Web URL').getAttribute('aria-invalid')).toBe('false')
    expect(screen.queryByText(/http:\/\/ or https:\/\//i)).toBeNull()
  })
})
