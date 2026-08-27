# Review of the v1.4.190 bump

Adversarial, read-mostly. Nothing in the tree was edited: every mutation below is a probe that was
restored and re-verified byte-exact (`patches/` sha256 identical before and after; series 13/13
applied; `git status` back to 30 tracked modifications and 10 untracked entries).

## Verdict

**Ship with fixes.**

The one reason: **`cli-registration.diff` and `usage-analytics.diff` have no test that fails
without them.** Popped, their named tests pass — 04 goes 19 → 13 tests, 10 goes 23 → 21. The cases
that disappear are the ones each patch adds to `mobile-rpc-allowlist.test.ts`, a *patched* file, so
popping the patch deletes the test instead of failing it. Everything the patch actually contributes
— registering the method family in `ALL_RPC_METHODS`, the `main/index.ts` install, the preload
namespaces — is asserted nowhere that survives the pop. AGENTS.md: "A patch not covered by a test
that fails without it does not ship."

Everything else checks out. CI passes end to end (proven, not assumed).

## Gate integrity

### Was the original wrong?

**Yes, but not in CI — and the failure was self-inflicted.** Verified mechanism, not story:

`quilt` 0.69 derives its diff prefix from `basename $PWD`. Measured directly:

| working dir | `quilt diff` header |
| --- | --- |
| `…/orca-server/.orca/workspaces/orca-server/orca-update` | `+++ orca-update/lib/orca/…` |
| a symlink named `orca-server` to that same tree | `+++ orca-server/lib/orca/…` |

CI checks out with `actions/checkout` and no `path:`, so `GITHUB_WORKSPACE` basename is
`orca-server` (`.github/workflows/build.yaml:29,64,82,96,115,160`). Committed patch bytes therefore
always carry `orca-server`, and the old hard-coded grep matched them. Counted on the bytes as they
stand:

| grep | on committed (`orca-server`) bytes | on worktree-refreshed (`orca-update`) bytes |
| --- | --- | --- |
| old `^+++ orca-server/lib/orca/` | 14 patch-carried test files | **0** |
| new `^+++ [^/]*/lib/orca/` | 14 | 14 |

So the drop-out is real, and it appears **only after a `quilt refresh` run in a worktree** — which
is what the bump itself does. The gate as committed at HEAD was never broken for CI or for a fresh
clone. The agent measured a hole it had just dug. The fix is still the right direction: this repo
works out of `.orca/workspaces/<name>/`, so prefix-agnostic gates are correct.

### Is the new form still able to fail?

`[^/]*` cannot span a path separator, so the regex still anchors to exactly one component before
`/lib/orca/` — it is a strict superset of the old match for one-component prefixes and matches
nothing extra. Three failing cases constructed and observed:

| case | probe | result |
| --- | --- | --- |
| file owned by both `patches/` and `src/` | `touch src/renderer/src/web/web-pairing.ts` (patch 01 owns it) | `mise run owner` printed both owners, `error: owned twice`, **exit 1** |
| file in the tree owned by nobody | `touch lib/orca/src/main/__review_orphan_probe.ts` | series check 10 **not ok** — "in the tree but in no patch: src/main/__review_orphan_probe.ts" |
| header names a test that does not exist | removed `lib/orca/src/renderer/src/web/web-plugins-bridge.test.ts` | series check 5 **not ok** — `plugins-web-bridge.diff:web-plugins-bridge.test.ts(missing)` |
| unrefreshed patch | see below | series check 9 **not ok**, all 13 named |

All probes reverted. Checks 1–9 of `series.bats` are untouched by the diff; only check 10's `owned`
set changed. `unit.sh`'s "no acceptance tests found — that is itself a failure" branch is unchanged.
The repaired gates can still fail.

### The prefix claim, and would CI pass?

**Both halves of the claim are true, and the tree as it stands would pass CI.** Measured:

- Patch bytes on disk: `+++ orca-server/…` / `--- orca-server.orig/…` on all 13 (98 hunk headers).
- `bats ./test/scripts` from a dir named `orca-update`: **9/10 — check 9 fails**, naming all
  thirteen patches, and rewrites every patch to the `orca-update` prefix as it goes.
- `bats ./test/scripts` from a dir named `orca-server`: **10/10**, patch bytes unchanged (sha256
  verified).
