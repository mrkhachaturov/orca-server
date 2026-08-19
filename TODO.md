# TODO

Capabilities upstream ships that the web client cannot reach. Not bugs in the series — gaps the
series does not cover yet.

## New in v1.4.184

Verified on the search mirror at `pristine` = `v1.4.184` = `2307f2e`. Diffing the object keys of
`web-preload-api.ts` v1.4.159..v1.4.184 adds 40 and removes 3; not every added key is a stub. Each
capability below is stubbed in the web preload, absent at v1.4.159, and has no `defineMethod` under
`src/main/runtime/rpc/` — failure shape 1 (no wire) from `orca-patch-author`.

| capability | web-preload stubs | stubbed in | desktop owner |
| --- | --- | --- | --- |
| Stale Codex panes | `listStalePanes`, `listRecordedPaneLanes`, `forgetStalePanes` | `createAccountsApi` | `ipc/codex-accounts.ts` |
| Legacy worker terminal recovery | `recoverLegacyWorkerTerminalsForRendererStartup`, `onLegacyWorkerTerminalRecovery` | `app` namespace | `main/startup/legacy-worker-renderer-recovery.ts` |
| AI Vault session browsing | `getFirstUserPrompt`, `cancelListSessions` | `createAiVaultApi` | `ipc/ai-vault.ts` |
| Browser guest registration | `isGuestRegistered`, `repairGuestRegistration` | `createBrowserApi` | `ipc/browser.ts` |
| SSH config hosts | `listConfigHosts`, `resolveConfigHost` | `createSshApi` | `ipc/ssh.ts` |
| Local network reachability probe | `testLocalNetworkConnection` | `createDeveloperPermissionsApi` | `ipc/local-network-connection-test.ts` |
| Upstream ref watch | `setStatusUpstreamRefWatch` | `git` namespace | `ipc/filesystem.ts` |

`setStatusUpstreamRefWatch` is the only one with a live caller: `runtime/runtime-git-client.ts`
invokes it unconditionally, so the web no-op drops the watch and reports no error. `App.tsx` awaits
legacy worker recovery three times during startup — pre-reconnect, post-reconnect and the cold
branch — each a `Promise.resolve()` in the browser.

Stale panes and legacy worker recovery sit in the same territory as `agent-cold-restore` — pane
identity surviving a restart — so they are the ones to take first.

**Out of scope, deliberately.** Native desktop UI (app menus, floating-item focus, rich-markdown
context menu, before-unload checkpoint) has no browser meaning. The macOS TCC prompt queue
(`onThreshold`, `consumePending`, `acknowledgePending`, `releasePending`, `dismiss` in
`createMacosTccPromptsApi`) belongs here too — an earlier revision of this file listed those five as
a pending notification queue owned by `ipc/mobile.ts`; they are neither. The updater family
(`startUpdateRun`, `getUpdateRun`, `dismissAvailableUpdate`, `getLinuxPackageInstallInstructions`,
`showLinuxPackage`, `listBuilds`, `restart`) is ours to build, not Orca's to run.

## Process

`orca-patch-audit` re-justifies the patches we already carry — keep, shrink, merge, drop. Nothing in
the flow asks what a release left out of the browser, so a bump currently reports "done" having
audited one half of itself. Amend the skill so the new-stub diff of `web-preload-api.ts` is part of
every bump.

A second class has no gate at all: **upstream adds a condition to a line a patch does not touch,
and the patch keeps applying cleanly while its capability dies.** v1.4.184 added `canGenerate` to
`RuntimePairingGeneratorForm`, which `pairing-credentials.diff` can never satisfy because it hides
the address controls that would set it — `quilt push` green, `test:types` green, button dead. Fuzz
detection cannot see it: there is no conflict. The audit needs to diff the *neighbourhood* of every
hunk, not just whether the hunk still applies, and to weigh hardest where a patch hides a control
whose value something else still reads.
