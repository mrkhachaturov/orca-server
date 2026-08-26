import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HEADLESS_RUNTIME_WINDOW_ID } from '../../shared/runtime-types'
import { OrcaRuntimeService } from './orca-runtime'
import { OrchestrationDb } from './orchestration/db'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => tmpdir()), isPackaged: false },
  BrowserWindow: { fromId: vi.fn(() => null) },
  ipcMain: { on: vi.fn(), removeListener: vi.fn() },
  webContents: { fromId: vi.fn(() => null) }
}))

const TAB_ID = '11111111-1111-4111-8111-111111111111'
const LEAF_ID = '22222222-2222-4222-8222-222222222222'
const PANE_KEY = `${TAB_ID}:${LEAF_ID}`
const PTY_ID = 'pty-headless-delivery'
const TERMINAL_HANDLE = 'term_headless_delivery'
const WORKTREE_ID = 'repo-headless::/tmp/headless'
const LAUNCH_TOKEN = 'headless-launch'
const temporaryDirectories: string[] = []

function createDatabase(): OrchestrationDb {
  const directory = mkdtempSync(join(tmpdir(), 'orca-headless-delivery-'))
  temporaryDirectories.push(directory)
  return new OrchestrationDb(join(directory, 'orchestration.db'))
}

/** `served` is the tile: `orca serve` publishes one explicitly empty graph because the web client's
 *  syncWindowGraph is a stub, so the pane exists only as a PTY record. `desktop` is the renderer
 *  publishing a leaf for the very same pane. */
function createRuntime(
  db: OrchestrationDb,
  shape: 'served' | 'desktop'
): { runtime: OrcaRuntimeService; write: ReturnType<typeof vi.fn> } {
  const runtime = new OrcaRuntimeService(null, undefined, {
    attestAgentHookCompatibilityAuthority: ({ paneKey }) =>
      paneKey === PANE_KEY ? { paneKey, source: 'current_hook' } : null
  })
  const write = vi.fn((_ptyId: string, _data: string) => true)
  runtime.setOrchestrationDb(db)
  runtime.setPtyController({ write, kill: vi.fn(), getForegroundProcess: async () => null })
  runtime.registerPty(PTY_ID, WORKTREE_ID, null, {
    tabId: TAB_ID,
    leafId: LEAF_ID,
    incarnationId: 'headless-incarnation',
    agentLaunchAuthority: { launchToken: LAUNCH_TOKEN, launchAgent: 'codex' }
  })
  runtime.registerPreAllocatedHandleForPty(PTY_ID, TERMINAL_HANDLE)
  if (shape === 'desktop') {
    runtime.attachWindow(1)
    runtime.syncWindowGraph(1, {
      tabs: [
        {
          tabId: TAB_ID,
          worktreeId: WORKTREE_ID,
          title: 'Codex',
          activeLeafId: LEAF_ID,
          layout: null
        }
      ],
      leaves: [
        { tabId: TAB_ID, worktreeId: WORKTREE_ID, leafId: LEAF_ID, paneRuntimeId: 1, ptyId: PTY_ID }
      ]
    })
  } else {
    runtime.syncWindowGraph(HEADLESS_RUNTIME_WINDOW_ID, { tabs: [], leaves: [] })
  }
  return { runtime, write }
}

/** The mailbox a coordinator actually addresses: pointer delivery only ever points at a run. */
function seedCoordinatorRunMail(db: OrchestrationDb, subject: string): string {
  const run = db.createRun({
    objective: 'headless delivery',
    coordinatorHandle: TERMINAL_HANDLE,
    coordinatorPaneKey: PANE_KEY
  })
  db.insertMessage({
    from: 'term_sender',
    to: `run:${run.id}`,
    subject,
    type: 'status',
    runId: run.id,
    deliveryContract: 'current_delivery'
  })
  return run.id
}

async function goIdle(runtime: OrcaRuntimeService): Promise<void> {
  await runtime.listTerminals()
  runtime.onPtyData(PTY_ID, '\x1b]0;Codex working\x07', 1)
  runtime.onPtyData(PTY_ID, '\x1b]0;Codex done\x07', 2)
  await Promise.resolve()
}

function pointers(write: ReturnType<typeof vi.fn>): string[] {
  return write.mock.calls
    .map(([, payload]) => String(payload))
    .filter((payload) => payload.includes('orca orchestration check'))
}

describe('orchestration delivery to a headless-served terminal', () => {
  afterEach(() => {
    vi.useRealTimers()
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('points a headless-served terminal at its run mail when the agent goes idle', async () => {
    vi.useFakeTimers()
    const db = createDatabase()
    const { runtime, write } = createRuntime(db, 'served')
    const runId = seedCoordinatorRunMail(db, 'coordinator says go')

    await goIdle(runtime)

    // The symptom: in the tile the message was stored and nobody was told, so coordination
    // degraded to going and prompting each agent to check its own inbox.
    expect(pointers(write)).toEqual([expect.stringContaining(`--run ${runId}`)])
    db.close()
  })

  it('submits the pointer once the headless agent is still idle at the settle deadline', async () => {
    vi.useFakeTimers()
    const db = createDatabase()
    const { runtime, write } = createRuntime(db, 'served')
    seedCoordinatorRunMail(db, 'coordinator says go')

    await goIdle(runtime)
    await vi.advanceTimersByTimeAsync(500)

    // A typed pointer nobody submits leaves the agent sitting at a filled prompt.
    expect(write).toHaveBeenCalledWith(PTY_ID, '\r')
    db.close()
  })

  it('points a headless-served terminal that is already idle when the mail arrives', async () => {
    vi.useFakeTimers()
    const db = createDatabase()
    const { runtime, write } = createRuntime(db, 'served')

    await goIdle(runtime)
    const runId = seedCoordinatorRunMail(db, 'mail after the agent settled')
    // orchestration.send drains through this; there is no later idle edge to wait for.
    runtime.deliverPendingMessagesForHandle(`run:${runId}`)

    expect(pointers(write)).toEqual([expect.stringContaining(`--run ${runId}`)])
    db.close()
  })

  it('points a pane the renderer publishes exactly once', async () => {
    vi.useFakeTimers()
    const db = createDatabase()
    const { runtime, write } = createRuntime(db, 'desktop')
    seedCoordinatorRunMail(db, 'coordinator says go')

    await goIdle(runtime)
    await vi.advanceTimersByTimeAsync(500)

    // Regression guard, not proof: green with or without this patch. A leaf and a PTY record
    // describe the same pane, so both delivery triggers resolve one handle.
    expect(pointers(write)).toHaveLength(1)
    db.close()
  })
})
