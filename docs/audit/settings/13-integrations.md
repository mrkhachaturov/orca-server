# integrations - what it needs to work in the browser

Paths relative to `lib/orca/`. Every file cited here is **pristine** at `v1.4.190` except
`src/main/index.ts` and `src/main/runtime/runtime-rpc.ts`, where the pristine number is given
explicitly. No patch in `patches/series` touches any Integrations pane file.

## State today

**Tile, published v4.190.1.** The section is listed and the pane renders. Seven cards in two
groups: Review providers (GitHub, GitLab, Bitbucket, Azure DevOps, Gitea) and Task providers
(Linear, Jira) - `IntegrationsPane.tsx:16-55`.

Measured in phase 0 (`00-sections.md`), taken as fact here: `window.api.jira.status()` resolves
`undefined` on the live tile. `undefined` is the `getFallbackResult` signature for a name matching
none of its prefix rules (`web-preload-api.ts:4570-4592`, pristine) - a wired namespace returns a
`JiraConnectionStatus` object. Also measured in phase 0: the Jira card's "Account scope: **Local
Mac**" row, on a Linux host, driven from a Mac browser.

**Host, measured this pass over `coder ssh` (no browser, no writes, reads only):**

- Serve process is pid 793, `squashfs-root/orca-ide --no-sandbox --serve --serve-port
  --serve-pairing-address --serve-trusted-proxy`. Confirms 05-ssh's finding: Electron main, not
  `orcad`.
- `~/.config/orca/` has **no** `jira-sites.json` and **no** `jira-tokens/`
  (`site-credential-store.ts:31,35`). No Jira site is connected on the host.
- No Bitbucket credential file in `~/.config/orca/`.
- pid 793's environment holds 2130 variables; **none** matching `bitbucket`, `azure`, `gitea`,
  `jira` or `linear` (key names only, no values read). So Bitbucket / Azure DevOps / Gitea are
  genuinely unconfigured, not merely unreadable.
- `gh` and `glab` are both installed at `/usr/local/bin/`. Their authentication state was not
  probed.

**Which cards are live and which are silently inert.** Established per card by tracing the data
path, not by the rendered label - four of the seven look identical in the tile ("Not connected" /
"Not configured") whether the wire answers or the fallback proxy does.

| card | status read | credential write path | verdict |
| --- | --- | --- | --- |
| GitHub | `preflight.check` RPC | none - `shell.openUrl` only | **live** |
| GitLab | `preflight.check` RPC | none - `shell.openUrl` only | **live** |
| Azure DevOps | `preflight.check` RPC | none - host env vars only | **live** |
| Gitea | `preflight.check` RPC | none - host env vars only | **live** |
| Linear | `linear.status` RPC | `linear.connect` / `disconnect` / `testConnection` RPC | **live** |
| Bitbucket | `preflight.check` RPC - **live** | `window.api.bitbucket.{status,connect,disconnect}` - **inert** | **partial** |
| Jira | `window.api.jira.status()` - **inert** | `window.api.jira.*` - **inert** | **inert** |

- **`preflight.check` is real over the wire.** `createPreflightApi` (`web-preload-api.ts:2923-2996`,
  `check` at `:2970`) calls `callRuntimeResult('preflight.check')`; `PREFLIGHT_METHODS`
  registers it (`rpc/methods/preflight.ts:23`). All five source-control cards derive their status
  from it via `usePreflightCardStatuses` (`source-control-preflight-card-status.ts:53-95`). The
  `bitbucket` / `azureDevOps` / `gitea` keys at `web-preload-api.ts:2928-2942` are fields of that
  function's disconnected-fallback `PreflightStatus` literal - **not** preload namespaces. Grepping
  the whole file for those three names returns only those literals and three `linked*PR` worktree
  fields (`:1844-1846`).
