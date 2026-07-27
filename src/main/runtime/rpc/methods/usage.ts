import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'
import { RUNTIME_USAGE_PROVIDERS } from '../../../../shared/runtime-usage-providers'

// Mirrors the `<provider>Usage:` IPC handlers 1:1, with the provider as a parameter. Without
// them `window.api.<provider>Usage.*` falls through the web preload's fallback proxy and
// resolves to undefined, which the pane renders as "Not scanned yet" forever.
// setEnabled mutates the host and every read exposes local agent-log analytics, so none of
// these may join MOBILE_RPC_METHOD_ALLOWLIST.
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
