# Patch header audit — what the series claims versus what it does

> **Status: seven defects confirmed by failing tests, 2026-07-27. No production code has been
> changed.** Every patch header in `orca-server` was written after the fact and had never been
> checked against its own diff. Four subagents read all thirteen patches in full — header and every
> hunk — and judged each claim against the code. A second round wrote a red test per suspected
> defect. Every failing test in §7 was re-run by hand, not taken on an agent's word.

Scope: `mrkhachaturov/orca-server`, `patches/series` at Orca `v1.4.156`, thirteen patches, 85 unique
files, 91 modified and 23 created.

## How to read the verdicts

- **ACCURATE** — the diff does what the sentence says.
- **OVERSTATED** — directionally true, but the code does less, or in fewer places.
- **WRONG** — the diff does something else, or the opposite.
- **UNSUPPORTED** — the diff cannot show it either way.

**`UNSUPPORTED` is often an artifact of the method, not a defect.** A claim about pre-existing
upstream behaviour — say, that `mergeMobileSessionSnapshotTabs` keeps the cached tab — can never be
shown by a diff that does not touch that function. Those are marked below and are not counted as
problems. What matters is `WRONG`, `OVERSTATED`, and the omissions.

## 1. Headers that contradict the code

| Patch                       | Claim                                                                                    | Reality                                                                                                                                                                                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `floating-workspace-picker` | "Desktop is unchanged."                                                                  | `getFloatingWorkspaceDirectoryInputValue` now returns `resolvedFloatingWorkspacePath \|\| configuredPath` — a desktop display change. The patch also adds an `app:grantFloatingWorkspaceDirectory` ipcMain handler and matching `preload/index.ts` + `api-types.ts` entries. |
| `cli-registration`          | "All three mutate the host, so none of them is on the allowlist."                        | `cli.getInstallStatus` is a read probe. The conclusion is right; the premise is false. The patch's own test comment concedes "the status probe rides the same gate".                                                                                                         |
| `resource-manager`          | "The empty snapshot survives only as the fallback for when no environment is connected." | There is no environment check. It is a bare `.catch(() => createEmptyMemorySnapshot())` that swallows any rejection, and the patch's second test drives it with `new Error('runtime unreachable')`. Sibling stubs use `requireActiveEnvironmentOrNull()`; this one does not. |

Also unsupported as written: `cli-registration` quotes a warning string, "Orca CLI registration is
unavailable", that appears nowhere in the tree. The stub's real text is "CLI registration is managed
on the Orca server, not in the web browser."

## 2. Defects in the code, not the prose

Ranked by what a user would notice.

1. **`workspace-restore` clobbers half the host pointer.** The pointer is built as
   `session.activeRepoId ?? null`, and `rememberWebActiveWorkspace` is called from four sites, one of
   which is `session.patch` with a `Partial<WorkspaceSessionState>`. A patch carrying only
   `activeWorktreeId` writes `lastActiveRepoId: null`. No test covers it.
2. **`agent-cold-restore` inverts precedence.** `const startupAgent = coldRestore?.agent ??
tab.launchAgent` — a row from the hook cache overrides an explicitly configured `tab.launchAgent`.
3. **`agent-cold-restore` drops the prompt.** The resume branch passes no `prompt` /
   `allowEmptyPromptLaunch`, so `opts.agentPrompt` is silently discarded whenever a resume plan is
   built.
4. **`trusted-proxy-session` matches the endpoint too broadly.** `pathname === '/trusted-session' ||
pathname.endsWith('/trusted-session')` — the suffix arm matches any depth, e.g.
   `/assets/foo/trusted-session`. Separately, `HEAD /trusted-session` writes the credential JSON as a
   body, because the handler does not special-case HEAD after the `GET|HEAD` gate.
5. **`execution-owner` caches without invalidation.** `floatingWorkspacePathForResolution` is a
   module-level cache held for the page's lifetime and never cleared on an environment switch.
6. **`floating-workspace-picker` grants best-effort.** `try/catch {}` swallows a failed grant and
   stores the path anyway, so the UI shows a directory that was never authorised.