- **Azure DevOps and Gitea have no in-app credential entry on any client.** Their cards are
  read-only status plus `shell.openUrl` (`token-source-control-integration-cards.tsx:105,219`), and
  they instruct the operator to set token environment variables on the host. `shell.openUrl` is real
  on web (`createShellApi`, `web-preload-api.ts`, `openUrl` → `window.open`). Nothing is missing.
- **Linear is fully wired, by upstream.** `linear: createRuntimeNamespaceApi('linear')` at pristine
  `web-preload-api.ts:889`. Every one of the 24 members of `preload/api/linear-api.ts` has a runtime
  method across `rpc/methods/linear.ts`, `linear-agent-access.ts`, `linear-issue-list-method.ts` and
  `linear-project-create.ts`.
- **Bitbucket's status is live; its connect and disconnect are silent no-ops.**
  `bitbucket-integration-card.tsx:32` calls `window.api.bitbucket.status()` inside a `try` whose
  `catch` is a deliberate no-op ("the preflight-driven parts of the card still render"), so the
  fallback's `undefined` leaves `connection` at `null` and the card falls back to the preflight
  account - visually indistinguishable. `:73` `await window.api.bitbucket.disconnect()` resolves
  `undefined` and the card re-renders as disconnected without anything having happened on the host.
  `bitbucket-credentials-dialog.tsx:116` `const result = await window.api.bitbucket.connect({...})`
  then reads `result.ok` at `:126`, which throws `TypeError` off `undefined`; the surrounding
  `catch` (`:136`) turns that into the dialog's error text. Derived from source, not observed - see
  Unverified.

**Desktop, for contrast.** Identical pane. Jira: Connect / Add Jira site, per-site Test, per-site
Disconnect, credential-scope copy. Bitbucket: Connect with an access token or email + API token,
Disconnect, auth-mode and base-URL summary. All of it reaches `ipcMain` handlers
(`src/main/ipc/jira.ts`, `src/main/ipc/bitbucket.ts`).

## Which gate, and why

**None of the four.** This pane is unusual in the audit: it has no gate to open, and opening a gate
is not what fixes it.

- **Gate 1 - not applicable.** The `integrations` nav entry
  (`useSettingsNavigationMetadata.ts:322-332`, shipped) carries no client condition. It is not one
  of the rows `settings-nav-web-parity.diff` opened.
- **Gate 2 - not applicable.** `Settings.tsx:1400-1410` (shipped) renders
  `<SettingsSection id="integrations">` unconditionally, outside every `showDesktopOnlySettings`
  ternary. It is not one of the 11 JSX blocks.
- **Gate 3 - not involved.**
- **Gate 4 - not present.** No `isWebClientLocation()` anywhere in the pane's subtree:
  `IntegrationsPane.tsx`, `integrations-search.ts`, `cli-source-control-integration-cards.tsx`,
  `bitbucket-integration-card.tsx`, `bitbucket-credentials-dialog.tsx`,
  `token-source-control-integration-cards.tsx`, `task-tracker-integration-cards.tsx`,
  `jira-integration-card.tsx`, `integration-card-shell.tsx`, `linear-agent-skill-install-cta.tsx`,
  `linear-api-key-dialog.tsx`, `jira-connect-dialog.tsx`. This pane's "renders partially" in
  `00-sections.md` is **not** gate 4 - it is shared dependency #5 reached one namespace at a time.

**The responsible mechanism instead.** `withFallback` (`web-preload-api.ts:4534-4547`) hands any
key absent from the web `api` object to `createFallbackProxy` (`:4549-4568`), whose `apply` trap
answers `getFallbackResult` (`:4570-4592`). For `jira.status` and `bitbucket.status` the name
matches no prefix rule, so both resolve `Promise.resolve(undefined)`. Nothing throws, nothing logs,
and the card renders its not-connected branch.

**Settling the disputed claim by measurement.** An earlier audit concluded Jira was already routed
because `runtime-jira-client.ts` calls `callRuntimeRpc`. It does - but only on one branch:

