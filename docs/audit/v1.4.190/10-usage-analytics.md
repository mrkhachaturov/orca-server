# usage-analytics — v1.4.190 re-derivation

## Problem

Settings > Stats & Usage sat on "Not scanned yet" in the web tile and the Enable
Claude/Codex/OpenCode buttons did nothing — no error, no effect — while the same host showed the
full ledger on desktop. `window.api.<provider>Usage.*` is desktop-only IPC absent from the web
preload, so every call fell through `createFallbackProxy` and resolved to `undefined`.

## Still present at v1.4.190

yes.

- No `usage.*` RPC exists. `ALL_RPC_METHODS` (`src/main/runtime/rpc/methods/index.ts:47-88`) has no
  usage family; `STATS_METHODS` is one method, `stats.summary`, over process stats
  (`rpc/methods/stats.ts:3-11`). `src/main/runtime/` contains zero references to
  `claudeUsage`/`codexUsage`/`openCodeUsage`/`*UsageStore` at the tag.
- The only entry point is still `ipcMain`: `src/main/ipc/usage-provider-handlers.ts:1` imports
  `ipcMain`, `:64` exports `registerUsageProviderHandlers`, and its sole caller is
  `src/main/ipc/register-core-handlers.ts:142`, reached only from `openMainWindow`
  (`src/main/index.ts:1394` → `:1549`). The file is byte-identical to v1.4.188
  (blob `58496f1c` at both tags).
- The stores themselves *are* constructed in the shared startup path — `src/main/index.ts:2540-2542`,
  inside `app.whenReady()` (`:2243`), well before the serve/window branch, and
  `AutomationService` consumes them with `allowRemoteHostScheduling: isServeMode` (`:2743-2746`).
  So under `orca serve` the stores scan and the handlers are never registered — and a browser has
  no `ipcRenderer` regardless.
- Upstream documents the gap in its own test: "Paired web clients resolve unbridged desktop usage
  calls to undefined" (`src/renderer/src/store/slices/usage-web-client-fallback.test.ts:11`), which
  asserts `fetch*Usage()`/`enable*Usage()` resolve `undefined` and leave scan state `null`.

Answers to the dispatched question:

- **Not behind a port.** All three stores still `import { app } from 'electron'` and call
  `app.getPath('userData')` directly: `src/main/claude-usage/store.ts:1,64,69`,
  `src/main/codex-usage/store.ts:1,70,75`, `src/main/opencode-usage/store.ts:1,36,41`. That is
  their only Electron dependency; the scanners and the shared base class
  (`src/main/usage/usage-provider-store-lifecycle.ts`) are pure `node:fs`.
- **MainHttpClient is not involved.** No `fetch(`, `net.request`, `getMainHttpClient` or any URL in
  `src/main/claude-usage`, `src/main/codex-usage`, `src/main/opencode-usage`. Its only non-test
  caller at the tag is `src/main/jira/authenticated-request.ts:61`.
- **Four of eight is still true.** The renderer slice's `UsageApi` type declares exactly
  `getScanState`, `setEnabled`, `refresh`, `getSnapshot`
  (`src/renderer/src/store/slices/usage-provider-slices.ts:50-58`) and calls only those
  (`:138,164,184,187,200`). No non-test renderer caller of `getSummary`/`getDaily`/`getBreakdown`/
  `getRecentSessions` exists; they live only in the preload type and factory
  (`src/preload/api/agent-usage-api.ts:31-38`, `src/preload/usage-provider-api.ts:22-27`).
- **The desktop IPC handlers did not change** between v1.4.188 and v1.4.190.

## Who owns this logic now

**Modules split out of `src/main/ipc/*` to keep the runtime graph Electron-free.**

This is the block's exact case: a capability whose only entry point is an `ipcMain` handler, needed
from the runtime. The half already split is `src/main/ipc/usage-provider-handlers.ts` — but it kept
only the registration; the store *handles* stayed as function arguments from `index.ts`, so nothing
runtime-side can resolve them.

The block's canonical instance is `src/main/ssh/ssh-target-registry.ts` — a settable registry, not a
direct handle, type-importing the Electron-touching classes so the module itself stays clean, read
directly by `src/main/runtime/rpc/methods/ssh.ts:2-7` with no runtime constructor dependency. Usage
needs the same registry (not a plain re-export) for the same reason: `new ClaudeUsageStore(store)`
et al. are singletons that own a cache file and a flush on quit (`src/main/index.ts:3441-3443`), so
a second instance constructed runtime-side would be a real defect.

Two adjacent blocks constrain the shape:

- **The runtime-electron ratchet** — `config/runtime-electron-baseline.txt` is empty and must stay
  empty; `runtime-rpc.ts` → `rpc/dispatcher.ts:15` → `rpc/methods/index.ts` means any method module
  is inside the ratcheted graph. A *value* import of the three stores from `rpc/methods/usage.ts`
  adds three Electron importers and fails `check:runtime-electron-ratchet`. This is new at v1.4.190
  (neither the script nor the baseline exists at v1.4.188) and is the reason the indirection is
  mandatory rather than stylistic.