7. **`pairing-credentials`, two smaller ones.** `mobile.revokeDevice` is the only object schema
   without `.strict()`. `listDevices` and `listRuntimeAccessGrants` end in
   `.catch(() => ({devices: []}))`, so an authorisation failure renders as "nothing paired".

## 3. Patches that quietly do a second thing

The header names one capability; the diff carries two. None of these is wrong — they are unrecorded.

- **`agent-status-surface`** adds a push path: `subscribeAgentStatusChanges` from `main/index.ts`,
  and the runtime constructor subscribes, forcing
  `hydrateHeadlessMobileSessionTabsFromWorkspaceSession(…, {force: true})` plus a change
  notification **for every cached worktree on every hook change**.
- **`headless-orchestration-delivery`** also fixes PTY-exit dispatch failure: `onPtyExit` resolves a
  handle when no leaves exited and calls the newly extracted `failActiveDispatchForHandle`, which
  fails the dispatch and escalates to the coordinator. One of its four tests covers this.
- **`execution-owner`** adds a whole new RPC, `floatingWorkspace.markdownDirectory`, backed by a new
  `ensureFloatingMarkdownDirectory()`. It gives the shared `RemoteFileBrowser` a file-picking mode
  whose two hint strings are hardcoded English rather than routed through `translate(...)`. It widens
  `shouldCreateInBackground` for headless focus, and sends floating browser tabs unscoped.
- **`pairing-credentials`** reworks nine renderer files, removes upstream's `!isWebClient` block on
  the pairing-URL generator in `Settings.tsx`, pins `connectionMode: 'local-only'`, and adds a new
  browser-bundle dependency, `qrcode/lib/browser`. Its context is injected for **every**
  runtime-scope connection with no trusted-proxy condition, so mint and revoke are live on a plain
  `orca serve` — where the advertised address is then null.
- **`open-in-browser-editors`** makes `settings.get` strip `openInApplications` for mobile clients,
  widens the completeness rule for desktop as well, and issues a **Google favicon request** for URL
  rows. `URL_OPEN_IN_APP_FAVICON_DOMAINS` hardcodes the product ids `code-server` / `vscode-web`.
- **`cli-registration`** also changes the three WSL methods to a new `wslUnsupportedStatus`.

## 4. Test gaps

- `usage-analytics` has **no test at all** for `rpc/methods/usage.ts` or `createUsageApi`, unlike the
  sibling `cli` and `floating-workspace` patches which each added a method test.
- `runtime-seeded-settings` tests only the pure `pickRuntimeSeededSettings`. The load-bearing claims
  — the `isFirstVisit` gate, "nothing is written back", the widened `getClientSettings` — rest on
  review, not on a test.
- `workspace-restore` leaves uncovered the `?? localSession.*` fallback, the failed-RPC memo drop,
  the partial-`patch` null clobber above, and an unmentioned unconditional write of the pointer into
  browser localStorage.
- `execution-owner` names `web-preload-api.test.ts` in its header but does not touch it — that file
  is modified by `resource-manager`. It silently modifies `mobile-rpc-allowlist.test.ts`, which it
  does not name.
- `agent-cold-restore`'s test injects a constructor arg exposing `getAgentStatusSnapshot` while the
  code under test calls `getAgentStatusIpcRows()`; it passes only because that method wraps the
  injected function, so `enrichAgentStatusIpcPayload` is never exercised.
- `open-in-browser-editors` has no test for `OpenInMenuRow.tsx`, including the `!isPreset` gate that
  decides whether the URL field renders at all.

## 5. What the audit confirmed

Worth recording, because these are the claims other documents lean on.

- **Trusted-proxy security model holds.** The loopback bind is a single ternary and the non-trusted
  path is byte-identical to upstream. `/trusted-session` 404s a non-loopback peer, 503s before an
  offer exists, sets `Cache-Control: no-store`, and is absent when the mode is off. E2EE is untouched
  — `createPairingOffer` is reused unmodified and the client replaces only the transport endpoint.
- **Fail-closed pairing holds.** All six handlers in `methods/mobile-pairing.ts` open with
  `if (!ctx.trustedMobilePairing) throw`, and the context is injected only for runtime scope.
- **The mobile allowlist was never widened.** No patch touches `mobile-rpc-allowlist.ts`; every patch
  that adds methods adds an assertion that they are absent from it.
