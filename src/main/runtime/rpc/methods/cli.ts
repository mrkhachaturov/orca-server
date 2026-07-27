import { defineMethod, type RpcMethod } from '../core'
import {
  getCliInstallStatusWithShellPathHydration,
  installCliWithShellPathHydration,
  removeCliWithShellPathHydration
} from '../../../ipc/cli'

// Mirrors the `cli:` IPC handlers; WSL registration is Windows-desktop only and stays off.
// install/remove mutate the host, so none of these may join MOBILE_RPC_METHOD_ALLOWLIST.
export const CLI_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'cli.getInstallStatus',
    params: null,
    handler: async () => getCliInstallStatusWithShellPathHydration()
  }),
  defineMethod({
    name: 'cli.install',
    params: null,
    handler: async () => installCliWithShellPathHydration()
  }),
  defineMethod({
    name: 'cli.remove',
    params: null,
    handler: async () => removeCliWithShellPathHydration()
  })
]
