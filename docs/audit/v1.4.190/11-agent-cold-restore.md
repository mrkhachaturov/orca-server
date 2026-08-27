# agent-cold-restore — v1.4.190 re-derivation

## Problem

After a workspace restart, opening an agent pane in the tile renders its full transcript in chat
view while the composer writes into a shell (`bash: command not found`). The pane exists and its
history is addressable, but the agent process behind it is dead and nothing relaunches it against
its old provider session.

## Still present at v1.4.190

**yes.**

- `ensureAgentSession` still refuses every non-renderer request outright:
  `src/main/runtime/orca-runtime.ts:27758-27760` — `if (request.kind === 'automatic') throw new
  Error('agent_session_resume_not_authorized')`, comment unchanged ("Legacy renderer sleep records
  are migration evidence, not host authority"). No new RPC method appeared beside it: the method
  list in `src/main/runtime/runtime-rpc.ts` is byte-identical between v1.4.188 and v1.4.190.
- The materialize branch the tile reaches still launches an agent only from `tab.launchAgent`:
  `src/main/runtime/orca-runtime.ts:8866`. The whole `activateMobileSessionTab` region is untouched
  between the tags (no diff hunk between `@@ -5695 +5709 @@` and `@@ -10209 +10237 @@`).
- Even when `tab.launchAgent` is set, that branch calls `resolveMobileSessionTerminalCommand`
  (`:28949`), which builds `buildAgentStartupPlan` (`:28995`) — a **fresh** session, never
  `buildAgentResumeStartupPlan`. It can start an agent; it can never resume one.
- The headless tab the tile sees carries no resume identity: `buildHeadlessMobileSessionTerminalTabs`
  (`:8283-8327`) emits `launchAgent` only when the persisted tab record has it and never emits
  `agentStatus`.
- The web client cannot supply the request either. `sanitizeWebRuntimeWorkspaceSession`
  (`src/renderer/src/web/web-workspace-session.ts:4-18`) persists exactly four fields and is
  unchanged at the tag, so `state.sleepingAgentSessionsByPaneKey` — the only input to
  `resumeSleepingAgentSessionsForWorktree` (`src/renderer/src/lib/resume-sleeping-agent-session.ts`)
  — is empty in the browser after a restart.

The tile does reach this call site: `remote-runtime-pty-transport.ts:541-560` opens a mirrored host
pane with `session.tabs.activate`, which is `activateMobileSessionTab`.

The four v1.4.190 resume fixes answer "how to resume", never "which session":

| commit | what it moved |
| --- | --- |
| #15879 `7ce11dcf55` | `copilot` added to `RESUMABLE_TUI_AGENTS`, `extractAgentProviderSession` and `getAgentResumeArgv` (`src/shared/agent-session-resume.ts`). No runtime file. |
| #15883 `b2902cb61e` | `kimi` added the same way, plus the client-side skew probe `agent-resume-host-authority-capability` and one new capability string. Renderer only. |
| #15998 `e50cc309c3` | tui-idle classification reads the visible grid, not scrollback. Unrelated to resume identity. |
| #15644 `da6b9d8065` | tab **retention** across graph syncs; `persistHostSessionBinding` becomes unconditional (`:28283-28292`, `:28326-28331`); renderer-side mirror hydration/liveness. |

## 15644 makes the symptom *more* reachable, not less: the tab row now always survives, so a

restarted host reliably presents a live-looking pane with a dead agent behind it.

### Who owns this logic now

**no upstream owner** — no block in `00-building-blocks.md` owns it, and there is no upstream
caller that turns a headless pane's resume identity into a resume.

Upstream does own the **identity half**, and our patch duplicates part of it. `toMobileSessionTabsResult`
(`:33619`) resolves, from the same agent-hook rows and the same accessors:

- the row fetch — `getHookRowsForPane` closure (`:33628-33643`): `getAgentProviderSessionRowsForPaneFn`
  first, `indexAgentStatusRowsByPaneKey(getAgentProviderSessionSnapshotFn())` as fallback;
- the pane's owning agent — `resolvePaneAgentOwner` (`src/shared/pane-agent-owner.ts:45`), documented
  as "the single authoritative resolver for which agent owns this pane";
- the agent/session pairing rule — `resolveCompatibleAgentTypeForOwner`
  (`src/shared/agent-title-owner.ts:112`) plus `hookSessionMatchesRenderer` (`:33745-33756`), which is
  upstream's own spelling of our "agent and provider session must move together";
- publication — `buildPtyMobileAgentStatus` (`:34012`), whose header states the headless case
  explicitly: "only the hook payload does, and headless serve has no renderer to publish
  `tab.agentStatus`".

What is missing upstream is only the consumer. `ensureAgentSession` is still the sole entry and still
renderer-shaped.

**`canRecoverPersistentLocalPtys` does not gate this capability.** Its only two read sites are
`refreshRestoredOrchestrationAuthority` (`:4375`) and the recovery loop in
`reconcileLegacyWorkerTerminalsNow` (`:4700`) — both about re-adopting a PTY the terminal daemon is
still hosting. Cold restore is the disjoint case: the PTY is gone and a new one spawns with resume
flags. Desktop is `() => getDaemonProvider() !== null` (`src/main/index.ts:2722`), **unchanged** from
v1.4.188:2656; orcad is `() => false` (`src/main/orcad/orcad-entry.ts:142`). The consequence is about
frequency, not correctness: on orcad there is no daemon, so *every* agent pane is cold after a host
restart and this patch is the only thing that restores any of them. Our AppImage is the Electron
`--serve` host, so PTYs may be recovered when the daemon is up — the patch is the fallback for when
it is not, and becomes mandatory the day the artifact moves to orcad.

### Verdict

**keep** — the request-supply half has no upstream owner and no new non-renderer path appeared, but
shrink two things: the third hunk is whitespace-only, and the agent/session pairing rule hand-rolls
what `resolvePaneAgentOwner` + `resolveCompatibleAgentTypeForOwner` already decide.

### Correct shape at v1.4.190

Same call site, same seam, three concrete changes.

1. **Drop hunk 3 entirely.** `patches/agent-cold-restore.diff` `@@ -29091,16 +29138,16 @@` re-indents
   the `buildAgentStartupPlan({...})` argument object inside `resolveMobileSessionTerminalCommand`
   and changes nothing else — every `-` line equals its `+` line modulo leading spaces. Dead diff on
   a file five other patches also touch.

2. **Route the owner decision into upstream's resolvers.** In `resolveHeadlessAgentColdRestore`
   (`src/main/runtime/orca-runtime.ts`, private method added by hunk 4) and at the precedence check in
   hunk 2, replace

   ```text
   const startupAgent = tab.launchAgent ?? coldRestore?.agent
   const resumable = coldRestore && coldRestore.agent === startupAgent ? coldRestore : null
   ```

   with `resolvePaneAgentOwner({ launchAgent: tab.launchAgent ?? null, hookAgent: row.agentType })`
   for the owner, and `resolveCompatibleAgentTypeForOwner(row.providerSessionAgentType, ownerAgent)`
   for the session's agent, accepting the resume when those agree. The bare `===` today drops the
   resume for an OMP pane whose hook row reports `pi` — the exact case
   `resolveCompatibleAgentTypeForOwner` exists for, and the case `toMobileSessionTabsResult:33745-33756`
   already handles two hundred lines away in the same class. Import both from
   `../../shared/pane-agent-owner` and `../../shared/agent-title-owner`; both are already imported by
   `orca-runtime.ts`.

3. **Hoist the row fetch instead of copying it.** `getHookRowsForPane` is a per-call memoised closure
   inside `toMobileSessionTabsResult` (`:33628-33643`); our four-line
   `getAgentProviderSessionRowsForPaneFn ?? indexAgentStatusRowsByPaneKey(...)` preamble is a second
   copy. Lift it to a private `getHookRowsForPane(paneKey)` on `OrcaRuntimeService` (dropping only the
   per-call memo, which is a hot-path optimisation for the snapshot loop and irrelevant to a single
   activation), have `toMobileSessionTabsResult` call it, and call it from
   `resolveHeadlessAgentColdRestore`. This is upstream's own move — "extract the logic to a new module
   and have both the handler and the runtime import it" (`00-building-blocks.md`, *Modules split out
   of `src/main/ipc/*`*) — so it merges rather than conflicts.