- **Agent status is resolved at the publish boundary only.** The single added line lives in the
  function returning `RuntimeMobileSessionTabsResult`; the producer hunk adds _only a comment_, and
  no other hunk stamps the field.
- **The import-cycle rule is respected.** `usage-analytics` does evaluate `z.enum(...)` at module
  scope, but over a value imported from the new leaf `src/shared/runtime-usage-providers.ts`, not
  from the hub.
- **Open In templates are restricted to http/https**, enforced at three layers and tested; no host or
  slug literal ships in the code.
- **The credential and per-device exclusions in seeding are enforced by assertion**, not merely by the
  shape of an allowlist. Caveat: the guard is a hand-maintained denylist of literal key names, so a
  newly added credential key passes unless someone adds it to both lists.

## 6. Numbers that did not survive checking

- **"of 183 `GlobalSettings` keys"** — measured directly on the pinned tag: **187**. The header's
  number does not reproduce and should not be quoted.
- **"eleven producers"** of the session-tab snapshot — the figure exists only in code comments;
  nothing in the tree was counted to confirm it.
- **"the way code-server's `--auth none` does"** — misleading about the mechanism. Nothing disables
  authentication: a real device credential is minted and the WebSocket handshake still verifies it.
  Only the delivery channel moved, from the URL fragment to a loopback fetch.
- **"adopted exactly once, on a browser's first visit"** — true in the code, but not covered by any
  test, and the "once" holds only after a call reaches `writeStoredSettings`; a run that returns
  early leaves the blob null and re-seeds on the next load.

## 7. Confirmed by red tests

Five test files, eight failing cases, all under `orca-server/lib/orca/`. Each file also carries a
green control case, so a failure is the defect and not a broken harness. The tests are **untracked
scratch**, named `*.audit.test.ts` — they are evidence, not yet part of any patch.

| #   | Defect                                               | Test file                                                                     | What failed                                                                                                                                | Live today                              |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| 1   | `workspace-restore` clobbers the repo pointer        | `src/renderer/src/web/web-preload-api-active-workspace-pointer.audit.test.ts` | after a worktree-only `session.patch`, `ui.set` received `lastActiveRepoId: null` instead of `'repo-1'`                                    | **yes** — on every worktree switch      |
| 2   | `/trusted-session` served from any depth             | `src/main/runtime/rpc/static-web-client-handler.audit.test.ts`                | `GET /assets/foo/trusted-session` from loopback → `200` with `{"pairingUrl":…}`, expected `404`                                            | **yes**                                 |
| 3   | `HEAD /trusted-session` returns a body               | same file                                                                     | body was the credential JSON, expected `undefined`                                                                                         | **yes**                                 |
| 4   | cold-restore outranks explicit `launchAgent`         | `src/main/runtime/headless-agent-cold-restore-precedence.audit.test.ts`       | tab configured `codex`, cache held `claude` → resolved `claude`                                                                            | **yes**, when a tab configures an agent |
| 5   | resume drops `agentPrompt`                           | same file                                                                     | argv was `claude '--dangerously-skip-permissions' '--resume' '<id>'`, prompt absent                                                        | latent — no caller passes both yet      |
| 6   | Resource Manager hides failures as "nothing running" | `src/renderer/src/web/resource-manager-memory-failure.audit.test.ts`          | an `ok:false` envelope resolved instead of rejecting; an `unauthorized` failure produced a snapshot byte-identical to an unpaired client's | **yes**                                 |
| 7   | Directory grant stores an unauthorised path          | `src/renderer/src/components/settings/floating-workspace-grant.audit.test.ts` | `updateSettings` was called once after the grant rejected with `EACCES`, expected zero calls                                               | **yes**                                 |

Run them with:

```bash
cd lib/orca && pnpm exec vitest run --config config/vitest.config.ts $(git ls-files -o --exclude-standard 'src/**/*.audit.test.ts')
```

### What the red tests added beyond the diff read

- **#1 is worse than the audit said.** The pointer is also written to browser localStorage _before_
  the active-environment guard, so the same `null` is burned locally. The restore path's fallback,
  `ui.lastActiveRepoId ?? localSession.activeRepoId`, is therefore not merely empty — it is poisoned.