- Full `mise run check` from a dir named `orca-server`: **exit 0**. `test:series` 10/10 · `tree:up`
  - `tree:overlay` 43 files · `test:types` · `test:unit` **36 files / 279 tests** · `test:scope`
  **2953 passed | 12 skipped (2965 files) / 29343 passed | 82 skipped (29425 tests)** across 23
  touched directories · `lint` · `kodus:config`. Patch bytes unchanged afterwards.
- `mise run overlay --check`: "43 files, disjoint from patches".
- Upstream's own `check:runtime-electron-ratchet` on the assembled tree: `ok — 0 entries, unchanged`.

### Finding the gate fix does not close

The greps were made prefix-agnostic; **check 9 was not**. It compares each patch against what
`quilt refresh` writes *in the current directory*, so the prefix invariant is now enforced by
exactly one check, and that check disagrees with itself depending on where you stand. The trap runs
both ways:

- Run `mise run check` in this worktree to get it green → it rewrites all 13 patches to
  `orca-update` → commit that → **CI's check 9 fails**.
- Fix that by normalizing back to `orca-server` → **local `mise run check` can never pass again**.

There is no state in which both are green. The cause is that quilt's prefix is directory-derived;
the cure is to make it constant (`.quiltrc` with `QUILT_REFRESH_ARGS="-p ab"`, or an explicit
normalization step in the bump task), not to loosen the readers. The loosened greps are a
prerequisite for that cure and compose with it, so nothing here needs reverting — but as it stands
`mise run check` is unrunnable in any worktree not named `orca-server`, and the agent's own
"`mise run check` exit 0" was obtained in a state (orca-update bytes) that is not the state it
shipped.

## Deletions

**`src/shared/runtime-usage-providers.ts` (staged delete) — justified.** The two exported symbols
moved verbatim to `src/main/usage/usage-store-registry.ts:21,23`, and the sole consumer
`src/main/runtime/rpc/methods/usage.ts:4` imports them from there. No reference to the old path
survives in `src/`, `patches/` or the assembled `lib/orca/src`. The deleted file's own reason for
existing (import-free, to avoid a `z.enum`-before-init cycle through `orca-runtime.ts`) is
preserved: the new module's only imports are three `import type` lines, erased at compile time.

**`src/renderer/src/web/web-preload-api-active-workspace-pointer.test.ts` — justified.** It tested
`rememberWebActiveWorkspace`, which no longer exists anywhere in the tree (zero grep hits in
`patches/`, `src/`, `lib/orca/src`); D5 replaced the web-only producer with an effect in the shared
renderer writer. The coverage it carried was not dropped, it moved and it still fails without the
patch — with `workspace-restore.diff` popped:

```text
FAIL use-persisted-ui-writer-active-workspace.test.ts > records which workspace is open…
FAIL use-persisted-ui-writer-active-workspace.test.ts > follows a worktree switch within the same repo
FAIL use-persisted-ui-writer-active-workspace.test.ts > does not ride the debounced durable-state save
FAIL web-workspace-restore.test.ts > falls back to this browser's own copy when the host has no pointer yet
FAIL web-workspace-restore.test.ts > carries the unchanged half forward through a partial patch
Tests  5 failed | 3 passed (8)
```

The deleted file's distinctive case — "keeps the repo pointer when a patch carries only
activeWorktreeId" — is the fifth line above, verbatim in intent.

## Test coverage per patch

`quilt pop` down to the patch, run exactly the tests its header names, `quilt push` back.

| # | patch | with patch | popped | verdict |
| --- | --- | --- | --- | --- |
| 01 | trusted-proxy-session | — | **7 failed / 4 passed (11)** | covered |
| 02 | pairing-credentials | — | **4 failed / 17 passed (21)** | covered |
| 04 | cli-registration | 19 passed (3 files) | **13 passed, 0 failed** | **NOT covered** |
| 05 | floating-workspace-picker | 30 passed (5 files) | **3 failed / 21 passed (24)** | covered |
| 10 | usage-analytics | 23 passed (2 files) | **21 passed, 0 failed** | **NOT covered** |
| 12 | workspace-restore | 8 passed | **5 failed / 3 passed (8)** | covered |
| 13 | plugins-web-bridge | 5 passed | **4 failed / 1 passed (5)** | covered |
| 03 06 07 08 09 11 | — | — | not measured | unverified |

