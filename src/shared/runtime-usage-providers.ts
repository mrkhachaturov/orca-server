// Leaf module, deliberately dependency-free.
//
// Why this is not in orca-runtime.ts: `rpc/methods/usage.ts` needs the VALUE (it feeds
// `z.enum(...)` at module scope), and every other file under `src/main/runtime/rpc/`
// imports from orca-runtime.ts with `import type`, which TypeScript erases. A value
// import was the series' only real runtime edge into that 33k-line module, and it closed
// a cycle — orca-runtime.ts -> ipc/ssh.ts -> ssh-relay-session -> ssh-remote-orca-cli ->
// rpc/dispatcher -> rpc/methods/index -> usage.ts -> back to orca-runtime.ts. Entering
// through orca-runtime.ts meant `z.enum` evaluated before line 2452 had run, throwing
// "Cannot convert undefined or null to object" at module load: 29 test files in
// src/main/runtime failed to collect and 411 tests never ran. `orca serve` survived only
// because main/index.ts happens to reach the cycle via ipc/ssh first.
//
// Keep this file free of imports. Anything that pulls a main-process module back in
// recreates the cycle.
//
// Grok is deliberately absent: it is subscription rate-limit data behind
// rateLimits.*/grokAccounts.*, which the web preload already implements.
export const RUNTIME_USAGE_PROVIDERS = ['claude', 'codex', 'openCode'] as const

export type RuntimeUsageProvider = (typeof RUNTIME_USAGE_PROVIDERS)[number]
