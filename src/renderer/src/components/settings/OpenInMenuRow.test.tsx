// @vitest-environment happy-dom
//
// Destination: lib/orca/src/renderer/src/components/settings/OpenInMenuRow.test.tsx
// Carried by:  patches/open-in-browser-editors.diff
//
// Every case here is written from the patch header's "To test" sentence — "add a Web URL entry in
// Settings > Open In Apps and open a worktree with it; then seed the same entry from the runtime
// and confirm a fresh browser gets it" — and not from what the row currently does. This is the one
// settings surface where that sentence's first half happens: if the row does not offer a Web URL
// field, there is no way to create the entry at all, and if it hides one that arrived from the
// runtime, the seeded entry is invisible to the user it was seeded for.

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { OpenInMenuRow, type OpenInMenuRowProps } from './OpenInMenuRow'
import type { OpenInApplication } from '../../../../shared/types'

afterEach(cleanup)

const TEMPLATE = 'https://code-server--proj--me.example.com/?folder={path}'

// Why the mocks are typed from the component's own props rather than left as bare `vi.fn()`:
// an untyped mock is `Mock<Procedure>`, which satisfies nothing, so a prop renamed or given a new
// signature upstream would still compile here and the case would quietly stop testing the row.
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

// Why the fields are located by their visible heading rather than by role or placeholder: these
// Labels are not bound to their Inputs by `htmlFor`, so `getByLabelText` cannot see them, and the
// heading is what the user reads when deciding which box to type into.
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
  // Why this is the first case: a worktree reached through a browser has no local command to run,
  // so a URL is the only "Open in" target it can be given. Without a field to type one into, the
  // header's "add a Web URL entry in Settings > Open In Apps" is not a thing a user can do.
  it('offers a Web URL field on a custom app', () => {
    renderRow({ id: 'custom-1', label: 'My editor', command: '' })

    expect(queryField('Web URL')).not.toBeNull()
  })

  it('reports the typed template to its owner so it can be saved', () => {
    const { onChange } = renderRow({ id: 'custom-1', label: 'My editor', command: '' })

    fireEvent.change(getField('Web URL'), { target: { value: TEMPLATE } })

    expect(onChange).toHaveBeenCalledWith({ url: TEMPLATE })
  })

  // Why both, in separate renders: the row's owner persists on commit, and a user finishes a field
  // either by tabbing out of it or by pressing Enter. A field that only commits one of those ways
  // loses the entry silently. (focusOut, not blur — React routes onBlur through the bubbling
  // focusout event, so a non-bubbling `blur` never reaches the handler.)
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
  // A seeded browser-editor row has no command by construction — the path goes to whoever serves
  // the URL. The header's second half is "confirm a fresh browser gets it", and this row is where
  // the user confirms it.
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

  // Being shown a value you cannot remove is worse than not being shown it: the URL is what
  // decides where the entry goes, so an entry a host seeded must be one the user can take back.
  it('lets the user clear a seeded template', () => {
    const { onChange } = renderRow(seeded)

    fireEvent.change(getField('Web URL'), { target: { value: '' } })

    expect(onChange).toHaveBeenCalledWith({ url: '' })
  })
})

// The `!isPreset` gate decides whether the Web URL field renders at all. A row is only a "preset"
// — the collapsed, command-only editor — when it has nothing else that needs showing. A row that
// carries a URL always has something else that needs showing, because the URL, not the command,
// is what the entry will open.
describe('OpenInMenuRow: the preset gate', () => {
  it('gives the full editor to a preset-id row that carries a URL', () => {
    renderRow({ id: 'vscode', label: 'My VS Code', command: 'code', url: TEMPLATE })

    expect(queryField('Web URL')).not.toBeNull()
    expect(getField('Web URL').value).toBe(TEMPLATE)
    expect(queryField('Menu label')).not.toBeNull()
  })

  // The gate has a second way to recognise a preset — the row's label. A URL row that happens to
  // be named after a known editor must not fall through it either.
  it('gives the full editor to a preset-labelled row that carries a URL', () => {
    renderRow({ id: 'custom-9', label: 'VS Code', command: 'code', url: TEMPLATE })

    expect(queryField('Web URL')).not.toBeNull()
    expect(getField('Web URL').value).toBe(TEMPLATE)
  })

  // The other side of the gate, and the reason it is a gate rather than "always show everything":
  // a row added from the preset menu is fully described by its command, and the desktop pane it
  // was extracted from showed only that. Opening the extra fields on it would be a regression in
  // the desktop UI this patch is not entitled to make.
  it('keeps a plain preset row collapsed to its command', () => {
    renderRow({ id: 'vscode', label: 'VS Code', command: 'code' })

    expect(queryField('Terminal command')).not.toBeNull()
    expect(queryField('Web URL')).toBeNull()
    expect(queryField('Menu label')).toBeNull()
  })
})

// Partial overlap with open-in-url-template.test.ts, which owns the http/https rule itself. What
// is asserted here is only this row's half of it: the rule is enforced where the user typed, at
// the moment they typed it, rather than silently at click time in a menu somewhere else.
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
