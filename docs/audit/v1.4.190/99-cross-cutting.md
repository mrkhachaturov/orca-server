# Cross-patch pass — v1.4.190

Reads all thirteen reports. Says only what no single report could see. Every ruling below was
checked against `git -C lib/orca show v1.4.190:<path>` or against `patches/*.diff`; anything not
checked is in **Unverified**.

## Verdict table

| # | patch | verdict | owning block | one-line shape |
| --- | --- | --- | --- | --- |
| 01 | trusted-proxy-session | keep, 3 hunks reshaped | none upstream | credential route through the proxy-prefix mapper, offer minted `reach: 'this-computer'` |
| 02 | pairing-credentials | shrink | Modules split out of `src/main/ipc/*` | one overlay projection module that both `ipc/mobile.ts` and the RPC import |
| 03 | resource-manager | keep, no edit | AppEnvironment (producer, far side of the wire) | one stub → `diagnostics.memory` |
| 04 | cli-registration | shrink | Modules split out of `src/main/ipc/*` | new `src/main/cli/cli-registration.ts`; `ipc/cli.ts` delegates |
| 05 | floating-workspace-picker | keep + shrink | AppEnvironment | port-swap the ipc module; drop the `window.api` grant route |
| 06 | runtime-seeded-settings | keep | none upstream | widen `getClientSettings()`, adopt once on first visit |
| 07 | open-in-browser-editors | keep, no edit | none upstream | optional `url` row + render-time validator |
| 08 | execution-owner | keep | none upstream | resolve the owning host when nothing names one |
| 09 | headless-orchestration-delivery | keep | none upstream | project PTY records onto `OrchestrationMailboxLeaf` |
| 10 | usage-analytics | shrink | Modules split out of `src/main/ipc/*` | settable usage-store registry; runtime loses all three hunks |
| 11 | agent-cold-restore | keep, shrink 2 | none upstream | supply the resume request from the host |
| 12 | workspace-restore | shrink | none upstream | two-line reader fallback in `getStoredWorkspaceSession` |

No drops. Seven of twelve have **no upstream owner at all** — the series is not drifting toward
redundancy.

## Merge candidates

Block → patches, built from every report's *Blocks this touches* section. The audit rule: shared
FILES are normal; shared SYMBOLS in one subject area are a merge.

| block | patches naming it | merge? |
| --- | --- | --- |
| The runtime-electron ratchet | 01 02 03 04 05 06 07 08 09 10 11 | **no** — a gate, not code. See Contradictions #3. |
| AppEnvironment | 03 04 05 08 10 | **partly** — 05+08 share one symbol pair; 03/04/10 are unrelated files. |
| Modules split out of `src/main/ipc/*` | 02 04 05 08 10 11 | **no, but one decision** — two incompatible shapes. See Vocabulary #3. |
| orcad | 01 02 03 04 05 06 09 10 11 | **no** — and the premise is dead. See Order of work, D1. |
| SecretStore | 01 02 (both: not touched) | **closed** — verified: no `.diff` in the series references it. |
| vitest-host-ports-setup | 03 04 05 07 09 | **no** — one file, mechanical, see Phase 2. |
| RuntimeDesktopSurface | 09 (ruled out) 11 | **no** |
| registerHeadlessPtyRuntime | 09 11 | **no** — shared premise, not shared code. See Phase 3 L1. |
| unified-tab-host-ownership | 08 12 | **no** — 08 owns the one call-site decision. |
| worktree-execution-host-alias | 08 12 | **no** — 12's shrink deletes its own guard. |
| host-session-mirror-hydration / host-mirrored-pane-liveness | 11 12 | **no** — a double-fire hazard, recorded in Phase 3. |
| src/shared/child-process | 03 only | not a candidate |

Three real merges, none of them a block:

1. **`createPairingOffer` on the shared pending runtime device — 01 + 02.** Both mint a
   runtime-scope credential from the same slot; 02 passes `reach: 'this-computer'`, 01 does not, and
   `getOrCreatePendingDevice` widens but never narrows. Neither report could see that the reach
   01 fails to set is the reach 02 just set. **One mint helper, in the overlay, imported by both.**
   Overlay files carry no quilt order, so 01 may import a module 02 introduces.
