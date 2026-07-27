import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'

// Mirrors the desktop `app:getFloatingTerminalCwd` handler and the native picker's
// `grantFloatingWorkspaceDirectory` step (src/main/ipc/app.ts). Both mutate host state
// (external-path authorization, trust grants), so neither may join MOBILE_RPC_METHOD_ALLOWLIST.
const ResolveFloatingTerminalCwdParams = z.object({
  path: z.string().optional(),
  requireTrusted: z.boolean().optional()
})

const GrantFloatingWorkspaceDirectoryParams = z.object({
  path: z.string()
})

export const FLOATING_WORKSPACE_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'floatingWorkspace.resolveCwd',
    params: ResolveFloatingTerminalCwdParams,
    handler: async (params, { runtime }) => runtime.resolveFloatingTerminalCwd(params)
  }),
  defineMethod({
    name: 'floatingWorkspace.markdownDirectory',
    params: z.object({}),
    // The web preload stubs `app:getFloatingMarkdownDirectory` to '', which the floating
    // panel reads as "nowhere to put a note".
    handler: async (_params, { runtime }) => ({
      path: await runtime.ensureFloatingMarkdownDirectory()
    })
  }),
  defineMethod({
    name: 'floatingWorkspace.grantDirectory',
    params: GrantFloatingWorkspaceDirectoryParams,
    handler: async (params, { runtime }) => {
      await runtime.grantFloatingWorkspaceDirectory(params.path)
      return { ok: true }
    }
  })
]
