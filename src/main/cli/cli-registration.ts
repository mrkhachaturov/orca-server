import type { CliInstallStatus } from '../../shared/cli-install-types'
import { hydrateShellPath, mergePathSegments } from '../startup/hydrate-shell-path'
import { CliInstaller } from './cli-installer'

// Split out of `ipc/cli.ts` so the runtime's `cli.*` RPC reaches CLI registration
// without dragging `ipcMain` into its module graph. The web client's terminals run
// on THIS server, so the card must probe and register the server's `orca-ide`.

async function hydrateLocalShellPathForCli(force = false): Promise<void> {
  if (process.platform === 'win32') {
    return
  }
  // Why: CLI registration must match `which orca` in the user's terminal, not
  // the sparse PATH a GUI-launched Electron process inherited from launchd.
  const hydration = await hydrateShellPath(force ? { force: true } : undefined)
  if (hydration.ok) {
    mergePathSegments(hydration.segments)
  }
}

export async function getCliInstallStatusWithShellPathHydration(): Promise<CliInstallStatus> {
  await hydrateLocalShellPathForCli()
  return new CliInstaller().getStatus()
}

export async function installCliWithShellPathHydration(): Promise<CliInstallStatus> {
  await hydrateLocalShellPathForCli(true)
  return new CliInstaller().install()
}

export async function removeCliWithShellPathHydration(): Promise<CliInstallStatus> {
  await hydrateLocalShellPathForCli()
  return new CliInstaller().remove()
}
