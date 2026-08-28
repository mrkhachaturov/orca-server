// What this catches and what it does not.
//
// It reads `Settings.tsx` as TEXT and pairs the ids it finds with the JSX conditions wrapping them,
// then fails on any id the web nav lists that the page does not render ungated. That is the class
// v4.190.1 shipped: six nav rows whose panes were still behind `showDesktopOnlySettings`.
//
// Two limits, recorded so the next session inherits them rather than rediscovering them:
//
//  1. It reasons about gate conditions by NAME, not by evaluating them. `WEB_SAFE_GATES` below is
//     how a new condition gets declared safe; until it is listed, a section behind it reads as
//     hidden. So the test cannot be fooled by a rename, but it also cannot tell a condition that is
//     true in a browser from one that is not — a human decides that and writes it down.
//  2. It says nothing about what a pane DRAWS. A section that renders and is empty, or renders
//     controls that all resolve to stubs, passes here. Only opening the pane answers that; the
//     per-section reports under docs/audit/settings/ are the standing record of which ones do.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildSettingsNavigationMetadata } from '../../hooks/useSettingsNavigationMetadata'
import type { Repo } from '../../../../shared/repo-types'

const repo: Repo = {
  id: 'repo-1',
  path: '/repo',
  displayName: 'Repo',
  badgeColor: '#000',
  addedAt: 0
}

const SECTION_ID_BY_COMPONENT: Record<string, string> = {
  PluginsSettingsSection: 'plugins'
}

type GatedSection = { id: string; gates: string[] }

function readSettingsPageSource(): string {
  return readFileSync(resolve(import.meta.dirname, 'Settings.tsx'), 'utf8')
}

function collectGatedSections(source: string): GatedSection[] {
  const openGates: { indent: number; condition: string }[] = []
  const sections: GatedSection[] = []

  for (const line of source.split('\n')) {
    const indent = line.length - line.trimStart().length

    const opened = /^\s*\{(.+?)\s*\?\s*\(\s*$/.exec(line)
    if (opened) {
      openGates.push({ indent, condition: opened[1] })
      continue
    }

    if (/^\s*\)\s*:\s*(null|\()/.test(line)) {
      while (openGates.length > 0 && openGates[openGates.length - 1].indent >= indent) {
        openGates.pop()
      }
      continue
    }

    const inlineId = /^\s*id="([a-z0-9-]+)"\s*$/.exec(line)
    const componentName = /^\s*<([A-Z][A-Za-z]*)\s*$/.exec(line)
    const id = inlineId?.[1] ?? (componentName ? SECTION_ID_BY_COMPONENT[componentName[1]] : undefined)
    if (id !== undefined) {
      sections.push({ id, gates: openGates.map((gate) => gate.condition) })
    }
  }

  return sections
}

/**
 * Gate conditions that are true for a web client, each because the pane behind it works in the
 * tile. Anything not here counts as hiding the section, so a pane wrapped in a NEW condition fails
 * this test until someone states why that condition is web-safe.
 */
const WEB_SAFE_GATES = new Set<string>([])

function sectionIdsRenderedForWebClient(source: string): Set<string> {
  return new Set(
    collectGatedSections(source)
      .filter((section) => section.gates.every((gate) => WEB_SAFE_GATES.has(gate)))
      .map((section) => section.id)
  )
}

function webNavigationIds(isMac: boolean): string[] {
  return buildSettingsNavigationMetadata({
    isMac,
    isWindows: false,
    isWebClient: true,
    isDev: false,
    isLinearConnected: false,
    repos: [repo]
  }).map((section) => section.id)
}

describe('settings navigation and the Settings page agree for a web client', () => {
  it('finds the gated sections it is meant to read', () => {
    const gated = collectGatedSections(readSettingsPageSource())

    expect(gated.map((section) => section.id)).toContain('plugins')
    expect(gated.find((section) => section.id === 'ssh')?.gates).toEqual(['showDesktopOnlySettings'])
    expect(gated.find((section) => section.id === 'general')?.gates).toEqual([])
  })

  it('opens a pane for every section the web nav lists', () => {
    const rendered = sectionIdsRenderedForWebClient(readSettingsPageSource())
    const listedWithoutAPane = webNavigationIds(false).filter(
      (id) => !id.startsWith('repo-') && !rendered.has(id)
    )

    expect(listedWithoutAPane).toEqual([])
  })

  it('opens a pane for every section the web nav lists in a Mac browser', () => {
    const rendered = sectionIdsRenderedForWebClient(readSettingsPageSource())
    const listedWithoutAPane = webNavigationIds(true).filter(
      (id) => !id.startsWith('repo-') && !rendered.has(id)
    )

    expect(listedWithoutAPane).toEqual([])
  })
})
