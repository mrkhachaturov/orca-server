import type { DeviceEntry, DeviceRegistry } from './device-registry'
import type { RuntimeAccessGrant } from '../../shared/runtime-access-grants'

/**
 * The client-facing projection of the pairing primitives, split out of `ipc/mobile.ts`.
 *
 * Why: the runtime serves the same three lists to the web tile that `ipcMain` serves to
 * the desktop renderer, but `ipc/mobile.ts` imports `app`, `ipcMain` and `shell`, and
 * `runtime-rpc.ts` is a ratchet entry point whose baseline must stay empty. The registry
 * itself is upstream's; only the filters, the sort and the mapping live here.
 */

export type PairedMobileDevice = {
  deviceId: string
  name: string
  pairedAt: number
  lastSeenAt: number
}

/**
 * Why the `lastSeenAt > 0` filter: entries with 0 were minted for a QR and never scanned,
 * so listing them as paired is misleading.
 */
export function listPairedMobileDevices(registry: DeviceRegistry | null): {
  devices: PairedMobileDevice[]
} {
  return {
    devices: (registry?.listDevices() ?? [])
      .filter((device) => device.scope === 'mobile' && device.lastSeenAt > 0)
      .map((device) => ({
        deviceId: device.deviceId,
        name: device.name,
        pairedAt: device.pairedAt,
        lastSeenAt: device.lastSeenAt
      }))
  }
}

export function toRuntimeAccessGrant(device: DeviceEntry): RuntimeAccessGrant {
  return {
    deviceId: device.deviceId,
    name: device.name,
    createdAt: device.pairedAt,
    lastSeenAt: device.lastSeenAt > 0 ? device.lastSeenAt : null
  }
}

/**
 * Why no `lastSeenAt` filter here, unlike mobile: a generated runtime link is a bearer
 * credential before its client ever connects, so a pending grant must stay revocable.
 */
export function listRuntimeAccessGrants(registry: DeviceRegistry | null): {
  grants: RuntimeAccessGrant[]
} {
  return {
    grants: (registry?.listDevices() ?? [])
      .filter((device) => device.scope === 'runtime')
      .sort((a, b) => b.pairedAt - a.pairedAt)
      .map(toRuntimeAccessGrant)
  }
}

/**
 * Device-class names. Without one a device mints as the `CLI <date>` default, so a phone or
 * a browser session masquerades as a command-line client in the shared-access list.
 */
export function mobilePairingDeviceName(): string {
  return `Mobile ${new Date().toLocaleDateString()}`
}

export function runtimeGrantDeviceName(): string {
  return `Runtime ${new Date().toLocaleDateString()}`
}

export function webSessionDeviceName(): string {
  return `Web session ${new Date().toLocaleDateString()}`
}