2. **Device-name templates — 01 + 02 + upstream.** `Mobile <date>`, `Runtime <date>` (`ipc/mobile.ts:117,185`),
   `Web session <date>` (01), plus orcad's `CLI <date>`. 02 proposes two helpers and names 01's
   third; 01 does not know. Same helper module as (1).
3. **`src/main/runtime/rpc/methods/floating-workspace.ts` — 05 + 08.** Verified: the overlay file
   holds all three methods (`resolveCwd`, `markdownDirectory`, `grantDirectory`), two patches
   contribute to it, and `mise run owner` answers only "overlay". Not a capability merge — a
   **shared overlay file with no ownership marker**, which is a structural blind spot the audit
   rule does not cover.

Shared files that are **not** merges and need only sequencing: `web-preload-api.ts` (9 patches:
01 02 03 04 05 06 08 10 12 — verified by `Index:` line, so 07/09/11 do not touch it),
`orca-runtime.ts` (6: 05 06 08 09 10 11), `mobile-rpc-allowlist.test.ts` (5: 02 04 05 08 10),
`rpc/methods/index.ts` (4: 02 04 05 10), `runtime-rpc.ts` (2: 01 02), `src/main/index.ts` (2: 01 10),
`store/slices/settings.ts` (2: 07 08).

## Vocabulary mismatches

1. **"ratchet entry" vs "ratchet entry point."** 04 counts baseline lines — electron-importing input
   files ("this patch's contribution drops from 1 to 0"). 00, 05, 08, 09 count the two esbuild roots
   ("one of the ratchet's two entry points"). Same word, two referents; the counts look like they
   disagree and do not. Sections: 04 *Correct shape*, last paragraph, vs 09 *Blocks*, first bullet.
2. **"headless."** 09 means the Electron `--serve` host with an empty leaf graph. 11 means upstream's
   `buildHeadlessMobileSessionTerminalTabs` — a tab shape. 00 means plain-Node orcad. Three
   referents; 09's and 11's shared premise ("no renderer here") is an accident of wording, and the
   condition each actually depends on is different (empty `this.leaves` vs null
   `getAvailableAuthoritativeWindow()`). Sections: 09 *Who owns this logic now* ¶2 vs 11
   *Still present at v1.4.190* bullet 4.
3. **"Modules split out of `src/main/ipc/*`" hides two shapes.** 02 and 04 mean a **pure domain
   module** (`preflight/agent-detection.ts`, `plugins/plugin-client-list.ts`). 10 means a **settable
   registry** (`ssh/ssh-target-registry.ts`), and gives the reason: the thing extracted is a process
   singleton owning a cache file, so a second construction runtime-side is a defect. They are not
   interchangeable and the block name does not distinguish them. Sections: 04 *Correct shape* ¶1 vs
   10 *Who owns this logic now* ¶2.
4. **"trusted-session offer" / "runtime grant" / "CLI credential."** All three are
   `createPairingOffer({ scope: 'runtime' })` against one pending device. 01 uses the first, 02 the
   second, 00 the third. That naming is why merge candidate (1) was invisible from inside either
   report. Sections: 01 *Correct shape* item 2 vs 02 *Blocks*, `createPairingOffer` bullet.
5. **"the picker" vs "floating ownership."** Both 05 and 08 name `web-preload-api.ts:595`
   `getFloatingTerminalCwd` as their stub. Verified: only 05 patches it. Sections: 05 *Still present*
   bullet 1 vs 08 *Still present* bullet 4.

## Contradictions

1. **`RemoteFileBrowser.tsx` is shared between 05 and 08 — 08 says "confirmed".**
   **Ruling: 08 is wrong.** Only `execution-owner.diff` carries an `Index:` line for that file; 05
   mentions it in its header prose. The component is upstream (blob present at v1.4.190). 08's added
   `selectableFileExtensions` prop is optional, so 05's render site does not break. Not a shared
   file, not a merge candidate. (08 *Blocks*, `RemoteFileBrowser.tsx` bullet.)

