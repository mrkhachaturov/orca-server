// Keep this file import-free. `rpc/methods/usage.ts` needs this as a VALUE at module scope,
// and reaching it through orca-runtime.ts closes an import cycle via ipc/ssh -> rpc/dispatcher
// that evaluates `z.enum` before orca-runtime.ts has initialised — 411 tests failed to collect.
// Grok is absent by design: it is rate-limit data the web preload already implements.
export const RUNTIME_USAGE_PROVIDERS = ['claude', 'codex', 'openCode'] as const

export type RuntimeUsageProvider = (typeof RUNTIME_USAGE_PROVIDERS)[number]
