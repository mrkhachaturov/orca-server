import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { createStaticWebClientHandler } from './static-web-client-handler'

const PAIRING_URL = 'orca://pair?code=test-offer'

function requestFrom(
  url: string,
  remoteAddress: string | undefined,
  method = 'GET'
): IncomingMessage {
  return { method, url, headers: {}, socket: { remoteAddress } } as unknown as IncomingMessage
}

function responseSpy(): {
  response: ServerResponse
  headers: Map<string, string>
  body: () => string | undefined
  ended: () => boolean
} {
  const headers = new Map<string, string>()
  let body: string | undefined
  let ended = false
  const response = {
    statusCode: 0,
    setHeader: (name: string, value: string) => {
      headers.set(name.toLowerCase(), value)
    },
    end: (chunk?: string) => {
      body = chunk
      ended = true
    }
  } as unknown as ServerResponse
  return { response, headers, body: () => body, ended: () => ended }
}

async function handle(
  url: string,
  remoteAddress: string | undefined,
  provider: () => string | null,
  method = 'GET'
): Promise<{ response: ServerResponse; headers: Map<string, string>; body: () => string | undefined }> {
  const handler = createStaticWebClientHandler('/nonexistent-static-root', {
    trustedSessionProvider: provider
  })
  const spy = responseSpy()
  handler(requestFrom(url, remoteAddress, method), spy.response)
  // The listener dispatches into an async worker with `void`, so let it settle.
  await vi.waitFor(() => expect(spy.ended()).toBe(true))
  return spy
}

describe('/trusted-session', () => {
  it('serves the offer to a loopback peer and forbids caching it', async () => {
    // The payload is a device credential plus E2EE material: a cached copy hands runtime access
    // to whoever reads the cache next.
    for (const remote of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
      const { response, headers, body } = await handle('/trusted-session', remote, () => PAIRING_URL)
      expect(response.statusCode).toBe(200)
      expect(headers.get('cache-control')).toBe('no-store')
      expect(JSON.parse(body() ?? '{}')).toEqual({ pairingUrl: PAIRING_URL })
    }
  })

  it('hides the endpoint from a non-loopback peer', async () => {
    // Loopback IS the authorization — proof the request came through the front proxy, which
    // already authenticated. 404 not 403, so a scanner cannot learn the endpoint exists.
    for (const remote of ['10.1.125.4', '::ffff:10.1.125.4', undefined]) {
      const { response, body } = await handle('/trusted-session', remote, () => PAIRING_URL)
      expect(response.statusCode).toBe(404)
      expect(body()).toBeUndefined()
    }
  })

  it('answers 503 while no offer can be minted yet', async () => {
    // A healthcheck must not treat "still starting" as "reachable".
    const { response } = await handle('/trusted-session', '127.0.0.1', () => null)
    expect(response.statusCode).toBe(503)
  })

  it('serves the credential from its own path and nowhere else', async () => {
    // A credential must not be reachable from under /assets/, which a proxy or CDN may treat as
    // public and cacheable. A deployment's URL prefix belongs in the operator's proxy template.
    for (const url of [
      '/assets/foo/trusted-session',
      '/workspace/orca/trusted-session',
      '/a/b/c/trusted-session'
    ]) {
      const { response, body } = await handle(url, '127.0.0.1', () => PAIRING_URL)
      expect({ url, statusCode: response.statusCode }).toEqual({ url, statusCode: 404 })
      expect(body()).toBeUndefined()
    }
  })

  it('answers HEAD with the headers and no body', async () => {
    // HTTP requires HEAD to carry no body; writing the credential JSON as one leaks it into
    // every intermediary that records HEAD responses as bodyless.
    const { response, headers, body } = await handle(
      '/trusted-session',
      '127.0.0.1',
      () => PAIRING_URL,
      'HEAD'
    )
    expect(response.statusCode).toBe(200)
    expect(headers.get('cache-control')).toBe('no-store')
    expect(body()).toBeUndefined()
  })

  it('stays absent when trusted-proxy mode is off', async () => {
    // Without --trusted-proxy there is no provider, so the path falls through to the static
    // allowlist.
    const handler = createStaticWebClientHandler('/nonexistent-static-root')
    const spy = responseSpy()
    handler(requestFrom('/trusted-session', '127.0.0.1'), spy.response)
    await vi.waitFor(() => expect(spy.ended()).toBe(true))
    expect(spy.response.statusCode).toBe(404)
  })
})