```text
// runtime-jira-client.ts:51-56
export async function jiraStatus(settings: RuntimeJiraSettings): Promise<JiraConnectionStatus> {
  const target = getJiraRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc<JiraConnectionStatus>(target, 'jira.status', undefined, { timeoutMs: 15_000 })
    : window.api.jira.status()
}
```

`getJiraRuntimeTarget` → `getActiveRuntimeTarget` (`runtime-client-target.ts:5-10`) returns
`{ kind: 'environment' }` only when `settings.activeRuntimeEnvironmentId` is non-empty. That is
`GlobalSettings`' explicitly-selected *remote* runtime - a different thing from the web preload's
own paired `activeEnvironment` (`requireActiveEnvironment`, `web-preload-api.ts:3775`), which is
what `callRuntimeResult` (`:3547`) uses.

Two independent live measurements say `activeRuntimeEnvironmentId` is empty on the tile, so the
`local` branch is the one taken:

1. `window.api.jira.status()` → `undefined` (phase 0). The environment branch cannot produce
   `undefined`; only the fallback proxy can.
2. The card's scope row reads "Account scope: Local Mac" (phase 0). `getProviderAccountScope`
   (`provider-account-scope.ts:39-63`) returns `getLocalExecutionHostLabel()` **only** on the empty
   branch; a set `activeRuntimeEnvironmentId` renders "Remote server: …" instead.

Both claims are therefore literally true and only phase 0's applies to the shipped tile. On
orca-server the `local` branch **is** the server - AGENTS.md's "local *is* the server, so there is
no local fallback" - so `window.api.jira` is exactly where the wire belongs, which is where upstream
put `window.api.linear`.

**What the operator sees, traced.** `checkJiraConnection` (`store/slices/jira.ts:334`) awaits
`jiraStatus` → `undefined`, then reads `prev.connected !== status.connected` at `:352` - a
`TypeError` off `undefined`, caught by the `catch` at `:364`, which sets
`jiraStatusChecked: true` and leaves `jiraStatus` at its `{ connected: false, viewer: null }`
initial value (`:326`). The card therefore settles on `checking = false`, `connected = false`: a
permanently "Not connected" Jira card with a live-looking "Connect Jira" button. The silence is the
defect.

## What the pane actually needs

### Jira - one wire, and it is one line

