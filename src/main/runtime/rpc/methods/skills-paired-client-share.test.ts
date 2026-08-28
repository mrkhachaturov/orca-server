import { describe, expect, it, vi } from 'vitest'
import { SKILL_METHODS } from './skills'

// Overlay-owned so it survives `quilt pop`: with the patch popped, `skills.share` restores the
// `clientKind !== undefined` refusal and the first case below fails.

const shareHandler = () => {
  const method = SKILL_METHODS.find((m) => m.name === 'skills.share')
  if (!method) {
    throw new Error('skills.share is not registered')
  }
  return method.handler
}

function runtimeStub(overrides: Record<string, unknown> = {}) {
  return {
    assertAgentSkillSharingAllowed: vi.fn(),
    resolveProjectRuntimeForWorktree: vi.fn(() => ({ kind: 'native-host' as const })),
    listRepos: vi.fn(() => []),
    resolveSkillDiscoveryProviderRoots: vi.fn(async () => ({})),
    publishDiscoveredSkillsFromAgent: vi.fn(async () => ({ status: 'ok' as const, value: {} })),
    ...overrides
  }
}

const request = {
  skillSelectors: ['some-skill'],
  bundleName: 'team-toolkit',
  releaseNotes: ''
}

describe('skills.share from a paired client', () => {
  it('does not refuse a runtime-scope caller for being paired', async () => {
    // The tile IS a paired client (`clientKind === 'runtime'`), and on orca-server the host is the
    // machine that stores the skills, so "run it on the machine that stores the skills" named the
    // machine the caller was already talking to.
    const runtime = runtimeStub()
    await expect(
      shareHandler()(request, { runtime, clientKind: 'runtime' } as never)
    ).resolves.toBeDefined()
    expect(runtime.publishDiscoveredSkillsFromAgent).toHaveBeenCalled()
  })

  it('does not refuse a mobile caller for being paired', async () => {
    const runtime = runtimeStub()
    await expect(
      shareHandler()(request, { runtime, clientKind: 'mobile' } as never)
    ).resolves.toBeDefined()
  })

  it('still refuses before anything else when the device gate is off', async () => {
    // The owner's decision is unchanged: publishing stays refused for every caller until the
    // server's toggle is on, and that check runs before target resolution.
    const runtime = runtimeStub({
      assertAgentSkillSharingAllowed: vi.fn(() => {
        throw new Error('agent_skill_sharing_disabled')
      })
    })
    await expect(
      shareHandler()(request, { runtime, clientKind: 'runtime' } as never)
    ).rejects.toThrow('agent_skill_sharing_disabled')
    expect(runtime.publishDiscoveredSkillsFromAgent).not.toHaveBeenCalled()
  })

  it('still refuses a target the executing runtime does not own', async () => {
    // TM-04 in `docs/reference/agent-skill-sharing-threat-model.md` — destination paths are
    // resolved by the runtime that owns the host. That control is the one that was doing the real
    // work here, and it is unchanged. The exact message differs by platform (a Windows host reaches
    // the native-host refusal, others reject earlier in resolution), so the invariant asserted is
    // the one that matters: a forwarded target never reaches the publish call.
    const runtime = runtimeStub({
      resolveProjectRuntimeForWorktree: vi.fn(() => ({
        status: 'resolved' as const,
        runtime: { kind: 'wsl' as const, distro: 'Ubuntu' }
      }))
    })
    await expect(
      shareHandler()(request, { runtime, clientKind: 'runtime' } as never)
    ).rejects.toThrow()
    expect(runtime.publishDiscoveredSkillsFromAgent).not.toHaveBeenCalled()
  })

  it('still refuses a project runtime that needs repair', async () => {
    const runtime = runtimeStub({
      resolveProjectRuntimeForWorktree: vi.fn(() => ({
        status: 'repair-required' as const,
        repair: { reason: 'missing distro' }
      }))
    })
    await expect(
      shareHandler()(request, { runtime, clientKind: 'runtime' } as never)
    ).rejects.toThrow(/repair/)
    expect(runtime.publishDiscoveredSkillsFromAgent).not.toHaveBeenCalled()
  })
})
