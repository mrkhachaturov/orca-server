# accounts — what it needs to work in the browser

Paths relative to `lib/orca/`; line numbers are `git -C lib/orca show v1.4.190:<path>` unless a patch
is named. Live probes are on the operator's Coder workspace `ceo/pink-planarian-96` (`orca-server`
4.190.1, upstream pin `v1.4.190`, Linux host), reached over `coder ssh` only. No browser was started
and no tab was opened.

## State today

**Tile, published v4.190.1: listed, renders, every wire dead.** `00-sections.md` measured the
section as present with `[data-settings-section]` nodes ("renders partially"). It is not a blank
pane and it is not gated: `accounts` is absent from `showDesktopOnlySettings` in both gate 1 and
gate 2, so the row lists and `<AccountsPane>` mounts (`Settings.tsx:1279`, behind
`isSectionMounted('accounts')` only).

What renders is the full pane — Claude, Codex, Gemini, OpenCode Go, MiniMax and Grok sections, each
with its buttons enabled. What it is showing is the web preload's constant stub, not the host.

`createAccountsApi()` (`web-preload-api.ts:3247`) is bound to **both** `codexAccounts` and
`claudeAccounts` (`:909-910`). Its body is a literal: `list`, `add`, `reauthenticate`, `remove`,
`select` all `Promise.resolve(empty)`, `cancelPendingLogin` resolves `false`. It contains no `call`,
no `callRuntimeResult`, no wire of any kind. This is not `createFallbackProxy` — it is an explicit
desktop-only stub, so shared-dependency 5 does not describe it and the `withFallback` reasoning does
not apply.

Consequences, read from both sides of the call:

- Both rosters are empty and the Codex **System default** identity is `undefined`, whatever the host
  holds.
- **Add Account** is enabled — `isRemoteAccountScope` is false (below), `accountRuntimeUnavailable`
  is false on Linux (`AccountsPane.tsx:511`) — and clicking it resolves the empty state with no
  error. The spinner runs, `syncClaudeAccounts(empty)` runs, nothing is added, nothing is said.
  Same for **Re-authenticate**, **Remove** and **Switch**.
- `minimaxCredentials.saveCookie` (`:3224`) rejects with "MiniMax cookie storage is only available
  in the desktop app." — the one honest surface in the pane.
- `grokAccounts.getStatus` (`:3234`) always answers `signedIn: false`, so Grok reads "not signed in"
  on a host whose `~/.grok/auth.json` may be fine.
- `codexConfigSync.status` (`:916`) is hardcoded `{ state: 'synced' }`, so the pane's stall warning
  can never fire in the tile.
- `createRateLimitsApi` (`:3191`) answers a constant empty `RateLimitState`, so every usage bar and
  every `minimaxCookieConfigured` / `grokAuthConfigured` badge in the pane is blank.

**The host, measured, over the same RPC the tile would use** (AppImage shim
`squashfs-root/resources/bin/orca-ide`, local socket, `xvfb-run`):

```text
$ orca-ide account list --json          # = accounts.list
  ok: true
  claude { accounts: [], activeAccountId: null, activeAccountIdsByRuntime: {...} }
  codex  { accounts: [], ..., systemDefault: { hasAuth: false, authKind: "none", email: null } }
  rateLimits { claude..grok: null, minimaxCookieConfigured: false, grokAuthConfigured: false,
               claudeTarget: {runtime:"host"}, codexTarget: {runtime:"host"},
               inactiveClaudeAccounts: [], inactiveCodexAccounts: [] }
```

The headless `orca serve` runtime answers the complete snapshot. `setAccountServices` runs in the
shared `app.whenReady()` startup path (context in `patches/web-share-surfaces.diff`, hunk at
`main/index.ts:2847`), and this probe proves it empirically on the deployed artifact.

The host currently holds **zero** managed accounts, so today's empty tile happens to agree with the
host. That agreement is a coincidence of this host's state, not evidence the read works.

**Desktop, for contrast:** the same JSX, with `window.api.claudeAccounts` / `codexAccounts` bound to
`ipcMain` handlers (`main/ipc/claude-accounts.ts:6-17`) over `ClaudeAccountService` /
`CodexAccountService` — real rosters, working switch, working remove, and an **Add Account** button
that spawns `claude login` / `codex login` in a PTY on the desktop and registers the result.

## Which gate, and why

**None of the four.** Gate 1 and gate 2 both leave `accounts` ungated. Gate 3 is `setup-guide` only.