| wire | state today | how established |
| --- | --- | --- |
| `jira` preload namespace | **absent** | `grep -n "jira" web-preload-api.ts` returns nothing in pristine or shipped. Live: `window.api.jira.status()` → `undefined` (phase 0). |
| `JIRA_METHODS` RPC family | **exists**, 23 methods | `rpc/methods/jira.ts:117-267`; spread into `ALL_RPC_METHODS` at `rpc/methods/index.ts:81`. Not evidence on its own - see coverage below. |
| `createRuntimeNamespaceApi` | **exists** | `web-preload-api.ts:2684` (pristine). Upstream's own seam for exactly this: `createFallbackProxy([prefix], (path, args) => callRuntimeResult(`${prefix}.${path.at(-1)}`, mapRuntimeNamespaceArg(prefix, args[0])))`. Used today for `hostedReview` (`:888`) and `linear` (`:889`). `mapRuntimeNamespaceArg` special-cases `hostedReview` only, so a `jira` prefix passes args through unchanged. |
| **MainHttpClient** (Jira's outbound half) | **present and correct** - `00-sections.md`'s "what the pane needs" column can be struck | `jira/authenticated-request.ts:61` is its only non-test consumer. `orca serve` is Electron main (pid 793, measured), and `setMainHttpClient(electronHttpClient)` at pristine `src/main/index.ts:908` sits inside the `hasSingleInstanceLock` block with no serve-mode early return (`isServeMode` appears at `:521,541,...` and never guards `:882`). So the Chrome UA that Jira's XSRF check depends on is what orca-server sends. The Node fallback is not reached. |
| **SecretStore** | present, with a caveat | `jira.connect` → `saveToken` → `site-credential-store.ts:160-165`: encrypts when `isEncryptionAvailable()`, otherwise `console.warn('[jira] secret encryption unavailable — storing token in plaintext')` and writes `0o600` plaintext. On a headless Linux host without a keyring this is the `basic_text` / plaintext path `00-building-blocks.md` describes. Not a blocker; an operator-facing fact. |
| preflight-cache reset after connect | **not needed** | `ipc/jira.ts:102,109` calls `_resetPreflightCache()`; the RPC path does not. `PreflightStatus` (`preflight/agent-detection.ts:49-72`) has **no** `jira` key, so nothing the card reads is stale. `ipc/linear.ts:17,24` does the same and Linear already ships without it over RPC - the precedent is upstream's. |

**Method coverage, checked member by member.** `preload/api/jira-api.ts` declares 23 members. 21
have a runtime method of the identical name in `rpc/methods/jira.ts`. The two that do not are
`cancelSearchIssues` and `cancelIssueSummary`, and both call sites already swallow the rejection:
`local-jira-search-cancellation.ts:27` and `runtime-jira-summary-client.ts:34`, each
`void window.api.jira.cancel…({ requestId }).catch(() => {})`. A `method_not_found` there costs
server-side cancellation of a superseded query - the request keeps its slot in
`jira/request-queue.ts` until it drains - and breaks nothing. `requestId` itself is harmless: no
Jira params schema uses `.strict()` (checked - zero `strict` occurrences in `rpc/methods/jira.ts`),
so zod strips it.

**No mobile-allowlist change.** Zero `jira.*` entries on `MOBILE_RPC_METHOD_ALLOWLIST` (pristine
`runtime-rpc.ts:179`; counted 0 across the whole set). Adding a preload namespace does not touch it,
so `jira.connect` stays off the phone-reachable surface. Note the asymmetry to assert rather than
assume: upstream *does* put `linear.connect` on that allowlist.

### Bitbucket - a wire that does not exist at either end

| wire | state today | how established |
| --- | --- | --- |
| `bitbucket` preload namespace | **absent** | grep of `web-preload-api.ts`: only the `PreflightStatus` literal at `:2928`. |
| `bitbucket.*` RPC family | **absent** | No `bitbucket` module in `rpc/methods/`; no `BITBUCKET_METHODS` import or spread in `rpc/methods/index.ts`; grep for `name: 'bitbucket.` across `rpc/methods/` returns nothing. The only `bitbucket` strings in `rpc/` are provider enums in `hosted-review.ts:39` and `git-params.ts:196`. |
| runtime methods on `OrcaRuntimeService` | **absent** | grep `itbucket` in `orca-runtime.ts` returns only `linkedBitbucketPR` worktree fields. |
| the host-side logic | **exists and is already Electron-free** | `main/bitbucket/credential-connection.ts` exports `connectBitbucket` / `disconnectBitbucket` / `getBitbucketConnectionStatus`. Neither it nor anything in `main/bitbucket/` imports `electron`. `ipc/bitbucket.ts` (59 lines) is a thin `ipcMain` wrapper over exactly those three. |
| preflight-cache reset after connect | **needed, and reachable** | Unlike Jira, `PreflightStatus.bitbucket` exists (`preflight/agent-detection.ts:57`) and is what the card's status comes from, so `ipc/bitbucket.ts:45,53`'s `_resetPreflightCache()` is load-bearing. It is defined at `preflight/agent-detection.ts:82` - already split out, Electron-free; `ipc/preflight.ts:18` merely re-exports it. **No new module split is required.** |

This is the same shape as `plugins`: the logic already lives outside `ipc/`, and only the RPC
surface is missing.

### Every card - the scope row lies about the host

All seven cards render `ProviderHostScopeControl` with `getProviderAccountScope(settings)`. On the
empty-`activeRuntimeEnvironmentId` branch it returns `getLocalExecutionHostLabel()`
(`provider-account-scope.ts:57`), which calls `getCurrentLocalPlatform()`
(`shared/execution-host.ts:18-32`) - and that reads `globalThis.navigator.userAgent`, the
**renderer's** platform. In the tile that is the operator's browser, so a Linux host reports "Local
Mac" (measured, phase 0). Its description then reads "owned by this desktop client", which on
orca-server is the wrong machine entirely. This is shared dependency #6, the `hostPlatform` axis,
appearing outside the two sections `00-sections.md` names.

## Verdict

**Jira: works once a wire is built - and the wire is one line of reuse, not new machinery.**

The RPC family, the outbound HTTP port, the credential store and the preload's own namespace helper
all exist and are all correct under `orca serve`. Adding

```text
    jira: createRuntimeNamespaceApi('jira'),
```

beside `linear` at pristine `web-preload-api.ts:889` routes 21 of the 23 members to the host's
`JIRA_METHODS`; the other two are already `.catch(() => {})` at their call sites. This is quality
bar tier 1 - wiring up Orca's own building block - and it restores Jira connect, disconnect,
per-site test, and every issue read and write in the tile.

**Bitbucket: needs a wire built first.** Status is live through `preflight.check`; connect and
disconnect are silent no-ops with no RPC family behind them. A `BITBUCKET_METHODS` family is tier 1
reuse too - the three functions and the cache-reset it needs are all already Electron-free modules -
but it is a new RPC surface, not a one-line preload entry.

**GitHub, GitLab, Azure DevOps, Gitea, Linear: work today.** No change needed.

**The scope row on all seven cards: works partially.** It renders, and it names the wrong machine.
Correct once the label reads the host's platform rather than the renderer's.

Removing the Jira or Bitbucket card is not a candidate. Both are capabilities the host already has;
what is missing is the projection of them onto the wire.

## Size of the work

**Patch 1 - `jira-web-bridge.diff` (new patch, end of `patches/series`).**

- One hunk, one added line, in `lib/orca/src/renderer/src/web/web-preload-api.ts` at pristine `:889`
  (shipped `:947` in this tree).
- Conflict check: the nearest existing hunks in that file are `usage-analytics.diff`
  (`@@ -948,6 +948,9 @@`), `plugins-web-bridge.diff` (`@@ -951,6 +951,7 @@`) and
  `pairing-credentials.diff` (`@@ -955,16 +958,102 @@`). At 59 lines' distance the 3-line contexts do
  not overlap; a new patch applied last is clean. **Not** an extension of `plugins-web-bridge.diff` -
  a patch name states the capability it adds, and that one's rationale is about `PLUGIN_METHODS`.
- Header must record: 21/23 coverage, the two `catch`-swallowed cancel members, that no
  `MOBILE_RPC_METHOD_ALLOWLIST` change is made and that zero `jira.*` were on it, and that
  MainHttpClient is the Electron impl under `--serve`.
- Test named by the header, in the overlay: `src/renderer/src/web/web-jira-bridge.test.ts`,
  modelled directly on the existing `src/renderer/src/web/web-plugins-bridge.test.ts` - same
  `installBrowserGlobals` / `writeStoredRuntimeEnvironment` harness
  (`web-preload-api-test-harness`), same `mockRuntime` recording `{ method, params }`. Written from
  the symptom: assert `window.api.jira.status()` dispatches `jira.status` and returns the host's
  object, and that `window.api.jira.connect(args)` dispatches `jira.connect` with `args` intact.
  Both fail with the patch popped, where the calls resolve `undefined` and record no method. A
  negative case pinning `jira.*` off `MOBILE_RPC_METHOD_ALLOWLIST` belongs in the existing
  `mobile-rpc-allowlist.test.ts` alongside the plugin cases.

**Patch 2 - `bitbucket-web-bridge.diff` (new patch), plus one overlay file.**

- Overlay, new file: `src/main/runtime/rpc/methods/bitbucket.ts` - `BITBUCKET_METHODS` with
  `bitbucket.status`, `bitbucket.connect`, `bitbucket.disconnect`, importing `connectBitbucket` /
  `disconnectBitbucket` / `getBitbucketConnectionStatus` from `../../../bitbucket/credential-connection`
  and `_resetPreflightCache` from `../../../preflight/agent-detection`. Roughly the size of the
  existing overlay module `src/main/runtime/rpc/methods/sharing-surfaces.ts` (47 lines); zod params
  mirroring `normalizeConnectInput` (`ipc/bitbucket.ts:16-30`).
- Patch hunks: `rpc/methods/index.ts` (import + spread) and `web-preload-api.ts`
  (`bitbucket: createRuntimeNamespaceApi('bitbucket'),`).
- `bitbucket.connect` mints a host credential, so it stays off `MOBILE_RPC_METHOD_ALLOWLIST` -
  assert it with a negative case, as `plugins-web-bridge.diff` does.
- Test in the overlay, `src/renderer/src/web/web-bitbucket-bridge.test.ts` plus a method-level test
  beside the new RPC module.

**The scope-row fix is not this pane's to own.** It is the `hostPlatform` axis (shared dependency

## 6) in `shared/execution-host.ts`, read by `provider-account-scope.ts` and by `AccountsPane`. It

should be decided once, with `mobile-emulator` and `developer-permissions`, not seven times here.

### Blocks this shares with other sections

From `00-sections.md`'s shared-dependency list:

- **#5 `withFallback` / `createFallbackProxy` / `getFallbackResult` (`web-preload-api.ts:4534-4592`).**
  This pane is the list's `jira.status` entry. The identical mechanism produces `voice`'s dead
  `speech.*`, `plugins`' `install` / `refresh` / `remove`, and - found this pass and not previously
  recorded - `bitbucket.status` / `connect` / `disconnect`. Anything that turns the silent
  `undefined` into a visible refusal changes all four at once, and would turn the Jira card from
  "Not connected" into an honest error.
- **#6 the `hostPlatform` axis.** The "Account scope: Local Mac" row. Shared with `accounts`
  (`AccountsPane.tsx:414` and its own scope block), `mobile-emulator` and `developer-permissions`.
  One fix to `getCurrentLocalPlatform` / `getLocalExecutionHostLabel` moves all of them.
- **#7 patch ownership.** Neither patch proposed here touches `useSettingsNavigationMetadata.ts` or
  `Settings.tsx`, so neither can collide with `settings-nav-web-parity.diff`. Both touch
  `web-preload-api.ts`, which eight patches in the series already share; the hunk positions are
  checked above.
- Shared dependencies **#1, #2, #3, #4** do **not** apply. No gate, no `SettingsUpdate` key, no
  `syncRuntimeBackedSettings` entry: this pane persists nothing through `settings.set`. Its
  credentials land on the **host**, in `~/.config/orca/jira-sites.json` + `jira-tokens/` and the
  Bitbucket credential store - which is the right side, and is why the `.strict()` /
  localStorage trap that catches Browser, Notifications and Advanced does not catch this one.

Found this pass, not in `00-sections.md`'s list:

- **`createRuntimeNamespaceApi` (`web-preload-api.ts:2684`) is a shared seam in its own right.**
  Today it serves `hostedReview` and `linear`; `jira` and `bitbucket` are the next two. Any section
  whose preload gap is "a whole namespace whose RPC family already exists" is a one-line fix through
  it, and any change to it touches all of them.
- **`preflight.check` is shared with `tasks`.** `use-task-source-provider-readiness.ts:19-23` and
  `TasksPane.tsx` read the same `preflightStatus` slice. It works today; a change to the preflight
  cache-reset story would move both sections.
- **`store/slices/jira.ts` is shared with `tasks` - and `tasks` is marked "works".** `TasksPane.tsx`
  wires `checkJiraConnection` at `:99` and renders `JiraSetupSteps` at `:221-227`. Task Sources >
  Jira is the same defect through a second door: the pane renders, the Jira provider can never
  connect. The Jira one-liner fixes it too, with no work in the `tasks` section.
- **Outside settings entirely.** `runtime-jira-client.ts`'s non-test consumers are
  `store/slices/jira.ts`, `TaskPage.tsx:415` and `JiraIssueWorkspace.tsx:41`. The whole Jira feature
  - the Tasks page issue list, issue creation, the Jira issue workspace - is inert in the tile for
  this one reason, and live the moment the namespace exists. That is the largest capability any
  single line in this audit returns.
- **`_resetPreflightCache` (`preflight/agent-detection.ts:82`).** Named here because a Bitbucket RPC
  family must call it. It is already outside `ipc/`, so the "**Modules split out of
  `src/main/ipc/*`**" seam that `ssh` and `plugins` need has, for this case, already been done
  upstream.

### Unverified

- **The Bitbucket connect-dialog behaviour is derived from source, not observed.** `result.ok` on
  `undefined` throwing into the dialog's `catch` (`bitbucket-credentials-dialog.tsx:116,126,135`) is
  read, not measured. Probe that settles it: on the live tile, open Settings > Integrations >
  Bitbucket > Connect, submit any credentials, and read the dialog's error text - a `TypeError`
  message confirms it; a Bitbucket API error refutes it.
- **The Bitbucket disconnect no-op is likewise derived.** Probe: `window.api.bitbucket.disconnect()`
  from the tile console - `undefined` with no network frame confirms the fallback proxy. Not run:
  it is a mutating call on a shared host, and there is no Bitbucket credential to lose or to prove
  survived.
- **`jira.status` was not exercised over the wire.** The claim that the family answers rests on
  `rpc/methods/jira.ts` + `getStatus` (`jira/client.ts:58-72`) reading only `getSiteFile()` and
  `hasStoredToken` - file presence, no `getSecretStore()` call, so no keychain prompt - and on the
  host having neither file (measured). Probe: after the one-line patch, `window.api.jira.status()`
  from the tile should return `{ connected: false, viewer: null, sites: [], activeSiteId: null,
  selectedSiteId: null }`, not `undefined`.
- **Whether a real Jira connect succeeds end to end was not tested**, and cannot be without an
  Atlassian site and token. The XSRF/Chrome-UA reasoning above says it should; that is an argument,
  not a result.
- **Payload size on `jira.getIssue`.** With the namespace wired, the local branch uses the one-shot
  `jira.getIssue`, not the chunked `jira.getIssueStream` that the environment branch falls back
  onto (`runtime-jira-client.ts:33-49`). `emitJiraPayload` caps at `JIRA_PAYLOAD_MAX_CHARS` and
  chunks at `JIRA_PAYLOAD_CHUNK_CHARS` "because remote runtime WebSocket messages are capped at
  1 MiB" (`rpc/methods/jira.ts:99-110`). Whether an issue with large inline attachment images
  exceeds that cap on the one-shot path was not determined. Probe: fetch an issue with an embedded
  image over `window.api.jira.getIssue` and watch for a transport error.
- **`gh` / `glab` authentication state on the host was not probed.** Deliberately: it would mean
  inspecting the operator's credentials. The GitHub and GitLab cards' *mechanism* is established;
  which of their four states they currently display is not.
- **The latent crash if the wire is half-built.** `disconnectJira` (`store/slices/jira.ts:509-536`)
  and `testJiraConnection` (`:470-494`) both write `await jiraStatus(...)` straight into the store
  with no `try`, so an `undefined` there would set `jiraStatus: undefined` and crash the card's next
  render. Both are unreachable today because `connected` is never true in the tile. Recorded as a
  reason not to touch the render side without the wire; not observed.
- **Nothing was assembled or run.** No `quilt push`, no `mise run up`, no `vitest`, no build, no
  typecheck. The proposed patch was not written or applied.
- **Host reads only.** Directory listings, `ps`, and `/proc/793/environ` **key names**. No file
  contents, no credential values, no writes, no restarts.
