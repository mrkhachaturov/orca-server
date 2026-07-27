import { z } from 'zod'
import { normalizeAppIconId } from './app-icon'
import {
  normalizeLeftSidebarAppearanceMode,
  normalizeLeftSidebarTintColor,
  normalizeLeftSidebarTintOpacity
} from './left-sidebar-appearance'
import { normalizeOpenInApplications } from './open-in-applications'
import { normalizeUiLanguage } from './ui-language'
import type { GlobalSettings, OpenInApplication } from './types'

/**
 * `command` is a shell command a DESKTOP client executes, and seeding travels runtime → client,
 * so honouring one would let whoever writes the runtime's store hand a client something to run.
 */
function isSeedableOpenInApplication(entry: OpenInApplication): boolean {
  return entry.command === '' && Boolean(entry.url)
}

/**
 * Settings a runtime hands a web client as its STARTING values — defaults, not policy. Read from
 * the runtime store once per browser, on the first visit when localStorage
 * (`orca.web.settings.v1`) is still empty; never re-imposed on a later load.
 *
 * Look and capability may seed. Per-device ergonomics (zoom, bounds, font sizes) must not — the
 * same runtime is driven from several screens. Credentials must not — they share the
 * GlobalSettings object, and listing one hands it to every client that opens the tile.
 */
export const RUNTIME_SEEDED_SETTING_SCHEMA = {
  // ── Appearance ────────────────────────────────────────────────────────────
  theme: z.enum(['system', 'dark', 'light']),
  appIcon: z.unknown().transform(normalizeAppIconId),
  appFontFamily: z.string(),
  uiLanguage: z.unknown().transform(normalizeUiLanguage),
  // Route through the shared normalizers, not z.string/z.number: those functions ARE the app's
  // rules for these fields, and restating them loosely let a hand-edited store seed
  // `'not-a-color'` and `999` — values the settings UI itself cannot produce.
  leftSidebarAppearanceMode: z.unknown().transform(normalizeLeftSidebarAppearanceMode),
  leftSidebarTintColor: z.unknown().transform(normalizeLeftSidebarTintColor),
  leftSidebarTintOpacity: z.unknown().transform(normalizeLeftSidebarTintOpacity),
  terminalThemeDark: z.string(),
  terminalThemeLight: z.string(),
  terminalUseSeparateLightTheme: z.boolean(),

  // ── Experimental — which features are on before anyone touches a toggle ────
  experimentalActivity: z.boolean(),
  experimentalAgentDashboardPopout: z.boolean(),
  experimentalAgentHibernation: z.boolean(),
  agentHibernationIdleMs: z.number(),
  experimentalEphemeralVms: z.boolean(),
  experimentalNativeChat: z.boolean(),
  openAgentTabsInChatByDefault: z.boolean(),
  experimentalPet: z.boolean(),
  experimentalTerminalAttention: z.boolean(),
  experimentalMobile: z.boolean(),
  mobileEmulatorEnabled: z.boolean(),

  // ── Open In entries — URL templates only, never commands ──────────────────
  // The shape authority is `normalizeOpenInApplications` because it is what WRITES these rows:
  // the store normalizes on load (`main/persistence.ts`) and `getClientSettings` seeds straight
  // from it. A zod object restating the shape can disagree with the producer, and did — it
  // demanded `command` be absent while the normalizer always emits it as `''` for a URL row.
  openInApplications: z
    .array(z.unknown())
    .transform((rows) => ({
      requested: rows.length,
      entries: normalizeOpenInApplications(rows).filter(isSeedableOpenInApplication)
    }))
    // A wholly rejected list is a broken seed: fail the key so it keeps its stock default rather
    // than seeding [] and losing the client its Open in menu.
    .refine(({ requested, entries }) => requested === 0 || entries.length > 0)
    .transform(({ entries }) => entries)
} satisfies Partial<Record<keyof GlobalSettings, z.ZodTypeAny>>

export type RuntimeSeededSettingKey = keyof typeof RUNTIME_SEEDED_SETTING_SCHEMA

export const RUNTIME_SEEDED_SETTING_KEYS = Object.keys(
  RUNTIME_SEEDED_SETTING_SCHEMA
) as RuntimeSeededSettingKey[]

/**
 * Dropping a failing value rather than throwing is the contract: a newer runtime talking to an
 * older client degrades to "that key keeps its stock default".
 */
export function pickRuntimeSeededSettings(source: unknown): Partial<GlobalSettings> {
  const picked: Record<string, unknown> = {}
  if (!source || typeof source !== 'object') {
    return picked as Partial<GlobalSettings>
  }
  for (const key of RUNTIME_SEEDED_SETTING_KEYS) {
    const value = (source as Record<string, unknown>)[key]
    if (value === undefined) {
      continue
    }
    const result = RUNTIME_SEEDED_SETTING_SCHEMA[key].safeParse(value)
    if (result.success) {
      picked[key] = result.data
    }
  }
  return picked as Partial<GlobalSettings>
}
