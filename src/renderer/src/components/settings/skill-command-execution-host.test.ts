// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import type { PublicKnownRuntimeEnvironment } from '../../../../shared/runtime-environments'
import type { RuntimeStatus } from '../../../../shared/runtime-types'
import type { PreloadApi } from '../../../../preload/api-types'
import { useAppStore } from '@/store'
import { buildSkillCommandForRuntime } from './CliSkillRuntimeSetup'

// Why: the skill command runs on the machine Orca serves from, so its platform decides the
// command. The client only decides what the viewer sees (keyboard modifiers), never what runs.

type PlatformInfo = ReturnType<PreloadApi['platform']['get']>

const INSTALL_COMMAND = 'npx skills add https://github.com/stablyai/orca --skill orchestration'
const UPDATE_COMMAND = 'npx skills update orchestration --global'
const WINDOWS_NPX_PREFLIGHT = 'cmd.exe /d /s /c "where.exe npx'

function linuxRuntimeStatus(): RuntimeStatus {
  return {
    runtimeId: 'runtime-linux',
    rendererGraphEpoch: 1,
    graphStatus: 'ready',
    authoritativeWindowId: null,
    liveTabCount: 0,
    liveLeafCount: 0,
    hostPlatform: 'linux'
  }
}

function savedEnvironment(id: string): PublicKnownRuntimeEnvironment {
  return {
    id,
    name: 'Orca Server',
    createdAt: 0,
    updatedAt: 0,
    lastUsedAt: null,
    runtimeId: 'runtime-linux',
    preferredEndpointId: 'endpoint-1',
    endpoints: [
      { id: 'endpoint-1', kind: 'websocket', label: 'Orca Server', endpoint: 'wss://orca.example/' }
    ]
  }
}

function stubClientPlatform(platform: NodeJS.Platform): void {
  const info: PlatformInfo = {
    platform,
    osRelease: '',
    arch: '',
    shell: '',
    displayServer: null
  }
  // Why: one narrow stub of the client accessor; the shape above is checked against the real
  // return type so a renamed field fails the typecheck rather than silently testing nothing.
  Object.assign(window, { api: { platform: { get: () => info } } })
}

function setWebClient(isWebClient: boolean): void {
  Object.assign(window, { __ORCA_WEB_CLIENT__: isWebClient })
}

afterEach(() => {
  Object.assign(window, { api: undefined, __ORCA_WEB_CLIENT__: undefined })
  useAppStore.setState({
    settings: getDefaultSettings('/home/coder'),
    runtimeEnvironments: [],
    runtimeStatusByEnvironmentId: new Map()
  })
})

describe('skill command targets the execution host', () => {
  it('builds a Linux command for a Windows browser served by a Linux runtime', () => {
    // The browser is on Windows, the server is Linux, and no Active Server is chosen — the
    // state a proxied workspace boots into. The command runs in the server's bash.
    setWebClient(true)
    stubClientPlatform('win32')
    useAppStore.setState({
      settings: { ...getDefaultSettings('/home/coder'), activeRuntimeEnvironmentId: '' },
      runtimeEnvironments: [savedEnvironment('env-1')],
      runtimeStatusByEnvironmentId: new Map([
        ['env-1', { status: linuxRuntimeStatus(), checkedAt: 0 }]
      ])
    })

    expect(buildSkillCommandForRuntime(INSTALL_COMMAND)).toBe(INSTALL_COMMAND)
    expect(buildSkillCommandForRuntime(INSTALL_COMMAND)).not.toContain(WINDOWS_NPX_PREFLIGHT)
  })

  it('keeps skills update intact when the focused runtime is Linux', () => {
    // Rewriting update into a reinstall is a native-Windows reliability workaround. On a Linux
    // host it is neither needed nor correct, and upstream's remote-runtime guard does not cover
    // this path — only the npx preflight wrapper.
    setWebClient(false)
    stubClientPlatform('win32')
    useAppStore.setState({
      settings: { ...getDefaultSettings('/home/coder'), activeRuntimeEnvironmentId: 'env-1' },
      runtimeEnvironments: [savedEnvironment('env-1')],
      runtimeStatusByEnvironmentId: new Map([
        ['env-1', { status: linuxRuntimeStatus(), checkedAt: 0 }]
      ])
    })

    expect(buildSkillCommandForRuntime(UPDATE_COMMAND)).toBe(UPDATE_COMMAND)
  })

  it('still builds a Windows command when the client is the host', () => {
    // Regression guard, not proof: green with or without the fix. A desktop Windows app with no
    // runtime saved is its own execution host, so nothing may change for it.
    setWebClient(false)
    stubClientPlatform('win32')
    useAppStore.setState({
      settings: { ...getDefaultSettings('/home/coder'), activeRuntimeEnvironmentId: '' },
      runtimeEnvironments: [],
      runtimeStatusByEnvironmentId: new Map()
    })

    expect(buildSkillCommandForRuntime(INSTALL_COMMAND)).toContain(WINDOWS_NPX_PREFLIGHT)
  })
})
