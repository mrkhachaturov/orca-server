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
 * True when a normalized row is safe to hand a client: it opens a URL and runs nothing.
 *
 * This is the ONLY rule seeding adds on top of the store's own. `command` is a shell command a
 * DESKTOP client executes, and seeding travels runtime → client, so honouring one would let
 * whoever writes the runtime's store hand a client something to run.
 */
function isSeedableOpenInApplication(entry: OpenInApplication): boolean {
  return entry.command === '' && Boolean(entry.url)
}

/**
 * Settings a runtime hands a web client as its STARTING values — defaults, not policy.
 *
 * Why: the web client keeps settings in localStorage (`orca.web.settings.v1`), so a headlessly
 * provisioned workspace has no way to say what its Orca should look like or which features are
 * on — every browser that opens the tile starts at stock upstream defaults, and somebody clicks
 * the same toggles again after every workspace create.
 *
 * These keys are read from the runtime store (`orca-data.json` on the serve host) exactly once
 * per browser: on the first visit, when localStorage holds no settings yet. From then on the
 * browser's own copy wins and the user's choices stick. Nothing here is re-imposed on later
 * loads, so "the workspace decided" never fights "the user decided".
 *
 * The boundary is deliberate:
 *  - LOOK and CAPABILITY seed from the runtime — a workspace can declare its theme and its
 *    enabled feature set, and every fresh client starts there.
 *  - SIZE and ERGONOMICS are absent on purpose. Zoom, window bounds and font sizes belong to
 *    the device: the same runtime gets driven from a laptop, an external monitor and a phone,
 *    and each wants its own answer.
 *  - CREDENTIALS never appear here. `codexManagedAccounts`, `claudeManagedAccounts` and
 *    `opencodeSessionCookie` live in the same GlobalSettings object; listing one would hand it
 *    to every client that opens the tile.
 */
export const RUNTIME_SEEDED_SETTING_SCHEMA = {
  // ── Appearance — what this workspace's Orca looks like out of the box ──────
  theme: z.enum(['system', 'dark', 'light']),
  appIcon: z.unknown().transform(normalizeAppIconId),
  appFontFamily: z.string(),
  uiLanguage: z.unknown().transform(normalizeUiLanguage),
  // Why these route through the shared normalizers rather than z.enum/z.string/z.number: those
  // three functions ARE this app's rules for these fields — a hex-format check and a 0…0.35 clamp
  // the settings UI can never exceed. Restating them loosely let a hand-edited store seed
  // `'not-a-color'` and `999` into every fresh browser, values the app itself cannot produce.
  // Same `z.unknown().transform(...)` shape as appIcon and uiLanguage above.
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
  // Why the shape authority is `normalizeOpenInApplications` and not a zod object written here:
  // that normalizer is the function that WRITES these rows in the first place — the store
  // normalizes on load (`main/persistence.ts`) and `getClientSettings` seeds straight from the
  // store. A schema that restates the shape can disagree with the producer, and did: it demanded
  // that `command` be absent, while the normalizer always emits it (as `''` for a URL row), so
  // every correctly-seeded workspace silently got no Open in entries at all. Reusing the producer
  // makes that disagreement unrepresentable.
  //
  // Three properties come free from doing it this way, none of which need restating:
  //  - the entry cap and id dedupe apply to seeds, which a raw schema skipped entirely;
  //  - the normalizer builds each row explicitly, so it is an allowlist by construction — no
  //    unknown field can cross, however new the runtime that sent it;
  //  - an unrecognised key costs that key rather than its row, which is the degradation this
  //    module's docstring promises for a newer runtime talking to an older client.
  openInApplications: z
    .array(z.unknown())
    .transform((rows) => ({
      requested: rows.length,
      entries: normalizeOpenInApplications(rows).filter(isSeedableOpenInApplication)
    }))
    // Why a wholly unusable list fails instead of seeding []: "every row was rejected" is a
    // broken seed, and the honest degrade for a broken seed is the key keeping its stock default
    // — not the client silently losing its Open in menu.
    .refine(({ requested, entries }) => requested === 0 || entries.length > 0)
    .transform(({ entries }) => entries)
} satisfies Partial<Record<keyof GlobalSettings, z.ZodTypeAny>>

export type RuntimeSeededSettingKey = keyof typeof RUNTIME_SEEDED_SETTING_SCHEMA

export const RUNTIME_SEEDED_SETTING_KEYS = Object.keys(
  RUNTIME_SEEDED_SETTING_SCHEMA
) as RuntimeSeededSettingKey[]

/**
 * Copy the seedable keys out of a settings payload, dropping any value that fails its schema.
 * A newer runtime talking to an older client (or a hand-edited store) then degrades to "that
 * key keeps its stock default" instead of poisoning the browser's settings blob.
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
