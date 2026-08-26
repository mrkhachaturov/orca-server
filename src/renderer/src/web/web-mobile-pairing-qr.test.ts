import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodeWebMobilePairingQr } from './web-mobile-pairing-qr'

const PAIRING_URL = 'orca://pair?token=abc&endpoint=wss://host.example:443'

/** The browser `qrcode` build paints into a real canvas. Stub exactly the surface it touches and
 *  record the bitmap it asks for, because that width is what `qrSize` has to agree with. */
function stubCanvas(): { renderedWidth: () => number | null } {
  let renderedWidth: number | null = null
  const context = {
    clearRect: () => {},
    createImageData: (width: number, height: number) => {
      renderedWidth = width
      return { data: new Uint8ClampedArray(width * height * 4), width, height }
    },
    putImageData: () => {}
  }
  vi.stubGlobal('document', {
    createElement: () => ({
      style: {},
      width: 0,
      height: 0,
      getContext: () => context,
      toDataURL: () => 'data:image/png;base64,stub'
    })
  })
  return { renderedWidth: () => renderedWidth }
}

describe('web mobile pairing QR', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports the size the pane must draw the code at', async () => {
    const canvas = stubCanvas()

    const result = await encodeWebMobilePairingQr(PAIRING_URL)

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    // The symptom: with no size on the wire the pane falls back to a fixed 192px box. That is not
    // the bitmap's own width, so the code is resampled and scans badly on a phone. `qrSize` is
    // only right if it is exactly the width the encoder painted.
    expect(result.qrSize).toBe(canvas.renderedWidth())
    expect(result.qrDataUrl).toBe('data:image/png;base64,stub')
  })

  it('names an encoding failure instead of throwing it at the caller', async () => {
    stubCanvas()

    // Beyond the largest QR version's capacity, so no code can be produced at all.
    const result = await encodeWebMobilePairingQr('x'.repeat(8000))

    // The offer's pairing URL is still valid and copyable; only its picture failed, so the
    // failure has to arrive as a value the pane can render around.
    expect(result).toEqual({ ok: false, reason: 'encoding_failed' })
  })
})