**Do not** replace the whole resolver with a read of `publicTab.agentStatus`, which is already in
scope at the call site (`:8836`). It is unsafe: `buildPtyMobileAgentStatus` publishes
`providerSession` unbounded but `agentType` only via `ownerAgent`, and `getHookAgentRowForPane`
(`:34185-34212`) bounds `agentType` by `AGENT_STATUS_STALE_AFTER_MS` on purpose ("a user who exits
the agent leaves `pty.lastAgentStatus` behind forever"). `providerSessionAgentType` is deliberately
unbounded and deliberately **not** published on the client tab. So on a pane cold since the last
restart the published `agentStatus.agentType` is `undefined` while `providerSession` is present —
the resume would be dropped exactly when it is needed. Our `providerSessionAgentType ?? agentType`
read is load-bearing and must stay.

Everything else in the patch stands: hand the pair to `ensureAgentSession({kind:'explicit', ...,
presentation:'background'})`, let it own the execution-owner check, the signed claim,
`buildAgentResumeStartupPlan` and the background `createTerminal`; fall through to the plain
materialize on any throw. Tests keep their names (`headless-agent-cold-restore.test.ts`,
`headless-agent-cold-restore-precedence.test.ts`); the precedence test needs a new case for a
compatible-but-unequal pair (`launchAgent: 'omp'`, `providerSessionAgentType: 'pi'`) that must now
resume rather than drop.

### Blocks this touches that other patches may share

- **RuntimeDesktopSurface** — the resume lands on `createTerminal`'s background branch precisely
  because there is no authoritative window; the `terminal:tabCreateReply` path it skips now routes
  through this port (`:28434-28455`, `:28805-28837`). *Suspect shared with:*
  `headless-orchestration-delivery.diff` (same "no renderer graph on this host" premise, same file),
  `execution-owner.diff` (also decides what a renderer-less host owns).
- **orcad — the plain-Node runtime entrypoint** — `canRecoverPersistentLocalPtys: () => false`
  (`orcad-entry.ts:142`) makes cold restore the normal case on a Node host, so this patch is the one
  that decides whether an orcad-based artifact keeps agent panes across restart. *Suspect shared
  with:* `trusted-proxy-session.diff` and `usage-analytics.diff` (both patch `src/main/index.ts`,
  which orcad does not run at all), `cli-registration.diff`.
- **registerHeadlessPtyRuntime** — the resumed agent's PTY spawns through the handlers registered by
  this entry point (`orcad-entry.ts:156`, and desktop `--serve`). *Suspect shared with:*
  `headless-orchestration-delivery.diff`, `execution-owner.diff`.
- **agent-resume-host-authority-capability** — the client-side skew guard for the same
  `ensureAgentSession` enum. Our patch calls that method **inside** the host, so it neither needs nor
  probes the capability; anyone adding a resumable agent must still satisfy the exhaustive
  `satisfies Record<ResumableTuiAgent, …>` there. *Suspect shared with:* `execution-owner.diff`,
  which patches both `pty-connection.ts` and `web-runtime-session.ts` — the two client callers of
  that guard.
- **host-mirrored-pane-liveness** / **host-session-mirror-hydration** — the client-side decision that
  a mirrored pane is dead. If the browser ever regains sleeping-agent records, the client sweep and
  our host-side restore could both fire for one pane. *Suspect shared with:*
  `execution-owner.diff` (web-runtime-session.ts, pty-connection.ts), `workspace-restore.diff` (it
  restores the pointer that triggers the client's activation sweep).
- **The runtime-electron ratchet** — the patch adds value imports to `orca-runtime.ts`, one of the
  ratchet's two entry points, whose baseline is empty and may only shrink. *Suspect shared with:*
  every patch touching `src/main/runtime/orca-runtime.ts`: `floating-workspace-picker.diff`,
  `runtime-seeded-settings.diff`, `execution-owner.diff`, `headless-orchestration-delivery.diff`,
  `usage-analytics.diff`.
- **Modules split out of `src/main/ipc/*` to keep the runtime graph Electron-free** — named here as
  the pattern shape 3 above should follow. *Suspect shared with:* `cli-registration.diff` (it does
  exactly this to `src/main/ipc/cli.ts`), `floating-workspace-picker.diff` (`ipc/app.ts`,
  `ipc/floating-workspace-directory.ts`).

### Unverified

- Whether our AppImage's Electron `--serve` host actually has `getDaemonProvider() !== null` at
  restart time. If the daemon is up and its PTYs survive, the pane is recovered and this path is
  never reached; the patch matters only when it is not. Not measured — read from source only.
- Whether `receivedAt` on a disk-hydrated agent-hook row is the original receive time or the
  hydration time. This decides whether `getHookAgentRowForPane`'s `AGENT_STATUS_STALE_AFTER_MS` gate
  blanks `agentType` after a restart. I read the gate (`:34199-34205`) but did not trace the
  hydrator that stamps the field.
- Whether `tab.launchAgent` is in fact null on a restored headless agent pane. The builder copies it
  from the persisted tab record (`:8314`); I did not trace the writer, and the patch's precedence
  rule is correct either way.
- Whether the OMP/Pi mismatch shape 2 fixes reproduces in practice. Derived from
  `resolveCompatibleAgentTypeForOwner`'s own header and upstream's use of it at `:33745`; no OMP pane
  was exercised.
- Whether `presentation: 'background'` still reaches the background spawn branch on our Electron
  `--serve` host with a paired web client attached. `00-building-blocks.md` asserts it for a host
  with no renderer; I did not confirm a paired client leaves `getAvailableAuthoritativeWindow()` null.
- Nothing here was executed. No test was run, no host was booted, and the patch was not re-applied
  against v1.4.190 — the "region untouched" claim is from `git diff v1.4.188..v1.4.190` hunk headers,
  not from `quilt push`.