**Gate 4 does not fire.** `AccountsPane.tsx:414` is the pane's only `isWebClientLocation()` site:

```text
const remoteAccountScopeNotice =
  isRemoteAccountScope && !isWebClientLocation() ? <ProviderHostScopeControl … /> : null
```

`isRemoteAccountScope` is `hasRemoteProviderAccountOwner(settings)` (`:383`), which is
`getActiveRuntimeTarget(settings).kind === 'environment'` — i.e. `settings.activeRuntimeEnvironmentId`
non-empty (`runtime/runtime-client-target.ts:5-10`). On the tile that value is **empty**:

- The web preload seeds it `null` (`web-preload-api.ts:3863`, inside `getStoredSettings`'s defaults)
  and only `settings.setActiveRuntimeEnvironmentPreference` ever sets it. Its two callers are user
  actions — the Remote Orca Servers pane's default-runtime switch (`RuntimeEnvironmentsPane.tsx:723`)
  and the composer's runtime picker (`useComposerState.ts:3418`). Nothing auto-selects it: the
  client's own paired runtime lives in the preload-local `activeEnvironment`
  (`web-preload-api.ts:192`), a different variable.
- Measured: `00-sections.md` recorded **"Account scope: Local Mac"** live in the tile.
  `getProviderAccountScope` returns `getLocalExecutionHostLabel()` **only** when
  `activeRuntimeEnvironmentId` is empty (`settings/provider-account-scope.ts:41-53`), and
  `'Local Mac'` is the `darwin` branch of `shared/execution-host.ts:36` reading the *renderer's*
  platform. That observation settles both facts at once: no active runtime environment, and the
  operator drove from a Mac browser.

So `remoteAccountScopeNotice` is `null` on the tile — and it is equally `null` on a desktop with no
remote server, for the same reason. The `isWebClientLocation()` half never gets evaluated. Phase 0's
attribution of this section to gate 4 is **wrong**; that check is dead code on the deployed tile.

**The actual mechanism is a fifth one:** an explicit constant stub in the web preload, distinct from
both the render gates and `createFallbackProxy`. There is nothing to open. There is only a namespace
to wire.

Order, since there is no gate: wire the preload first; no gate change precedes or follows it.

## What the pane actually needs

The device scope decides what is reachable, and it is **measured**, not assumed.
`patches/trusted-proxy-session.diff` mints the tile's credential with `scope: 'runtime'`
(`buildTrustedSessionOffer`, patch line 347). Live confirmation, `~/.config/orca/orca-devices.json`
on the host: every `"name": "Web session 8/28/2026"` entry carries `"scope": "runtime"`,
`"pairingReach": "this-computer"`. Therefore:

- `runtime-rpc.ts:1656` (`device.scope === 'mobile' && !MOBILE_RPC_METHOD_ALLOWLIST.has(...)`)
  **does not constrain the tile at all.** The three allowlisted members named in the brief
  (`selectClaude`, `selectCodex`, `selectCodexForTarget`) are what a *phone* gets; the web client
  gets the whole family, `removeClaude` and `removeCodex` included, neither of which is allowlisted.
- `clientKind` is `device.scope` (`runtime-rpc.ts:1722`), so for the tile it is `'runtime'`, which is
  `!== undefined`. That is exactly the guard on `accounts.addClaudeFromConfigDir` (`accounts.ts:153`)
  and `accounts.addCodexFromHome` (`:167`): both **throw** for the tile — "Adding … accounts is only
  available on the Orca host runtime." They are local-socket-only by design.

| what the pane needs | wire | state today | how established |
| --- | --- | --- | --- |
| Claude + Codex roster, active ids, Codex `systemDefault` | `accounts.list` / `accounts.subscribe` (`accounts.ts:100,180`) | **exists and answers** | `orca-ide account list --json` on the live host returned the full snapshot |
| live roster refresh | `accounts.subscribe` streaming; web preload already has a generic streaming helper (`runtimeEnvironments.subscribe` → `client.subscribe`, `web-preload-api.ts:1598`) | **exists**, unused on the local branch | read both sides |
| switch account | `accounts.selectClaude` / `selectCodex` / `selectCodexForTarget` (`:114,119,126`) | **exists**, mobile-allowlisted, runtime-reachable | source + allowlist + live device scope |
| remove account | `accounts.removeClaude` / `removeCodex` (`:138,143`) | **exists**, runtime-scope only — correct for the tile | source + live device scope |
| usage bars, `minimaxCookieConfigured`, `grokAuthConfigured`, inactive-account caches | the `rateLimits` member of the same `accounts.*` snapshot (`orca-runtime.ts:14734`) | **exists**, carried on a wire the pane already needs | present in the live `--json` payload above |
| **Add Account** (Claude) | none reachable. `accounts.addClaudeFromConfigDir` refuses `clientKind !== undefined`; the desktop's PTY login is `ipcMain`-only | **absent over the wire** | `accounts.ts:153`; live device scope `runtime` |
| **Add Account** (Codex) | same | **absent over the wire** | `accounts.ts:167` |
| **Re-authenticate** / **Cancel pending login** | no RPC method of any name | **absent** | `ACCOUNT_METHODS` enumerated in full above; nothing matches |
| Grok sign-in detail (email, teamId, tokenFresh) | no `grok.*` family anywhere in `rpc/methods/` | **absent**. Only the boolean `grokAuthConfigured` rides the accounts snapshot | enumerated `rpc/methods/`; grep for `grok` hits only `client-ui-schemas.ts` status-bar keys |
| MiniMax cookie save/clear | no `minimax*` family | **absent**. Only `minimaxCookieConfigured` rides the snapshot | same |
| Codex config-sync warning | no `codexConfigSync` RPC; desktop reads the host filesystem in `main/ipc/codex-config-sync.ts:16` over `codex/config-sync-stall.ts` | **absent** — a `defineMethod` away, the underlying module is already Electron-free | read the IPC file; its only `electron` import is `ipcMain` |
| `geminiCliOAuthEnabled`, `opencodeSessionCookie`, `opencodeWorkspaceId` | `settings.update` | **stubbed by omission** — absent from both `syncRuntimeBackedSettings` (`web-preload-api.ts:3960`) and `SettingsUpdate` (`client-ui-schemas.ts:128`, `.strict()`) | read both lists key by key |
| `minimaxGroupId`, `minimaxUsageModels` | `settings.update` | **works** — the only two pane keys on the six-key allowlist, and both present in `SettingsUpdate` (`:159-160`) | same |
| `localAccountRuntime` / `localAccountWslDistro` (Account Location row) | `settings.update` | **absent from both lists**, but the row only renders when `wslSupportedPlatform` — false on a Linux host, so inert today | `AccountsPane.tsx:654`; host is Linux |

Building blocks from `00-building-blocks.md`: none of the nine ports is the blocker. The account
services are ordinary runtime services already installed on the headless path. The one port that
would matter if the add flow persisted a new credential shape is **SecretStore**, and it does not —
`ClaudeAccountService` already owns its own sealing.

## Verdict

**Needs a wire built first** — but the two halves are very different sizes.

- **Read, switch, remove: the wire already exists and answers.** No new RPC method, no allowlist
  change, no host code. `createAccountsApi()` has to stop being a constant and start calling
  `accounts.list` / `accounts.subscribe` / `accounts.select*` / `accounts.remove*`, which the tile's
  `runtime`-scope credential is already authorised for. Measured answering on the deployed host.
- **Add and re-authenticate need a new wire.** `accounts.addClaudeFromConfigDir` and
  `addCodexFromHome` exist but refuse every token-authenticated client, and there is no RPC at all
  for the interactive login or its cancel.

That second half is smaller than it looks, because **upstream already built the headless add flow**
and it runs on this host today:

```text
$ orca-ide account add --help
  Runs the agent login (`claude login` / `codex login`) in this terminal, then registers
  the account with the local Orca runtime.
  Codex uses device authorization so the browser can complete sign-in from a different machine.
```

`cli/handlers/account.ts:182-254` is the whole recipe: `mkdtemp` a config dir, run
`claude auth login --claudeai` with `CLAUDE_CONFIG_DIR` set (or `codex login --device-auth` with
`CODEX_HOME`), then `client.call('accounts.addClaudeFromConfigDir', { configDir })`. The Codex path
is *explicitly* designed for a browser on a different machine — the exact orca-server shape. The
tile already runs real host PTYs.

Not "genuinely cannot work in a browser": the comment at `accounts.ts:93` that add/re-auth "need a
desktop browser" describes upstream's two-machine model, where the login would authenticate the
laptop rather than the server. On orca-server the client *is* the server's own browser, and the CLI
beside it proves the flow is headless-capable.

## Size of the work

Two patches, in this order.

**1. `accounts-web-bridge.diff` — new patch, modelled line for line on `plugins-web-bridge.diff`.**

- Touches one file: `src/renderer/src/web/web-preload-api.ts`. Rewrite `createAccountsApi()`
  (`:3247`) so `list` calls `accounts.list`, `select` calls `accounts.selectCodexForTarget` /
  `accounts.selectClaude` and `remove` calls `accounts.remove*`; leave `add`, `reauthenticate` and
  `cancelPendingLogin` rejecting **honestly** rather than resolving empty. Replace
  `createRateLimitsApi`'s (`:3191`) `get` / `refresh` with the `rateLimits` member of the same
  snapshot, and `createGrokAccountsApi` (`:3234`) / `createMiniMaxCredentialsApi` (`:3224`) `getStatus`
  with the snapshot's `grokAuthConfigured` / `minimaxCookieConfigured` booleans.
- `codexAccounts` and `claudeAccounts` share one factory today; they need different RPC names per
  provider, so it becomes `createAccountsApi('claude' | 'codex')` or two factories.
- **Patch-ordering care.** `plugins-web-bridge.diff` and `usage-analytics.diff` both carry
  `codexAccounts: createAccountsApi(),` as *context* around `:909`. Editing the function bodies down
  at `:3191-3260` and not the API-object literal keeps this patch's hunks off their context and out
  of a restack fight. If the factory signature changes, the `:909-910` call sites must change too —
  order this patch **after** both, and expect one shared context line.
- No allowlist change. `accounts.remove*` mutates host state and must stay off
  `MOBILE_RPC_METHOD_ALLOWLIST`; assert that with a negative case in
  `src/main/runtime/web-share-mobile-scope.test.ts`'s sibling, the way `plugins-web-bridge.diff` does.
- Test: new overlay file `src/renderer/src/web/web-accounts-bridge.test.ts`, named in the patch
  header (`series.bats` requires it). Write it from the symptom — "the tile lists the host's Claude
  accounts and a switch sticks across reload" — not from the preload. Red with the patch popped
  because the stub resolves `[]`.

**2. Add and re-auth over the wire — a second, larger patch, only after (1) ships.** Two shapes,
pick one in its own audit:

- *Reuse the CLI recipe.* New methods `accounts.startClaudeLogin` / `startCodexLogin` in
  `ACCOUNT_METHODS`, streaming the login PTY's output the way `accounts.subscribe` streams
  snapshots, then reusing the existing `addClaudeFromConfigDir` / `addCodexFromHome` internals. The
  `clientKind !== undefined` refusal at `accounts.ts:153,167` is unique to these two methods
  (`grep 'clientKind !== undefined'` over `rpc/methods/` hits only `accounts.ts` and one unrelated
  passthrough in `agent-session.ts:213`), so relaxing it is a contained, auditable decision — but it
  is a **privilege decision**, not a plumbing one: it lets a runtime-scope client capture a host
  filesystem path. It must stay off the mobile allowlist and should probably stay off any non-web
  runtime credential too.
- *Refuse honestly instead.* Ship (1), and make the tile's **Add Account** button say "run
  `orca account add` on the host" rather than silently doing nothing. Strictly worse than the above
  as a capability, strictly better than today, and a one-line change inside (1).

`codexConfigSync` is a third, tiny patch or a rider on (1): one `defineMethod` wrapping
`getCodexConfigSyncStatus` + `getMirroredHostHomePathForStatus`, neither of which imports Electron.

Not `settings-nav-web-parity.diff`: no gate in this section moves, and shared-dependency 7 keeps
`Settings.tsx` under one owner.

## Blocks this shares with other sections

From `00-sections.md`'s shared-dependency list:

- **(3) `syncRuntimeBackedSettings` / (4) `SettingsUpdate` `.strict()`.** `geminiCliOAuthEnabled`,
  `opencodeSessionCookie` and `opencodeWorkspaceId` are on neither list, so those three rows of this
  pane accept edits into browser localStorage and never reach the host. Identical failure to
  **browser**, **notifications**, **advanced**, **appearance** and **input**. Widening either list is
  one shared change that fixes a row in all six panes — and, per (4), anything added becomes
  phone-reachable, so `opencodeSessionCookie` (a credential) argues for the
  `settings.updateSharingCapabilities` treatment `web-share-surfaces.diff` gave the sharing flags
  rather than a plain `SettingsUpdate` key.
- **(5) `createFallbackProxy`.** Does *not* apply here, and that is worth recording: `accounts` is
  the counter-example. Its namespaces are present and hard-stubbed, so `withFallback` never sees
  them. **developer-permissions** and the **rateLimits**/**grok**/**minimax**/**codexConfigSync**
  members are the same fifth mechanism. Any audit that reasons "the key is absent from the preload,
  therefore the fallback proxy" will get all of these wrong in both directions.
- **(6) The `hostPlatform` axis.** `getHostRuntimeLabel()` (`AccountsPane.tsx:209`) and
  `getRendererAppPlatform()` both read `navigator.userAgent` / the preload's browser-derived
  `platform.get()` (`web-preload-api.ts:619-627`, returns `getBrowserPlatform()`), so the
  Account Location row and every "This device" label in this pane name the *browser's* OS while the
  accounts live on the host. Same defect class as `mobile-emulator` and `developer-permissions`, and
  it is what produced the "Local Mac" string phase 0 saw on a Linux host. On a Windows *browser*
  against a Linux host, `wslSupportedPlatform` and the WSL distro picker would be driven by the wrong
  machine — untested, and the reason `windowsTerminalCapabilities.hostPlatform` exists.

Found here, not in the phase-0 list:

- **`runtime-provider-accounts-client.ts` is shared with the status bar.** `StatusBar.tsx` is the
  only other consumer of `fetchProviderAccountsSnapshot` / `selectCodexProviderAccount`. Fixing
  `createAccountsApi` repairs the tile's **status-bar account switchers** at the same time — a
  capability outside Settings entirely. Nothing else regresses: `CodexRestartChip.tsx`,
  `use-feature-wall-completion.ts`, `useIpcEvents.ts`, `lib/codex-session-restart.ts` and
  `store/slices/rate-limits.ts` all read the same stubbed namespaces and can only improve.
- **`accounts.list` carries the whole `RateLimitState`.** One wire fills the Claude, Codex, Gemini,
  OpenCode Go, MiniMax, Kimi, Antigravity and Grok usage readouts wherever they appear — the pane,
  the status bar, and the **appearance** pane's status-bar provider toggles. `stats` is *not* on this
  wire; it uses the separate `usage.*` family and already works.
- **The device-scope fact is section-agnostic.** "The tile is `scope: 'runtime'`, so
  `MOBILE_RPC_METHOD_ALLOWLIST` does not gate it" applies to every section in this audit. Any report
  reasoning "not on the mobile allowlist, therefore the tile cannot call it" is wrong.

## Unverified

- **The pane's live pixels were not seen.** Everything above about what the tile *draws* is read
  from `AccountsPane.tsx` plus `00-sections.md`'s measurement that the section renders. The probe
  that would settle it: open Settings > AI Provider Accounts on the tile and read
  `[data-settings-section="accounts"]`, checking (a) that all six provider sections are present,
  (b) that **Add Account** is enabled, (c) that no "Account scope:" row appears.
- **The silent-no-op Add.** Established by reading both sides — `createAccountsApi().add` resolves
  `empty`, `runClaudeAccountAction` then calls `syncClaudeAccounts(empty)` with no error branch. Not
  observed. Probe: click **Add Account** in the tile and confirm the spinner stops with no toast, no
  console error and no new row.
- **The roster read is untested against a non-empty host.** This host has zero managed accounts, so
  "the tile shows `[]`" and "the host has `[]`" are indistinguishable live today. Probe: run
  `orca-ide account add --agent codex` on the host to register one account, then reload the tile —
  the pane should still show none, and the status bar switcher too.
- **`activeRuntimeEnvironmentId` is empty on the tile** is inferred from the "Local Mac" string
  `00-sections.md` recorded plus `provider-account-scope.ts`'s branch structure, and from the fact
  that only two user actions ever set it. It lives in the browser's localStorage, so the host has no
  copy and `coder ssh` cannot read it. Probe: `window.api.settings.get().then(s =>
  s.activeRuntimeEnvironmentId)` in the tile console. If it is non-null, this section takes the
  remote branch instead, gate 4 *does* fire, and the read half already works — a different report.
- **Whether `claude login` / `codex login` actually complete in this host's environment** was not
  attempted. `orca-ide account add --help` was read; the command was not run, because it mutates
  host credential state.
- **`orca-ide account list` reaches the running `serve` daemon** rather than starting its own
  runtime: inferred from the `o-793-f3da.sock` naming (pid 793 is the serve process) and from
  `account add --help`'s "Requires the Orca runtime to be running on this machine". The socket
  handshake was not traced.
- **No gate was run.** Nothing assembled, no `quilt push`, no `mise run up`, no `vitest`, no build.
  The patch shapes in **Size of the work** are designs, not applied hunks; the context-collision
  claim about `plugins-web-bridge.diff` / `usage-analytics.diff` is read from the `.diff` bodies and
  was not proved by a restack.
