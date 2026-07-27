import { describe, expect, it } from 'vitest'
import { resolveFloatingWorkspaceRuntimeEnvironmentId } from './floating-workspace-runtime-owner'

describe('resolveFloatingWorkspaceRuntimeEnvironmentId', () => {
  it('keeps the floating workspace local on the desktop app', () => {
    // A deliberate local scratch surface: focusing a remote runtime must not move it.
    expect(
      resolveFloatingWorkspaceRuntimeEnvironmentId({
        isWebClient: false,
        activeRuntimeEnvironmentId: 'env-1'
      })
    ).toBeNull()
  })

  it('owns the floating workspace with the connected runtime in the web client', () => {
    expect(
      resolveFloatingWorkspaceRuntimeEnvironmentId({
        isWebClient: true,
        activeRuntimeEnvironmentId: 'env-1'
      })
    ).toBe('env-1')
  })

  it('stays local in a web client with no runtime to own it', () => {
    // A null owner falls through the existing local path rather than addressing RPCs at an
    // environment that is not there.
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
    // Resolved here rather than by defaulting the stored setting, so
    // `activeRuntimeEnvironmentId` keeps meaning "the user chose".
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