- **#4 cannot be fixed by swapping the `??` operands.** The same branch passes
  `resumeProviderSession: coldRestore.providerSession`, so `tab.launchAgent ?? coldRestore.agent`
  would launch `codex` against a _claude_ session id. Agent and session must move together: only
  cold-restore when `!tab.launchAgent || tab.launchAgent === coldRestore.agent`.
- **#5 has a dead guard behind it.** `buildAgentResumeStartupPlan` takes no `prompt` parameter at
  all, and the guard `opts.agentPrompt && startupPlan.followupPrompt` can never fire because a resume
  plan always sets `followupPrompt: null`.
- **#6 kills a UI branch.** `memorySnapshotError` is set only when `getSnapshot()` rejects, and
  `ResourceUsageStatusSegment` derives `daemonUnreachable` from it. Because the web stub never
  rejects and never returns null, the "daemon not responding / Restart" banner is unreachable in the
  tile. The patch's own comment claims a gate — "fall back to the empty snapshot only when no
  environment is connected" — that was never written, while every sibling stub in the same file does
  gate on `requireActiveEnvironmentOrNull()`.
- **#7 compounds itself.** `getFloatingWorkspaceDirectoryInputValue` falls back to the _configured_
  path when the server resolve returns `''`, which is exactly what an unauthorised directory returns.
  The pane therefore displays the rejected path as if it were live.

### The deployment fact that shapes the fix for #2

A separate search established that **this deployment is subdomain-proxied, so the real external
prefix is empty**. The only statement of the URL shape in the tree is a comment in `web-pairing.ts`:
`<app>--<workspace>--<owner>.<domain>`. There is no `coder_app`, no `.tf`, no path-app template
anywhere, and the e2e health check hits the unprefixed root.

The prefix tolerance in the handler is therefore speculative, and it is half-built: only
`/web-index.html` and `/assets/**` survive a prefix, everything else 404s, and a prefixed URL with a
trailing slash and no filename 404s too. The client derives its base from the page's directory
(`new URL('trusted-session', href)`), so a path-app URL without a trailing slash would resolve one
segment short — untested and unreachable under the subdomain deployment.

Hardcoding a prefix is not an option: it violates the project invariant that URL shapes live in the
operator's template, never in a constant a patch adds. **Removing the suffix arm entirely and
accepting only `/trusted-session` is the smaller, more honest change** — it closes the leak and
describes what is actually supported.

### The approach itself is sound, and forced

Worth stating because the header's own wording obscures it. code-server's `--auth none` is literally
`case AuthType.None: return true` in `src/node/http.ts` — no token, no key, the proxy is the only
gate. We use the same trust model: trusted mode binds the WS listener to loopback and treats the
bind as proof the proxy already authenticated.

What we cannot copy is skipping the credential. An Orca pairing offer carries `publicKeyB64`
alongside `deviceToken`, and `new WebRuntimeClient(offer, …)` cannot be constructed without it — the
credential is the channel's key material, not an authorisation check. "Auth none" would mean "no
encryption". So the credential can only be **delivered**, never skipped, and moving delivery from
the URL fragment to a loopback-gated endpoint is the minimal way to do that behind a fixed tile URL.

So the fix list for the endpoint is small and none of it is architectural:

1. Accept only `/trusted-session`; drop the `endsWith` arm. Neither widens who can reach it — a
   non-loopback peer still gets 404 — but a credential should not be reachable from an arbitrary
   path, least of all from under `/assets/`.
2. Return no body for `HEAD`, the way the static branch already does.
3. Rewrite the `--auth none` sentence in the patch header. It describes the outcome and misstates the
   mechanism, and that mislabel already propagated into a derived document as a wrong plan for an
   upstream pitch.

## 8. What to do next

Ordered so that nothing lands without evidence, and the working series stays working. The baseline
to preserve is measured: 8/8 series-integrity checks, 1120 tests in `test-unit`, 20 004 in
`test-scope`, and a live tile.