Failures observed, for the record: 01 — `server.buildTrustedSessionOffer is not a function` ×3 plus
four `/trusted-session` route assertions (404 vs 200/503); 02 — three `mobile-pairing.test.ts`
mint/list/revoke cases and `runtime-pairing-web-share-link.test.tsx`; 05 —
`floating-workspace-directory-grant.test.ts` ×3 (`confirm-pick` never resolves).

For 05 only one of its five named files fails; the other four either revert to upstream's own
version (`FloatingWorkspacePane.test.tsx`, `ipc/floating-workspace-directory.test.ts`) or test
overlay-only code (`rpc/methods/floating-workspace.test.ts`). One failing file satisfies the
invariant, but the header's test list overstates what is load-bearing.

## Claims checked

| claim | verdict | evidence |
| --- | --- | --- |
| pin at v1.4.190, 13 patches, no fuzz | true | `git -C lib/orca describe` = v1.4.190; `quilt applied` = 13; series checks 7 & 8 pass |
| `mise run check` exit 0 | true **in a CI-named dir only** | exit 0 reproduced; in this worktree `test:series` fails at check 9 |
| 36 acceptance files / 279 tests; scope 2953 / 29343 | true | reproduced exactly |
| ratchet reports 0 | true | `node config/scripts/check-runtime-electron-ratchet.mjs` → `ok — 0 entries, unchanged` |
| gates hard-coded `orca-server`; patch tests dropped out | true, mechanism confirmed | 14 → 0 patch-carried tests on worktree-refreshed bytes |
| patch bytes left normalized to `orca-server`; check 9 fails here only; re-running rewrites them | true, all three | measured in both directory names, bytes restored |
| D4 — `FloatingWorkspaceDirectoryStore` was only a context line in 08 | **true** | `git show HEAD:patches/execution-owner.diff:99` is a leading-space context line inside 08's import hunk; the only `+` line there is `ensureDefaultFloatingWorkspacePath…`. The symbol now has zero occurrences tree-wide |
| patch 10's deleted `orca-runtime.ts` hunk killed no capability | true | the hunk carried only `getUsageStore` plumbing and three type aliases; zero surviving references to `getUsageStore`/`RuntimeUsageScope`/`RuntimeUsageRange`/`RuntimeUsageBreakdownKind`. The registry is reachable: `setUsageProviderStores` is called at `lib/orca/src/main/index.ts:2551`, inside `app.whenReady()` (opens `:2247`) with no `return` and no `isServeMode` branch between the two |
| plugins-web-bridge follows the two-owner rule | true | one `Index:` (`web-preload-api.ts`, upstream) + one overlay test; `mise run overlay --check` → "disjoint from patches" |
| nothing host-mutating joined `MOBILE_RPC_METHOD_ALLOWLIST` | true | no `plugins.`, `usage.`, `cli.` or `floating` entry in the allowlist; `mobile-rpc-allowlist.test.ts` still carries the negative case per family (`:147,167,176,198,216`) |
| Jira gap withdrawal | **correct** | `lib/orca/src/renderer/src/runtime/runtime-jira-client.ts` routes every method as `target.kind === 'environment' ? callRuntimeRpc(...) : window.api.jira.*`; the local branch's other `window.api.jira` users (`local-jira-search-cancellation.ts:27,31`, `runtime-jira-summary-client.ts:12,34,38`) are reached only from that branch |
| speech left undone as bigger than preload-only | consistent | zero `speech` occurrences in the patched `web-preload-api.ts`; the 17-member / 6-subscription shape L1 describes is a fair reason |
| P3's three `app.getPath('userData')` swaps skipped | true | six occurrences remain in `claude-usage/store.ts:64,69`, `codex-usage/store.ts:70,75`, `opencode-usage/store.ts:36,41`. Harmless for the ratchet — those are upstream `ipc`-side files, and the registry's own imports are type-only |
| W1 (05 owns the `AppEnvironment` swap, once) | done | `lib/orca/src/main/ipc/floating-workspace-directory.ts:4,36,82` use `getAppEnvironment()`; `execution-owner.diff` contributes none of it |
| Duplication #5 (byte-identical duplicate in `floating-workspace-runtime-owner.ts`) | closed | now an alias, `src/renderer/src/lib/floating-workspace-runtime-owner.ts:50` |
| merge candidate 2 (device-name templates) | done | `src/main/runtime/mobile-pairing-service.ts:67,71,75` |
| merge candidate 1 (one shared mint helper for 01+02) | **only half done** | the shared module carries names, not a mint helper; 01 sets `reach: 'this-computer'` inline. The invariant it protects is test-enforced anyway — `trusted-session-pairing-reach.test.ts` "does not widen the reach the runtime grant already pinned" fails with 01 popped |