2. **Does patch 08 stand if patch 05 is dropped?** 05 says "fix A is required by patch 08 even if
   patch 05 were dropped, and dropping patch 05 alone does not clear the ratchet."
   **Ruling: 08 does not apply without 05.** Verified: 08's `@@ -332,6 +332,7 @@` hunk on
   `orca-runtime.ts` adds one line into an import block whose context lines
   (`resolveFloatingTerminalCwd as resolveFloatingTerminalCwdOnHost,`,
   `type FloatingWorkspaceDirectoryStore`) are **05's own additions**. 05 creates the
   `orca-runtime.ts → ipc/floating-workspace-directory.ts` edge; 08 extends it by one symbol. The
   conclusion 05 draws is right for the wrong reason: fix A belongs to 05 because 05 owns the file,
   not because 08 could survive without it.

3. **Is `check:runtime-electron-ratchet` a gate we run?** 04 says the current shape "fails
   `pnpm lint`"; 05 says "the ratchet entry disappears"; 10 flags it Unverified.
   **Ruling: 10 is right — we do not run it.** Verified: `runtime-electron-ratchet` appears nowhere
   in `.mise/`, `mise.toml` or `.github/`. `test:types` runs `pnpm run typecheck:tsc` only, and
   `check` = `test:series` → `up` → `test:types, test:unit, test:scope, lint (flint), kodus:config`.
   `pnpm lint`, `pnpm run build:orcad` and `smoke:orcad-terminal` are all unrun locally. The ratchet
   binds **contributability** (AGENTS.md's quality bar) and upstream CI, not our push. It therefore
   does not order the work; it constrains the shape.

4. **Unresolved — is `browser.screencast.v1` advertised on our `orca serve` host?** The filter is
   `hasRenderer || hasOffscreen`, where `hasRenderer = Boolean(getAvailableAuthoritativeWindow())`
   and `hasOffscreen = !hasRenderer && Boolean(this.offscreenBrowserBackend)`
   (`orca-runtime.ts:6101-6106`). No report asks whether the serve path installs an offscreen
   backend. 08 patches ten `browser-pane/stream-remote/**` files on the assumption the capability is
   live. What would settle it: boot the AppImage's `orca serve` and read the capability list off
   `status.get`.

5. **Unresolved — is `getAvailableAuthoritativeWindow()` null with a paired web client attached?**
   09 needs it null (so `this.leaves` stays empty); 11 needs it null (so `presentation:'background'`
   reaches the background spawn branch). Both label it Unverified, in opposite framings. One live
   check settles both — see Phase 3.

## Duplication risks

The user's stated failure mode: one agent proposing to write what another found an owner for.

1. **05 and 08 propose the identical two-line `AppEnvironment` swap on
   `src/main/ipc/floating-workspace-directory.ts`** (`app.getPath('home')` at `:26`,
   `app.getPath('userData')` at `:72`; verified both lines and the `import { app } from 'electron'`
   at `:4`). Written independently that is one edit landed twice, in two patches, on one file.
   **Write it once, in 05.**
2. **05 proposes deleting a symbol 08 imports.** 05's fix D replaces `FloatingWorkspaceDirectoryStore`
   with inline `Pick<>` signatures. Verified: 05's own patch exports that interface from the upstream
   file, and 08's import hunk names it. Neither report knows. **Decide the shape before either patch
   is touched.**
3. **Three patches propose three extraction modules for one block, in two shapes** (Vocabulary #3).
   Independently written, the series gains three conventions for the same v1.4.190 pattern.
4. **02 proposes name-template helpers; 01 writes a fourth copy of the same template** (merge
   candidate 2). 02 names the collision; 01 does not.
5. Clean, no action: 11 item 3 catches its own copy of upstream's `getHookRowsForPane`; 08 item 2
   catches its own byte-identical duplicate in `floating-workspace-runtime-owner.ts` (verified
   present in the overlay); 07 checked `ipc/shell.ts`'s scheme validation and correctly ruled it
   unreachable at render time rather than duplicating it; 10 checked that only usage reads
   `src/shared/runtime-usage-providers.ts` before proposing to delete it.

## Gaps

**Blocks in `00-building-blocks.md` that no patch report claims:** SpeechServiceFactories,
PtyIpcSurface / PtyPowerSurface, Default proxy session resolver, WorktreeWatcherRemoval,
MainHttpClient, project-group-owner-routing, `src/shared/source-scan`.

Three of those are live capability gaps where **the wire already exists upstream** — the highest
category on AGENTS.md's quality bar, and the exact mechanism patch 10 exists to fix:

- **Dictation.** `SPEECH_METHODS` is registered (`rpc/methods/index.ts:78`), the eight
  `speech.dictation.*` / `speech.models.*` methods are on `MOBILE_RPC_METHOD_ALLOWLIST`
  (`runtime-rpc.ts:393-400`), and our Electron `--serve` host installs
  `electronSpeechServiceFactories` (`index.ts:909`). `web-preload-api.ts` contains **zero**
  occurrences of `speech`, so every call falls through `createFallbackProxy` to `undefined`. No
  quilt hunk needed beyond the preload; no allowlist change needed.
- **Plugins.** `PLUGIN_METHODS` is registered, and v1.4.190 *added*
  `src/main/plugins/plugin-client-list.ts` explicitly "so `plugins.list` RPC reaches it without
  `ipcMain`". `web-preload-api.ts` contains zero occurrences of `plugins`. The release did this work
  for the web and the audit did not take it.
- **Jira.** `JIRA_METHODS` is registered; zero occurrences of `jira` in the web preload. This is also
  why `MainHttpClient` appears in `00` and in no report — its only non-test consumer is
  `jira/authenticated-request.ts:61`.

**Questions nobody asked:**

- Whether `mise run check` gates anything upstream's own CI gates. It does not (Contradictions #3).
  Six reports reason about a gate that never runs here.
- Whether worktree removal from the tile closes its watchers. `WorktreeWatcherRemoval`'s maps are
  fed only by `ipcMain` handlers carrying a renderer `sender`, so a browser-initiated removal has
  nothing to close — 00 calls that "inert is correct", but only for a host with *no* client. Nobody
  checked the web-client case.
- Whether the process-level `setPtyHostBindings` install ordering (`index.ts:892`, which 00 records
  as the fix that made `orca serve` register PTY handlers at all) is depended on by any patch.
- `project-group-owner-routing` is new at v1.4.190 and routes group mutations to the owner host —
  the same subject 08 reasons about. 08 did not look at it.

## Order of work

**Phase 0 — decisions, before any patch is edited.**

- **D1. orcad is not our host and cannot become one today.** Verified: `startOrcad` constructs
  `OrcaRuntimeRpcServer` with no `webClientRoot` (`orcad-entry.ts:163-170`), so orcad serves no web
  client. Every orcad degradation argument in 01 02 03 04 05 06 09 10 11 is hypothetical. Strike it
  from the rationale headers rather than carrying it to the next bump. *Settles: nine reports'
  speculation, zero code.*
- **D2. Extraction convention** (Vocabulary #3): settable registry when the extracted thing is a
  process singleton owning state; pure domain module when it is stateless. *Settles: 02, 04, 10.*
- **D3. Do we honour the ratchet given we do not run it?** Recommend yes, for contributability — but
  it is not a push gate, so it does not order anything. *Settles: 04, 05, 08, 10.*
- **D4. `FloatingWorkspaceDirectoryStore` shape** (Duplication #2), before either 05 or 08 is
  touched. *Settles: 05, 08.*
- **D5. workspace-restore scope — SETTLED: reader fallback plus the producer, in the shared writer.**
  Not a project preference; the desktop answers it. Desktop reads the pointer host-side via
  `session:get` -> `store.getWorkspaceSession(hostId)` (`src/main/ipc/session.ts:12`,
  `persistence/loading-store/store.ts:2775`), persisted per host in `orca-data.json`; the desktop
  renderer holds nothing durable. A browser with cleared localStorage is therefore the desktop's
  normal case, and reader-only restores only when the browser copy survives — the case D5 asks about
  is exactly the one it misses. Upstream built the wire for the tabs half (`session.tabs.*`, 12 RPC
  methods) and routes the pointer through `ui.lastActive*` on purpose (`getStoredWorkspaceSession`,
  `web-preload-api.ts:4093-4098`: replaying browser-local terminal handles creates stale remote
  PTYs). The producer was never written for EITHER host, so it belongs in the shared renderer writer
  `usePersistedUIWriter` (`src/renderer/src/app-shell/use-persisted-ui-writer.ts`, wired in
  `App.tsx:48`), beside its `activeView` precedent at `:63-70` — one small effect through
  `window.api.ui.set`, off the 150 ms durable-state debounce. Not the web-only
  `rememberWebActiveWorkspace`, which duplicates a transport that already exists end to end.
  *Settles: 12.*

**Phase 1 — first, because other work builds on it.**

- **W1.** `src/main/ipc/floating-workspace-directory.ts` → `AppEnvironment`, once, **in patch 05**,
  plus rewriting the upstream test's `vi.mock('electron')` as `installFakeAppEnvironment`.
  *Settles: 05 and 08 (08 must not write it).*
- **W2.** Apply D4 to 05, then restack 08 on the result. *Settles: 05, 08.*

**Phase 2 — parallel, mutually independent.**

- **P1.** 02's overlay projection + mint/name module **including 01's `Web session <date>`**, then
  01 items 1–3. 01 and 02 must be authored together: 02's hunk already reads a field 01 declares,
  and 01's mint must import 02's helper. *Settles: 01, 02.*
- **P2.** 04 extraction per D2. *Settles: 04.*
- **P3.** 10 registry per D2, plus the three `app.getPath('userData')` swaps in the usage stores.
  *Settles: 10.*
- **P4.** 03 — restack unchanged. *Settles: 03.*
- **P5.** 07 — restack unchanged; its only coupling is to 06's overlay allowlist, whose shape does
  not change. *Settles: 07.*
- **P6.** 06 — restack; fix the header's *To test* path to the profile store; add the missing
  `getClientSettings()` case. *Settles: 06.*
- **P7.** 09 — restack; delete the `vi.mock('electron')` in
  `src/main/runtime/headless-orchestration-delivery.test.ts` (verified: the only one in `src/`).
  *Settles: 09.*
- **P8.** 12 per D5. *Settles: 12.*

**Phase 3 — blocked on one live check.**

- **L1.** One `orca serve` session on the built AppImage answers three questions at once: is
  `getAvailableAuthoritativeWindow()` null with a paired web client (Contradictions #5), is
  `browser.screencast.v1` advertised (Contradictions #4), and does 08's
  `activeWorkspaceExecutionHostId`-null case reproduce (08 item 3).
- **L2.** 08 and 11 land after L1. Both carry a behavioural claim L1 either confirms or kills.
  *Settles: 08, 11.*

**Phase 4 — new work, not in the series.** Each is category 1 (wire up Orca's own building block),
each is preload-only, none needs an allowlist change: **N1** speech, **N2** plugins, **N3** jira.

**Must not start until answered:** anything in 05 or 08 (D4), 02's module shape and 04's and 10's
extractions (D2), 12 (D5), 08 and 11's behavioural halves (L1).

## Unverified

- No gate was run and nothing was assembled: no `quilt push`, no `mise run up`, no `vitest`, no
  build, no `orca serve`. This pass is read-only, as instructed.
- Whether any patch still applies at the moved pin. Contradiction #2 is a reading of hunk context
  against `patches/*.diff`, not a `quilt push`.
- The `web-preload-api.ts` gaps (speech, plugins, jira) were established by counting occurrences of
  each namespace in `git show v1.4.190:src/renderer/src/web/web-preload-api.ts` and confirming the
  matching RPC family exists in `ALL_RPC_METHODS`. I did not trace a call through
  `createFallbackProxy` to prove the `undefined` resolution; that mechanism is taken from report 10,
  which describes it for usage.
- Whether wiring speech from the web preload actually works on our host. `electronSpeechServiceFactories`
  is installed at `index.ts:909` inside `hasSingleInstanceLock`, which `orca serve` executes — read
  from source, not run. The renderer-side dictation UI was not read at all.
- Contradictions #4 and #5 are unresolved by design; both need L1.
- I did not read the bodies of every hunk in every patch. Ownership claims above rest on `Index:`
  lines plus the specific hunks quoted; a symbol collision inside a hunk I did not open would not
  appear here.
- The gap list is bounded by `00-building-blocks.md`'s own section list plus the preload namespace
  sweep. A capability v1.4.190 added that `00` did not name would be invisible to this pass too.
