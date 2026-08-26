/** One source of the pairing QR's layout, because two produce it: the desktop main process
 *  encodes with the node `qrcode` build, the web client with the browser one, and the pane sizes
 *  its <img> from the number they report. A size derived from anything but the module count
 *  resamples the code — the reason `qrSize` is on the wire at all. */
export const MOBILE_PAIRING_QR_QUIET_ZONE_MODULES = 4
export const MOBILE_PAIRING_QR_MODULE_PITCH_PX = 2

/** What either encoder returns. Shared so the two cannot drift into reporting the same failure
 *  differently — the pane branches on `ok` alone. */
export type MobilePairingQrResult =
  | { ok: true; qrDataUrl: string; qrSize: number }
  | { ok: false; reason: 'encoding_failed' }

/** `moduleCount` is `QRCode.create(...).modules.size`, the code's width in modules. */
export function mobilePairingQrSize(moduleCount: number): number {
  return (
    (moduleCount + MOBILE_PAIRING_QR_QUIET_ZONE_MODULES * 2) * MOBILE_PAIRING_QR_MODULE_PITCH_PX
  )
}
