import QRCodeBrowser from 'qrcode/lib/browser'
import {
  MOBILE_PAIRING_QR_MODULE_PITCH_PX,
  MOBILE_PAIRING_QR_QUIET_ZONE_MODULES,
  mobilePairingQrSize,
  type MobilePairingQrResult
} from '../../../shared/mobile-pairing-qr-geometry'

/** `qrcode/lib/browser` ships no types, so name the two entry points this uses rather than
 *  letting the whole module fall to `any` and take the call sites with it. */
type BrowserQrCode = {
  create: (text: string, options: { errorCorrectionLevel: 'M' }) => { modules: { size: number } }
  toDataURL: (
    text: string,
    options: { errorCorrectionLevel: 'M'; margin: number; scale: number }
  ) => Promise<string>
}

const qrcode = QRCodeBrowser as BrowserQrCode

/** The browser half of `encodeMobilePairingQr`: same package, same geometry, same result shape,
 *  because the pane renders whichever one produced the offer it is showing. */
export async function encodeWebMobilePairingQr(
  pairingUrl: string
): Promise<MobilePairingQrResult> {
  try {
    const qrCode = qrcode.create(pairingUrl, { errorCorrectionLevel: 'M' })
    const qrSize = mobilePairingQrSize(qrCode.modules.size)
    const qrDataUrl = await qrcode.toDataURL(pairingUrl, {
      errorCorrectionLevel: 'M',
      margin: MOBILE_PAIRING_QR_QUIET_ZONE_MODULES,
      scale: MOBILE_PAIRING_QR_MODULE_PITCH_PX
    })
    return { ok: true, qrDataUrl, qrSize }
  } catch {
    return { ok: false, reason: 'encoding_failed' }
  }
}
