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
  // Why: the listener dispatches into an async worker with `void`, so let it settle.
  await vi.waitFor(() => expect(spy.ended()).toBe(true))
  return spy
}

describe('/trusted-session', () => {
  it('serves the offer to a loopback peer and forbids caching it', async () => {
    // Why: the payload is a device credential plus E2EE material. A proxy or browser
    // caching it would hand runtime access to whoever reads the cache next.
    for (const remote of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
      const { response, headers, body } = await handle('/trusted-session', remote, () => PAIRING_URL)
      expect(response.statusCode).toBe(200)
      expect(headers.get('cache-control')).toBe('no-store')
      expect(JSON.parse(body() ?? '{}')).toEqual({ pairingUrl: PAIRING_URL })
    }
  })

  it('hides the endpoint from a non-loopback peer', async () => {
    // Why: loopback IS the authorization — it is proof the request arrived through the
    // front proxy, which already authenticated. 404 rather than 403 so an off-host
    // scanner cannot even learn the endpoint exists.
    for (const remote of ['10.1.125.4', '::ffff:10.1.125.4', undefined]) {
      const { response, body } = await handle('/trusted-session', remote, () => PAIRING_URL)
      expect(response.statusCode).toBe(404)
      expect(body()).toBeUndefined()
    }
  })

  it('answers 503 while no offer can be minted yet', async () => {
    // Why: a healthcheck must not treat "still starting" as "reachable"; the tile's
    // readiness probe uses /web-index.html for exactly this reason.
    const { response } = await handle('/trusted-session', '127.0.0.1', () => null)
    expect(response.statusCode).toBe(503)
  })

  it('serves the credential from its own path and nowhere else', async () => {
    // Why: the payload is a real runtime credential, so it must not be reachable from an
    // arbitrary path — least of all from under /assets/, which a proxy or CDN may treat
    // as public and cacheable. A deployment's URL prefix belongs in the operator's proxy
    // template, not in a suffix this handler tries to guess.
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
    // Why: HTTP requires HEAD to carry no message body. Writing the credential JSON as one
    // leaks it into every intermediary and log that records HEAD responses as bodyless.
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
    // Why: opt-in. Without --trusted-proxy there is no provider, so the path falls
    // through to the static allowlist and 404s like any unknown file.
    const handler = createStaticWebClientHandler('/nonexistent-static-root')
    const spy = responseSpy()
    handler(requestFrom('/trusted-session', '127.0.0.1'), spy.response)
    await vi.waitFor(() => expect(spy.ended()).toBe(true))
    expect(spy.response.statusCode).toBe(404)
  })
})