- **AppEnvironment** — owns `getPath('userData')`, which is the stores' entire remaining Electron
  dependency. Migrating them is 3 one-line changes and is the only route by which usage could ever
  work under **orcad**, where the stores are never constructed at all.

## Verdict

**shrink** — the symptom, the owner and the eight-method surface are all unchanged, but v1.4.190
established the registry pattern this patch predates, which removes all three `orca-runtime.ts`
hunks (~55 of 268 lines) without losing anything.

## Correct shape at v1.4.190

Keep the `usage.*` family and the three preload namespaces. Move the store lookup off the runtime.

**Delete** — every `orca-runtime.ts` hunk: the `RuntimeUsageProvider` type import, the
`RUNTIME_USAGE_PROVIDERS` re-export, `RuntimeUsageScope`/`RuntimeUsageRange`/
`RuntimeUsageBreakdownKind`/`RuntimeUsageStore`, the `getUsageStore?` constructor dep, the
`usageStoreResolver` field, and the `getUsageStore()` method. The runtime never needs to know usage
exists.

**Add (overlay)** — `src/main/usage/usage-store-registry.ts`, modelled line-for-line on
`src/main/ssh/ssh-target-registry.ts`:

- `import type { ClaudeUsageStore } from '../claude-usage/store'` (and the codex/opencode
  equivalents) — type-only, exactly as `src/main/ipc/usage-provider-handlers.ts:2-4` does, so it is
  erased and the ratchet stays at zero.
- `setUsageProviderStores({ claudeUsage, codexUsage, openCodeUsage })` and
  `getRegisteredUsageStore(provider)`, the latter throwing `usage_provider_unavailable:<provider>`
  when unset — same "fail loudly, never answer undefined" reasoning as
  `connectRegisteredSshTarget` (`ssh-target-registry.ts:41-47`), and the same reasoning the current
  patch already gives.
- `RUNTIME_USAGE_PROVIDERS` / `RuntimeUsageProvider` move here from
  `src/shared/runtime-usage-providers.ts`; that file then disappears. The import-cycle it was
  created to dodge only existed because the constant was reached through `orca-runtime.ts`.
- Type the accessor against the concrete store classes rather than the current structural type with
  `unknown` returns — free, since `src/shared/{claude,codex,opencode}-usage-types.ts` are already
  Electron-free.

**Change `src/main/index.ts`** — move the hunk from the runtime deps object (~`:2731`, currently
between `buildAgentHookPtyEnv` and `orchestrationEnvironmentTransport`) to a single
`setUsageProviderStores({ claudeUsage, codexUsage, openCodeUsage })` immediately after `:2542`. One
line, in a cold part of the file, and no longer competing for the deps object.

**Change `src/main/runtime/rpc/methods/usage.ts`** — replace
`runtime.getUsageStore(params.provider)` with `getRegisteredUsageStore(params.provider)` in all
eight handlers, imported at module scope. The `defineMethod` context carries only
`runtime`/`pairing` (`rpc/core.ts:64-100`), which is why this must be a module import — same as
`rpc/methods/ssh.ts`.

**Keep unchanged** — the one-line `rpc/methods/index.ts` registration and the two
`mobile-rpc-allowlist.test.ts` cases. The allowlist argument is unaffected: `usage.setEnabled`
mutates the host and every read exposes local agent-log analytics.

**Web preload** — the namespace-map hunk stays; the factory should adopt upstream's shape. Upstream
already has `createUsageProviderApi(ipc: Pick<IpcRenderer, 'invoke'>, prefix)`
(`src/preload/usage-provider-api.ts:8-16`) — a one-method structural transport with a generic
overload returning `PreloadApi[Key]`. Copy that overload signature onto `createUsageApi` and let the
inner `call` return `Promise<any>` as upstream's `ipc.invoke` does; the `as never` cast and its
five-line justification then disappear. Also drop `pruneUsageWindow`: `limit: undefined` satisfies
`z.number().optional()` under `.strict()`, and JSON serialisation drops the key anyway.

*Not recommended, but recorded:* value-importing `createUsageProviderApi` from the renderer with an
RPC-backed `{ invoke }` adapter would delete our factory entirely. No renderer file value-imports
from `src/preload/` at v1.4.190 (only `import type` from `preload/api-types`), so this crosses a
build-target boundary upstream does not cross. Not worth it for eight lines.

**Also worth doing, separately from this patch** — route the three stores' `app.getPath('userData')`
onto `getAppEnvironment().getPath('userData')` (`src/main/claude-usage/store.ts:64,69`,
`src/main/codex-usage/store.ts:70,75`, `src/main/opencode-usage/store.ts:36,41`). Six lines, exactly
the migration upstream is running, and the only thing that would make usage work under **orcad**.
It does not remove the registry — the singleton problem is independent of the Electron problem.

**Test** — `src/main/runtime/rpc/methods/usage.test.ts` gets simpler and stricter: mock the registry
module instead of casting a fake runtime with `as unknown as OrcaRuntimeService`, which is the cast
AGENTS.md warns hides typecheck errors. Keep one case per method plus the
`usage_provider_unavailable:` case.

## Blocks this touches that other patches may share

