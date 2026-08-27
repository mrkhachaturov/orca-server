import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { OrcaRuntimeService } from './orca-runtime'
import { OrcaRuntimeRpcServer } from './runtime-rpc'

// The /trusted-session probe and the "Share this Orca server" grant mint from ONE pending
// runtime device, and getOrCreatePendingDevice widens reach but never narrows it — so the
// probe silently decides the reach of the grant beside it.

const servers: OrcaRuntimeRpcServer[] = []
const directories: string[] = []

async function startServer(): Promise<OrcaRuntimeRpcServer> {
  const userDataPath = mkdtempSync(join(tmpdir(), 'orca-trusted-session-reach-'))
  directories.push(userDataPath)
  const server = new OrcaRuntimeRpcServer({
    runtime: new OrcaRuntimeService(),
    userDataPath,
    // The pairing identity (and so the device registry) initialises only on the WebSocket
    // path; port 0 keeps the bind ephemeral.
    enableWebSocket: true,
    wsPort: 0,
    trustedProxy: true,
    trustedProxyAddress: 'https://ws.example.com'
  })
  servers.push(server)
  await server.start()
  return server
}

/** Private on purpose — this is the unit under test, reached the way the HTTP route reaches it. */
function mintTrustedSessionOffer(server: OrcaRuntimeRpcServer): string | null {
  return (
    server as unknown as { buildTrustedSessionOffer(): string | null }
  ).buildTrustedSessionOffer()
}

/** The reach recorded on the one pending runtime device, which is what the bind decision reads. */
function pendingRuntimeReach(server: OrcaRuntimeRpcServer): string | undefined {
  return server
    .getDeviceRegistry()
    ?.listDevices()
    .find((device) => device.scope === 'runtime' && device.lastSeenAt === 0)?.pairingReach
}

afterEach(async () => {
  while (servers.length > 0) {
    await servers.pop()?.stop()
  }
  while (directories.length > 0) {
    rmSync(directories.pop() as string, { recursive: true, force: true })
  }
})

describe('the trusted-session offer and the runtime grant agree on reach', () => {
  it('mints the trusted-session offer at this-computer reach', async () => {
    // Why (STA-2370): network reach lets the device's first reconnect rebind every interface,
    // voiding the loopback bind the whole trusted-proxy mode rests on.
    const server = await startServer()

    expect(mintTrustedSessionOffer(server)).not.toBeNull()

    expect(pendingRuntimeReach(server)).toBe('this-computer')
  }, 20_000)

  it('does not widen the reach the runtime grant already pinned', async () => {
    // The two share one pending device, so a probe after a grant must not re-widen it.
    const server = await startServer()

    server.createPairingOffer({
      address: 'https://ws.example.com',
      scope: 'runtime',
      reach: 'this-computer'
    })
    mintTrustedSessionOffer(server)

    expect(pendingRuntimeReach(server)).toBe('this-computer')
  }, 20_000)

  it('still records the widening a network caller genuinely asks for', async () => {
    // The guard is one-way on purpose: a link already handed out for off-host use must keep
    // being served after a restart. That is what makes an omitted reach silent, not loud.
    const server = await startServer()

    mintTrustedSessionOffer(server)
    server.createPairingOffer({ address: 'https://ws.example.com', scope: 'runtime' })

    expect(pendingRuntimeReach(server)).toBe('network')
  }, 20_000)
})