## Findings

1. **`patches/usage-analytics.diff` has no test that fails without it.** Popped, `usage.test.ts` +
   `mobile-rpc-allowlist.test.ts` give 21 passed / 0 failed (23 with it). `usage.test.ts` is an
   overlay file exercising overlay code (`src/main/runtime/rpc/methods/usage.ts`,
   `src/main/usage/usage-store-registry.ts`) and never touches the patch; the two allowlist cases
   the patch adds live in a patched file, so popping deletes them. Nothing anywhere asserts
   `usage.*` is in `ALL_RPC_METHODS` (`grep -rl ALL_RPC_METHODS src/` → empty) or that
   `setUsageProviderStores` is called at startup. **This got strictly weaker in this bump**: at HEAD
   the overlay handler called `runtime.getUsageStore(...)`, a method the patch added to
   `orca-runtime.ts`, so popping the patch at least broke `test:types`; the registry rewrite removed
   even that. Fix: one overlay test asserting `ALL_RPC_METHODS` contains the eight `usage.*` names.

2. **`patches/cli-registration.diff` has no test that fails without it.** Popped, its three named
   files give 13 passed / 0 failed (19 with it). Same mechanism, same fix. Its `Index:` set is
   byte-identical to HEAD's, so unlike (1) this hole is not new — but it is now visible.

3. **The prefix invariant has no green state.** `test/scripts/series.bats:133-151` (check 9)
   compares each patch against `quilt refresh` output in the *current* directory, while
   `:164-165`, `.mise/tasks/test/unit.sh:31-32` and `.mise/tasks/tree/owner.sh:34` were just made
   directory-agnostic. Committed `orca-server` bytes → `mise run check` cannot pass in this
   worktree; run it here to make it pass → the 13 rewritten patches break CI's check 9. Fix belongs
   at the source (pin quilt's prefix with `QUILT_REFRESH_ARGS="-p ab"` in a `.quiltrc`, then the
   new greps already match `b/lib/orca/…`), not at the readers. Nothing here needs reverting.

4. **`plugins-web-bridge.diff` adds no allowlist test, breaking the pattern 02/04/05/08/10 all
   follow.** Each of those pins its method family off `MOBILE_RPC_METHOD_ALLOWLIST` with a negative
   case. `plugins.*` is upstream's family and upstream leaves it off today, so nothing is wrong now
   — but the repo's invariant is "test-enforced", and for plugins it currently is not. One case in
   `web-plugins-bridge.test.ts` or the allowlist test closes it.

5. **`workspace-restore.diff` and `floating-workspace-picker.diff` headers name test files that do
   not fail without them.** 05 names five, one fails. Series check 5 only proves the named files
   exist, so an over-broad list reads as coverage it does not have. Trim each header to what
   actually fails, or accept that "the header names the tests" is weaker evidence than AGENTS.md
   treats it as.

## Unverified

- Patches 03, 06, 07, 08, 09 and 11 were not popped. A batch walk was attempted, mis-resolved its
  test paths, ran the full 57 992-test suite instead and was killed at the 10-minute cap; I did not
  retry. Their coverage is unmeasured, not assumed good.
- L1's live claims (`browser.screencast.v1` advertised, `desktopWindowStatus: openable`, loopback-only
  bind, `/trusted-session` serving a `scope: "runtime"` offer) were not re-run — they need a Linux
  host of the artifact's arch and this session is macOS. I read the report; I did not reproduce it.
  L1's own limit stands: measured with no browser attached, and the step from "no window now" to
  "a paired web client cannot create one" is inferred there, not measured.
- Whether the web tile *always* has `activeRuntimeEnvironmentId` set — the premise the Jira
  withdrawal rests on for the `kind: 'local'` branch being unreachable. Read from
  `runtime-jira-target.ts` and from patch 06's existence, not exercised.
- `mise run build` and `mise run test:e2e` were not run. CI numbers above cover `check` only.
- No claim is made about whether each patch is still *needed* at v1.4.190. That is
  `orca-patch-audit`'s ruling and I did not re-derive it; I checked that what shipped matches what
  `99-cross-cutting.md` decided, not that the decisions were right.
