import type { ClaudeUsageStore } from '../claude-usage/store'
import type { CodexUsageStore } from '../codex-usage/store'
import type { OpenCodeUsageStore } from '../opencode-usage/store'

/**
 * The token-analytics store registry, split out of the `<provider>Usage:` IPC handlers.
 *
 * Why: the runtime serves `usage.*` to the web tile, but the three stores are
 * constructed in `main/index.ts` and reachable on the desktop only through
 * `ipcMain`. Importing them by value would drag `electron` into the runtime's module
 * graph, which `config/runtime-electron-baseline.txt` requires to stay empty — so the
 * imports here are type-only and erased.
 *
 * A registry rather than a runtime constructor dependency, for the same reason as
 * `ssh/ssh-target-registry.ts`: each store is a process singleton owning a cache file
 * and a flush on quit, so a second instance constructed runtime-side would be a defect.
 *
 * Grok is absent by design: it is rate-limit data the web preload already implements.
 */

export const RUNTIME_USAGE_PROVIDERS = ['claude', 'codex', 'openCode'] as const

export type RuntimeUsageProvider = (typeof RUNTIME_USAGE_PROVIDERS)[number]

export type RuntimeUsageStore = ClaudeUsageStore | CodexUsageStore | OpenCodeUsageStore

type UsageStoreRegistry = {
  [K in RuntimeUsageProvider]: RuntimeUsageStore | null
}

const registered: UsageStoreRegistry = { claude: null, codex: null, openCode: null }

export function setUsageProviderStores(stores: {
  claude: RuntimeUsageStore | null
  codex: RuntimeUsageStore | null
  openCode: RuntimeUsageStore | null
}): void {
  registered.claude = stores.claude
  registered.codex = stores.codex
  registered.openCode = stores.openCode
}

/**
 * Why this throws rather than answering undefined: the preload fallback's silent
 * undefined is what made Stats & Usage look broken instead of unavailable, so the
 * bridge replacing it must never reproduce that.
 */
export function getRegisteredUsageStore(provider: RuntimeUsageProvider): RuntimeUsageStore {
  const store = registered[provider]
  if (!store) {
    throw new Error(`usage_provider_unavailable:${provider}`)
  }
  return store
}
