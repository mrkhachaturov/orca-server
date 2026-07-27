import { describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../orca-runtime'
import { RpcDispatcher } from '../dispatcher'
import { MOBILE_PAIRING_METHODS } from './mobile-pairing'

type StreamingOptions = NonNullable<Parameters<RpcDispatcher['dispatchStreaming']>[2]>

function dispatchMobilePairing(
  method: string,
  params: unknown,
  trustedMobilePairing: StreamingOptions['trustedMobilePairing']
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const dispatcher = new RpcDispatcher({
      runtime: new OrcaRuntimeService(),
      methods: MOBILE_PAIRING_METHODS
    })
    void dispatcher.dispatchStreaming(
      { id: 'request-1', authToken: '', method, params },
      (response) => resolve(JSON.parse(response) as Record<string, unknown>),
      { trustedMobilePairing }
    )
  })
}

function trustedContext(): NonNullable<StreamingOptions['trustedMobilePairing']> {
  return {
    createOffer: vi.fn().mockResolvedValue({
      available: true,
      pairingUrl: 'orca://pair?code=abc',
      endpoint: 'wss://example.test/?token=x',
      deviceId: 'device-1',
      connectionMode: 'local-only'
    }),
    listDevices: vi.fn().mockReturnValue({ devices: [] }),
    revokeDevice: vi.fn().mockResolvedValue({ revoked: true }),
    createRuntimeGrant: vi.fn().mockReturnValue({
      available: true,
      pairingUrl: 'orca://pair?code=runtime',
      webClientUrl: 'https://example.test/web-index.html#pairing=x',
      endpoint: 'wss://example.test/?token=x',
      deviceId: 'runtime-1'
    }),
    listRuntimeGrants: vi.fn().mockReturnValue({ grants: [] }),
    revokeRuntimeGrant: vi.fn().mockReturnValue({ revoked: true })
  }
}

describe('mobile pairing RPC methods', () => {
  // Why: the context is the authorization gate — the transport injects it only
  // for runtime-scope connections. Without it every method must fail closed,
  // so a mobile-scope (or unix-socket) caller can never mint device
  // credentials even if the transport allowlist regressed.
  it.each([
    ['mobile.createPairingOffer', {}],
    ['mobile.listDevices', {}],
    ['mobile.revokeDevice', { deviceId: 'device-1' }],
    ['mobile.getRuntimePairingUrl', {}],
    ['mobile.listRuntimeAccessGrants', {}],
    ['mobile.revokeRuntimeAccess', { deviceId: 'device-1' }]
  ])('fails closed without a trusted pairing context: %s', async (method, params) => {
    await expect(dispatchMobilePairing(method, params, undefined)).resolves.toMatchObject({
      ok: false
    })
  })

  it('mints through the server-configured address only (no caller address input)', async () => {
    const ctx = trustedContext()
    await expect(
      dispatchMobilePairing('mobile.createPairingOffer', { rotate: true }, ctx)
    ).resolves.toMatchObject({
      ok: true,
      result: { available: true, deviceId: 'device-1', connectionMode: 'local-only' }
    })
    expect(ctx.createOffer).toHaveBeenCalledWith({ rotate: true })
  })

  it('rejects caller-selected advertised addresses', async () => {
    const ctx = trustedContext()
    await expect(
      dispatchMobilePairing('mobile.createPairingOffer', { address: 'wss://evil.test' }, ctx)
    ).resolves.toMatchObject({ ok: false })
    expect(ctx.createOffer).not.toHaveBeenCalled()
  })

  it('mints runtime grants through the context; caller cannot pick the address', async () => {
    const ctx = trustedContext()
    await expect(
      dispatchMobilePairing('mobile.getRuntimePairingUrl', { rotate: true }, ctx)
    ).resolves.toMatchObject({
      ok: true,
      result: { available: true, deviceId: 'runtime-1' }
    })
    expect(ctx.createRuntimeGrant).toHaveBeenCalledWith({ rotate: true })

    await expect(
      dispatchMobilePairing('mobile.getRuntimePairingUrl', { address: 'wss://evil.test' }, ctx)
    ).resolves.toMatchObject({ ok: false })

    await expect(
      dispatchMobilePairing('mobile.listRuntimeAccessGrants', {}, ctx)
    ).resolves.toMatchObject({ ok: true, result: { grants: [] } })
    await expect(
      dispatchMobilePairing('mobile.revokeRuntimeAccess', { deviceId: 'runtime-1' }, ctx)
    ).resolves.toMatchObject({ ok: true, result: { revoked: true } })
    expect(ctx.revokeRuntimeGrant).toHaveBeenCalledWith('runtime-1')
  })

  it('lists and revokes devices through the context', async () => {
    const ctx = trustedContext()
    await expect(dispatchMobilePairing('mobile.listDevices', {}, ctx)).resolves.toMatchObject({
      ok: true,
      result: { devices: [] }
    })
    await expect(
      dispatchMobilePairing('mobile.revokeDevice', { deviceId: 'device-1' }, ctx)
    ).resolves.toMatchObject({ ok: true, result: { revoked: true } })
    expect(ctx.revokeDevice).toHaveBeenCalledWith('device-1')
  })
})
