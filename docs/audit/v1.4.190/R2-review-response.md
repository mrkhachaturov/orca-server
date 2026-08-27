# Response to R1 — v1.4.190

What each of R1's five findings turned into, plus the coverage R1 left unmeasured. Every number
below was reproduced in this worktree, not carried over.

## Verdict

All five closed. **All thirteen patches now have a test that fails without them** — R1 measured
seven and left six unverified; those six are measured here and all six were already covered.

## Finding 3 — the prefix invariant had no green state

Fixed at the source. `.quiltrc` at the repo root pins `QUILT_REFRESH_ARGS="-p ab"`, reached through
`QUILTRC` in `mise.toml`'s `[env]`; `test/scripts/series.bats` defaults the same variable in
`setup_file`, because check 9 is the check that *writes* patches and bats can be launched outside
`mise`.

Pinning the prefix meant pinning the rest of quilt's config too: `QUILTRC` replaces the host's
`/etc/quilt.quiltrc` wholesale, and that file was supplying `--show-c-function`, `--no-timestamps`
and `QUILT_PATCHES_PREFIX=yes` — the first two shape the committed bytes and the third is what makes
`quilt top` answer `patches/<name>.diff`, which check 9 reads as a path. All are now in the repo,
which is the point: the bytes no longer depend on the host either.

All 13 refreshed. The rewrite is provably minimal — reversing `b/`→`orca-server/` and
`a/`→`orca-server.orig/` on the new bytes reproduces the previous sha256 of all 13 exactly.

Proven in three directory names, patch bytes byte-identical in each (aggregate sha256
`5b66ffb…`):

| directory | gate | result |
| --- | --- | --- |
| `orca-update` (this worktree) | `mise run check` | exit 0 |
| `zz-other-name` (symlink) | `mise run check` | exit 0 |
| `orca-server` (symlink, CI's name) | `mise run test:series` | 10/10 |

`mise run check` at the end: `test:series` 10/10 · `test:types` · `test:unit` **38 files / 298
tests** · `test:scope` 2955 passed / 12 skipped (2967 files), 29 362 passed / 82 skipped · `lint` ·
`kodus:config`.

## Findings 1 and 2 — two patches with no failing test

R1's suggested fix was one `ALL_RPC_METHODS` assertion per patch. Taken, but not alone: it covers
the `rpc/methods/index.ts` registration hunk and nothing else, while the header's *To test* symptom
for both patches is the **preload**, which is where the user-visible failure lives. So each patch
got two things.

| patch | new overlay test | new case | popped |
| --- | --- | --- | --- |
| cli-registration | `web-cli-registration.test.ts` (5 cases) | `cli.test.ts` — the family is registered | **4 red**: 3 routed members + registration |
| usage-analytics | `web-usage-analytics.test.ts` (9 cases) | `usage.test.ts` — the family is registered | **10 red**: 8 methods + provider mapping + registration |

Both preload tests follow `web-plugins-bridge.test.ts`: import the patched `web-preload-api.ts`
through upstream's own `web-preload-api-test-harness`, mock `web-runtime-client`, assert the method
name and params that reach the wire. Popping the patch reverts that file to upstream, so the
assertion fails rather than disappearing — which is exactly what the allowlist cases could not do.

Cases green either way are labelled as guards in the headers, not counted as coverage: `cli`'s two
"unsupported without a server" cases, `cli-registration.test.ts`, and `mobile-rpc-allowlist.test.ts`
for both.

R1's note that patch 10 got *strictly weaker* in this bump is answered: the registration case
restores a real pop failure, and it is stronger than the `test:types` break it replaces because it
names the eight methods rather than one incidental call.

**Still uncovered, and now said in the header instead of implied:** `setUsageProviderStores` in
`main/index.ts`. Nothing here exercises Electron's entry point.

## Finding 4 — plugins had no allowlist test

Closed the way 02/04/05/08/10 do it: two cases in `mobile-rpc-allowlist.test.ts`, carried by
`plugins-web-bridge.diff`, over the six `plugins.*` methods the preload routes — one negative
(not on `MOBILE_RPC_METHOD_ALLOWLIST`) and one registration.

The negative case was proved able to fail: adding `'plugins.setEnabled'` to the allowlist in
`runtime-rpc.ts` turned it red; reverted, bytes verified.

Both cases are guards, not coverage for patch 13 — popping the patch deletes them. Said so in the
header.

## Finding 5 — headers naming tests that do not fail

R1 was **right about 05 and wrong about 12**. Measured:

- **05 floating-workspace-picker** named five files; one failed. `FloatingWorkspacePane.test.tsx`
  and `ipc/floating-workspace-directory.test.ts` revert to upstream's own versions and
  `mobile-rpc-allowlist.test.ts` loses its cases. Rather than trim to one, the registration hole
  underneath was closed the same way as findings 1–2: a case in the overlay
  `floating-workspace.test.ts` over the three `floatingWorkspace.*` names. Popped, that file now
  fails too. Header trimmed to the two that are red and explicit about why the other three are not.
- **12 workspace-restore** names two files and **both fail** — `use-persisted-ui-writer-active-workspace.test.ts`
  three of four, `web-workspace-restore.test.ts` two of four. Nothing to trim. Header now records
  the counts instead of the bare word "covered".

## The six R1 could not measure

Each popped to its own predecessor, its header's named tests run, then pushed back and re-run to
attribute the failures to that patch alone.

| # | patch | popped | pushed back | verdict |
| --- | --- | --- | --- | --- |
| 03 | resource-manager | 3 failed / 1 passed | 4 passed | covered |
| 06 | runtime-seeded-settings | 14 failed / 14 passed | 6 failed / 22 passed | covered — 8 cases flip |
| 07 | open-in-browser-editors | 6 failed / 102 passed | 130 passed | covered |
| 08 | execution-owner | 4 failed / 10 passed | 14 passed | covered |
| 09 | headless-orchestration-delivery | 3 failed / 1 passed | 4 passed | covered |
| 11 | agent-cold-restore | 7 failed / 2 passed | 9 passed | covered |

06's six residual failures with the patch pushed are `shared/runtime-seeded-settings.test.ts` cases
owned by **07**, which is still popped at that point in the walk — the two patches share that file.
The eight that flip on 06's own push are its coverage.

## Unverified

- One `test:scope` file failed on one of five `mise run check` runs and passed on the other four,
  including the final one. Its name was not captured. `test:scope` runs upstream's own ~2 967 files
  around the touched directories, which AGENTS.md already records as not green under parallel load.
- `mise run build` and `mise run test:e2e` were not run.
- The registration cases assert membership in `ALL_RPC_METHODS`. They do not prove the dispatcher
  reaches the handler on a live host — that is what L1 would answer.
- Nothing was re-derived about whether each patch is still *needed* at v1.4.190. That is
  `orca-patch-audit`'s ruling and 99-cross-cutting's; this pass only closed the coverage holes.