- **Modules split out of `src/main/ipc/*` to keep the runtime graph Electron-free** — the owner.
  Suspected shared with `cli-registration.diff` (patches `src/main/ipc/cli.ts` and adds
  `CLI_METHODS`, the same handler-to-RPC move) and `floating-workspace-picker.diff` (patches
  `src/main/ipc/app.ts` and `src/main/ipc/floating-workspace-directory.ts`). Suspicion: all three
  may be re-derivable as registries rather than runtime constructor deps. Worth one cross-patch
  decision rather than three.
- **The runtime-electron ratchet** — binds every patch that adds a module to the
  `orca-runtime.ts` / `runtime-rpc.ts` graph. Certainly shared with `pairing-credentials.diff`
  (`rpc/core.ts`, `rpc/dispatcher.ts`, `runtime-rpc.ts`), `cli-registration.diff`,
  `floating-workspace-picker.diff`, `headless-orchestration-delivery.diff`,
  `runtime-seeded-settings.diff`, `execution-owner.diff` and `agent-cold-restore.diff` — all of
  which add imports to `orca-runtime.ts`. Suspected series-wide finding: nothing in our gates runs
  `check:runtime-electron-ratchet` (see Unverified).
- **AppEnvironment** — suspected shared with any patch that resolves a userData path.
  `pairing-credentials.diff` is the likeliest (`mobile-pairing-userdata-path` is upstream's concern
  at the same tag); `trusted-proxy-session.diff` touches `src/main/index.ts` bootstrap. Suspicion
  only; not checked.
- **orcad — the plain-Node runtime entrypoint** — usage is absent there entirely (stores never
  constructed). Suspected shared with every patch that assumes `src/main/index.ts` ran: at minimum
  `trusted-proxy-session.diff` (serve options, `app.whenReady()` at `:3098`) and
  `headless-orchestration-delivery.diff`. Whether orca-server should ever target orcad is a
  series-level question this patch cannot answer alone.

Shared upstream files, hunk-level (quilt collision risk, not logical coupling):

- `src/main/runtime/rpc/methods/index.ts`, the `ALL_RPC_METHODS` array and its import block — the
  same two hunks are edited by `cli-registration.diff`, `floating-workspace-picker.diff` and
  `pairing-credentials.diff`. Four patches, one array.
- `src/main/runtime/mobile-rpc-allowlist.test.ts` — shared with `cli-registration.diff`,
  `execution-owner.diff`, `floating-workspace-picker.diff`, `pairing-credentials.diff`.
- `src/renderer/src/web/web-preload-api.ts`, the namespace map near `:957` — shared with nine of
  the twelve patches (`resource-manager`, `workspace-restore`, `runtime-seeded-settings`,
  `cli-registration`, `floating-workspace-picker`, `pairing-credentials`, `execution-owner`,
  `trusted-proxy-session`).
- `src/main/runtime/orca-runtime.ts` import block (`:330-405`) and constructor deps
  (`:3786`/`:3845`) — shared with `runtime-seeded-settings.diff` (`:3884-3888`, immediately
  adjacent), `floating-workspace-picker.diff`, `execution-owner.diff`, `agent-cold-restore.diff`,
  `headless-orchestration-delivery.diff`. The shrink above removes this patch from that list
  entirely, which is its second-order value.
- `src/main/index.ts` — shared with `trusted-proxy-session.diff`, but at different hunks
  (`:1893`, `:1920`, `:3098` vs our `:2542`/`:2731`). No collision.

## Unverified

- Nothing was executed. Every claim is read from `git show v1.4.190:<path>`; the tile was not
  opened, `orca serve` was not run, and no test was run. "The stores scan under `orca serve`" is
  inferred from `src/main/index.ts:2540-2542` sitting before the serve/window branch and from
  `AutomationService` receiving them with `allowRemoteHostScheduling: isServeMode` — not observed.
- Whether our gates run `check:runtime-electron-ratchet` at all. I did not read `.mise/tasks/` or
  the CI workflow. If they do not, the current patch's ratchet-cleanliness is accidental and the
  next patch to import a store into the runtime graph will pass locally and fail nothing until an
  upstream rebase.
- Whether `import type` of the three store classes is actually erased by the ratchet's esbuild
  bundle. Reasoned from upstream doing exactly this in `usage-provider-handlers.ts:2-4` and
  `ssh-target-registry.ts:1-3`, both of which are inside graphs the ratchet covers — but not run.
- Whether `zod` `.strict()` accepts an explicitly-present `limit: undefined`. Asserted from zod
  semantics, not tested; the wire is JSON either way, so `pruneUsageWindow`'s removal is safe
  regardless of the answer.
- Whether migrating the three stores to `AppEnvironment` is sufficient for orcad. The stores would
  become importable, but `startOrcad` never constructs them and `OrcadOptions` has no hook; that
  work was not scoped.
- Whether `getSummary`/`getDaily`/`getBreakdown`/`getRecentSessions` have a *mobile* or plugin
  caller. I searched `src/renderer` and `src/preload` only.
- The suspicions in the cross-patch section are suspicions. I read the other patches' file lists and
  hunk headers, not their bodies.
