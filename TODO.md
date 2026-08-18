# TODO

Capabilities upstream ships that the web client cannot reach. Not bugs in the series — gaps the
series does not cover yet.

## New in v1.4.184

Found by diffing `web-preload-api.ts` v1.4.159..v1.4.184: 37 stub entries were added. Each is a
capability that works on desktop and is dead in the tile. Verified `rpc=0` — no runtime RPC exists
for any entry below, so every one is failure shape 1 (no wire) from `orca-patch-author`.

| capability | web-preload stubs | desktop owner |
| --- | --- | --- |
| Stale Codex panes | `listStalePanes`, `forgetStalePanes`, `listRecordedPaneLanes` | `ipc/codex-accounts.ts` |
| Legacy worker terminal recovery | `recoverLegacyWorkerTerminalsForRendererStartup`, `onLegacyWorkerTerminalRecovery` | renderer startup |
| AI Vault session browsing | `getFirstUserPrompt`, `cancelListSessions` | `ipc/ai-vault.ts` |
| Browser guest registration | `isGuestRegistered`, `repairGuestRegistration` | `ipc/browser.ts` |
| SSH config hosts | `listConfigHosts`, `resolveConfigHost` | `ipc/ssh.ts` |
| Pending notification queue | `onThreshold`, `consumePending`, `acknowledgePending`, `releasePending`, `dismiss` | `ipc/mobile.ts` |
| Local network reachability probe | `testLocalNetworkConnection` | `ipc/developer-permissions.ts` |
| Upstream ref watch | `setStatusUpstreamRefWatch` | `ipc/filesystem.ts` |

Stale panes and legacy worker recovery sit in the same territory as `agent-cold-restore` — pane
identity surviving a restart — so they are the ones to take first.

**Out of scope, deliberately.** Native desktop UI (app menus, floating-item focus, rich-markdown
context menu, macOS TCC, before-unload checkpoint) has no browser meaning. The updater family
(`startUpdateRun`, `getUpdateRun`, `dismissAvailableUpdate`, `getLinuxPackageInstallInstructions`,
`showLinuxPackage`, `listBuilds`, `restart`) is ours to build, not Orca's to run.

## Process

`orca-patch-audit` re-justifies the patches we already carry — keep, shrink, merge, drop. Nothing in
the flow asks what a release left out of the browser, so a bump currently reports "done" having
audited one half of itself. Amend the skill so the new-stub diff of `web-preload-api.ts` is part of
every bump.
