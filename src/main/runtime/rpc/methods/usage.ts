import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'
import { RUNTIME_USAGE_PROVIDERS } from '../../../../shared/runtime-usage-providers'

// Why: the web client has no ipcRenderer, so `window.api.<provider>Usage.*` fell
// through to the preload fallback proxy and every call resolved to undefined. The
// tile's Stats & Usage pane therefore showed "Not scanned yet" forever and its
// enable buttons did nothing — upstream's own #10073 guarded the resulting
// TypeError instead of closing the gap, which turned a missing bridge into a
// silent no-op. Nothing else is missing: the agent logs, the scanners and the
// stores all live on this host and already run under `orca serve` (the same
// startup block that feeds the tile's live "Agents spawned" counters).
//
// These mirror the `<provider>Usage:` IPC handlers 1:1 so the renderer contract is
// untouched, with the provider as a parameter rather than three copies of the same
// eight methods — a fourth token-analytics provider becomes one registry entry in
// main/index.ts plus one name in RUNTIME_USAGE_PROVIDERS. Grok is deliberately not
// here: it is subscription rate-limit data behind rateLimits.*/grokAccounts.*,
// which the web preload already implements.
//
// setEnabled MUTATES the host (it flips scanning on and rewrites the store's scan
// state), and every read exposes local agent-log analytics, so all eight stay OUT
// of MOBILE_RPC_METHOD_ALLOWLIST. Runtime-scope clients (the trusted-proxy web
// tile) reach them the same way they reach cli.*/diagnostics.*.
const providerSchema = z.enum(RUNTIME_USAGE_PROVIDERS)
const scopeSchema = z.enum(['orca', 'all'])
const rangeSchema = z.enum(['7d', '30d', '90d', 'all'])
const breakdownKindSchema = z.enum(['model', 'project'])

const providerOnly = z.object({ provider: providerSchema }).strict()
const windowParams = z
  .object({ provider: providerSchema, scope: scopeSchema, range: rangeSchema })
  .strict()
const windowWithLimit = windowParams.extend({ limit: z.number().int().positive().optional() })

export const USAGE_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'usage.getScanState',
    params: providerOnly,
    handler: async (params, { runtime }) => runtime.getUsageStore(params.provider).getScanState()
  }),
  defineMethod({
    name: 'usage.setEnabled',
    params: providerOnly.extend({ enabled: z.boolean() }),
    handler: async (params, { runtime }) =>
      runtime.getUsageStore(params.provider).setEnabled(params.enabled)
  }),
  defineMethod({
    name: 'usage.refresh',
    params: providerOnly.extend({ force: z.boolean().optional() }),
    handler: async (params, { runtime }) =>
      runtime.getUsageStore(params.provider).refresh(params.force ?? false)
  }),
  defineMethod({
    name: 'usage.getSnapshot',
    params: windowWithLimit,
    handler: async (params, { runtime }) =>
      runtime.getUsageStore(params.provider).getSnapshot(params.scope, params.range, params.limit)
  }),
  defineMethod({
    name: 'usage.getSummary',
    params: windowParams,
    handler: async (params, { runtime }) =>
      runtime.getUsageStore(params.provider).getSummary(params.scope, params.range)
  }),
  defineMethod({
    name: 'usage.getDaily',
    params: windowParams,
    handler: async (params, { runtime }) =>
      runtime.getUsageStore(params.provider).getDaily(params.scope, params.range)
  }),
  defineMethod({
    name: 'usage.getBreakdown',
    params: windowParams.extend({ kind: breakdownKindSchema }),
    handler: async (params, { runtime }) =>
      runtime.getUsageStore(params.provider).getBreakdown(params.scope, params.range, params.kind)
  }),
  defineMethod({
    name: 'usage.getRecentSessions',
    params: windowWithLimit,
    handler: async (params, { runtime }) =>
      runtime
        .getUsageStore(params.provider)
        .getRecentSessions(params.scope, params.range, params.limit)
  })
]
