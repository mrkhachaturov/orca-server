import { callRuntimeRpc } from './runtime-rpc-client'

// Why: the web tile's picker is the in-app host-fs browser, so the chosen directory
// is authorised on the server the same way the desktop native picker authorises it
// locally — over the runtime, not over an AppApi key the desktop would never call.
// Mirrors browseRuntimeServerDirectory, the RPC that listed the directory.
export async function grantFloatingWorkspaceDirectoryOnRuntime(
  environmentId: string,
  path: string
): Promise<void> {
  await callRuntimeRpc<{ ok: boolean }>(
    { kind: 'environment', environmentId },
    'floatingWorkspace.grantDirectory',
    { path },
    { timeoutMs: 15_000 }
  )
}
