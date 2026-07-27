import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'

// Why: the web client has no native OS file dialog, and its floating terminals
// run on THIS server — so the terminal's start directory must be resolved, and
// a picker-approved directory trusted/authorized, on the workspace host. These
// mirror the desktop `app:getFloatingTerminalCwd` handler and the native
// picker's `grantFloatingWorkspaceDirectory` step (src/main/ipc/app.ts).
//
// Both TOUCH host state — resolveCwd authorizes an external path and may create
// the default workspace dir; grantDirectory writes a trust grant into settings —
// so, exactly like cli.*, they stay OUT of MOBILE_RPC_METHOD_ALLOWLIST: a paired
// phone (mobile scope) must never resolve or trust directories on the host. Only
// the full runtime-scope web client (the trusted-proxy tile) reaches them.
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
    // Why: mirrors the desktop `app:getFloatingMarkdownDirectory` handler 1:1. The web
    // client stubs that call to '' — a falsy directory the floating panel reads as "no
    // place to put a note", so New/Open Markdown Note silently did nothing.
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