**A. Headers — zero code risk.** `quilt header -e` rewrites only the free text above the first
`Index:` line, so no hunk moves and byte-identity still holds. Fix the three contradictions in §1,
the overstated claims in §5 of the four-agent report, and drop the numbers in §6. Do this first: it
is the cheapest, and it stops the headers from misleading the next reader while the code work
proceeds.

**B. Fixes, one patch at a time, red test as acceptance.** Suggested order:

1. **#2 and #3 together** — one handler, one patch, both about credential exposure.
2. **#1** — smallest correct change: build the pointer from keys actually present in the patch
   rather than coercing absent keys to `null`, and move the localStorage write behind the same
   condition.
3. **#6 and #7 together** — both are "a failure rendered as success"; both fixes are a gate the
   sibling code already demonstrates.
4. **#4 and #5 together** — same path, and #4's fix must not be a naive operand swap.

For each: `quilt push` to that patch, edit, promote the audit test into the patch with `quilt add`,
`quilt refresh`, then `./ci/dev/test-scripts.sh && ./ci/dev/test-unit.sh && ./ci/dev/test-scope.sh`.

**C. Close the test gaps from §4** — `usage-analytics` has no method test at all; the seeding
patch's load-bearing claims are untested; `execution-owner` names a test file it does not touch.

**D. Correct the derived documents** — `.claude/findings.md` carries the unverified "183 keys"
(measured: 187), the "eleven producers" figure, and the misleading `--auth none` framing.

**Housekeeping:** the five `*.audit.test.ts` files are untracked scratch in the submodule. Each is
promoted into the patch it proves during step B. None is deleted: a defect that was worth proving is
worth keeping proven.

## 9. "We had tests" — why that was true and meaningless

This is the lesson worth more than the seven defects.

All thirteen patches carry at least one test file. Twelve of thirteen name their tests in the header.
`ci/dev/test-unit.sh` derives the list straight from the series and runs 1120 tests, all green. By
every measure anyone was applying, the series was tested.

It was not. Three separate things were wrong, and each of them looked fine:

**The tests were never a gate.** Until 2026-07-27, `test-unit.sh` and `test-e2e.sh` existed but were
called by no workflow. Nothing ran them on a push. A test that nothing runs is a document.

**"Carries a test file" is not coverage.** `usage-analytics` ships eight new RPC methods and its only
test asserts that they are absent from the mobile allowlist — the capability itself has no test at
all. `runtime-seeded-settings` tests the pure key-picking function while every load-bearing claim
(the first-visit gate, "nothing is written back") rests on review. `workspace-restore` tested a full
session write, which is why the tile does restore on restart, and never tested the partial patch that
destroys the pointer.

**The worst case: a test that asserts the defect.** `resource-manager` ships
`it('falls back to an empty snapshot instead of throwing when the runtime cannot answer')`. It mocks
a client that rejects with `runtime unreachable` and asserts `totalCpu` is `0`. The test is green.
The test is the bug. It was written by reading what the code does, so it froze the swallow in place
and made the "daemon not responding" banner permanently unreachable in the tile — while the patch
header, three lines above, promised a gate on "no environment connected" that nobody wrote.

### The rule

**A patch that is not covered by a test that fails without it does not ship.** Not "has a test
file" — fails without the patch. That is the only definition that cannot be satisfied by accident.

Three things follow, in the order they bite:

1. **Write the test from the symptom, never from the implementation.** Every header already carries a
   _To test_ line describing what a user sees when the patch is absent. That sentence is the test.
   Reading the code first is how `resource-manager` got a green test for a defect.
2. **Assert the behaviour you want, then watch it fail.** A test that has never been red has proved
   nothing about the code — only that it agrees with it.
3. **Every capability the patch adds needs its own case.** Eight RPC methods and one allowlist
   assertion is not eight tested methods.

### What can be enforced mechanically, and what cannot

`test/scripts/series.bats` can assert that every entry in `patches/series` adds or modifies at least
one `*.test.ts`. That gate does not exist today and should. Be clear about its limit: **all thirteen
patches would pass it right now**, including the four this audit found untested in substance. It
catches the empty case and nothing more.

The rest is not mechanizable and belongs in review: does the test fail without the patch, does it
assert the intended behaviour or the observed one, and is every new capability covered rather than
just the file it lives in.
