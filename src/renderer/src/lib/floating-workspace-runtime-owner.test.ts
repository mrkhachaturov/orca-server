import { describe, expect, it } from 'vitest'
import { resolveFloatingWorkspaceRuntimeEnvironmentId } from './floating-workspace-runtime-owner'

describe('resolveFloatingWorkspaceRuntimeEnvironmentId', () => {
  it('keeps the floating workspace local on the desktop app', () => {
    // Why: the desktop floating workspace is a deliberate local scratch surface —
    // focusing a remote runtime must not move the user's notes pad onto it.
    expect(
      resolveFloatingWorkspaceRuntimeEnvironmentId({
        isWebClient: false,
        activeRuntimeEnvironmentId: 'env-1'
      })
    ).toBeNull()
  })

  it('owns the floating workspace with the connected runtime in the web client', () => {
    // Why: the browser has no local shell, webview or file dialog to own it.
    expect(
      resolveFloatingWorkspaceRuntimeEnvironmentId({
        isWebClient: true,
        activeRuntimeEnvironmentId: 'env-1'
      })
    ).toBe('env-1')
  })

  it('stays local in a web client with no runtime to own it', () => {
    // Why: a null owner fails honestly through the existing local path instead of
    // addressing RPCs at an environment that is not there.
    expect(
      resolveFloatingWorkspaceRuntimeEnvironmentId({
        isWebClient: true,
        activeRuntimeEnvironmentId: null
      })
    ).toBeNull()
    expect(
      resolveFloatingWorkspaceRuntimeEnvironmentId({
        isWebClient: true,
        activeRuntimeEnvironmentId: undefined
      })
    ).toBeNull()
    expect(
      resolveFloatingWorkspaceRuntimeEnvironmentId({
        isWebClient: true,
        activeRuntimeEnvironmentId: '   '
      })
    ).toBeNull()
  })

  it('trims the environment id so a padded setting still addresses the runtime', () => {
    expect(
      resolveFloatingWorkspaceRuntimeEnvironmentId({
        isWebClient: true,
        activeRuntimeEnvironmentId: '  env-1  '
      })
    ).toBe('env-1')
  })

  it('falls back to the only saved environment when the browser has chosen none', () => {
    // Why: an unset preference in a browser is not "local" — there is no local shell to own
    // the floating workspace, and the page was served by the one environment on the list.
    // Resolving it here rather than defaulting the stored setting keeps
    // `activeRuntimeEnvironmentId` meaning "the user chose", so an explicit null stays null.
    expect(
      resolveFloatingWorkspaceRuntimeEnvironmentId({
        isWebClient: true,
        activeRuntimeEnvironmentId: null,
        runtimeEnvironments: [{ id: 'env-1' }]
      })
    ).toBe('env-1')
  })

  it('refuses to guess when the fallback would be ambiguous or unavailable', () => {
    expect(
      resolveFloatingWorkspaceRuntimeEnvironmentId({
        isWebClient: true,
        activeRuntimeEnvironmentId: null,
        runtimeEnvironments: [{ id: 'env-1' }, { id: 'env-2' }]
      })
    ).toBeNull()
    expect(
      resolveFloatingWorkspaceRuntimeEnvironmentId({
        isWebClient: true,
        activeRuntimeEnvironmentId: null,
        runtimeEnvironments: []
      })
    ).toBeNull()
    // Desktop keeps its local floating workspace even with exactly one runtime saved.
    expect(
      resolveFloatingWorkspaceRuntimeEnvironmentId({
        isWebClient: false,
        activeRuntimeEnvironmentId: null,
        runtimeEnvironments: [{ id: 'env-1' }]
      })
    ).toBeNull()
  })

  it('lets an explicit choice win over the single-environment fallback', () => {
    expect(
      resolveFloatingWorkspaceRuntimeEnvironmentId({
        isWebClient: true,
        activeRuntimeEnvironmentId: 'env-2',
        runtimeEnvironments: [{ id: 'env-1' }]
      })
    ).toBe('env-2')
  })
})
