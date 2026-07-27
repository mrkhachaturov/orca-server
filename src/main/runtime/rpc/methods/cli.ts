import { defineMethod, type RpcMethod } from '../core'
import {
  getCliInstallStatusWithShellPathHydration,
  installCliWithShellPathHydration,
  removeCliWithShellPathHydration
} from '../../../ipc/cli'

// Why: the web client has no local Orca CLI — its terminals run on THIS server,
// so the `orca-ide` command that agent-skill setup must resolve lives on the
// workspace host. These mirror the `cli:` IPC handlers (getInstallStatus /
// install / remove); WSL registration is a Windows-desktop concern and is
// intentionally not exposed on a headless Linux serve.
//
// install/remove MUTATE the host (symlink in ~/.local/bin), so all three stay
// OUT of MOBILE_RPC_METHOD_ALLOWLIST — a paired phone (mobile scope) must never
// register or remove commands on the workspace host. Runtime-scope clients (the
// trusted-proxy web tile) reach them the same way they reach terminal.*/files.*.
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
