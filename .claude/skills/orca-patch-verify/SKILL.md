---
name: orca-patch-verify
description: >-
  Verify a patch before pushing. Every gate is a script in `ci/dev/`; this names the order and what
  to do when one fails. Run after `orca-patch-author`.
when_to_use: >-
  After writing or editing any patch, before pushing, and to check the series after the submodule
  pin moves. Triggers: "is this ready", "verify the patch", "run the tests", "did I break
  anything".
---

# Verify a patch

```bash
./ci/build/overlay.sh       # copy src/ into lib/orca/src — after quilt push -a
cd lib/orca && find config -name '*.tsbuildinfo' -delete && pnpm run typecheck:tsc && cd ../..
./ci/dev/test-scripts.sh    # series integrity: 10 checks over patches/, series and the tree
./ci/dev/test-unit.sh       # the acceptance tests the series and the overlay carry
./ci/dev/test-scope.sh      # every test in the directories either owner touches
./ci/build/build-appimage.sh    # quilt push -a, overlay, typecheck again, then bundles and packages
./ci/dev/test-e2e.sh            # Linux/amd64 host only — see below
```

All of these run in CI on every push. Run them locally to gate the push instead of learning from a
red pipeline.

**Two owners, one order.** `patches/` modifies files that exist upstream; `src/` — the overlay — is
the files that do not, checked in plain and never in a patch. Both have to be in the tree before it
means anything, so the order is always `quilt push -a` → `./ci/build/overlay.sh` → build or test.
`test-unit.sh`, `test-scope.sh` and `build-appimage.sh` call the overlay themselves and derive their
file lists from patches ∪ overlay, so a new file in either owner is picked up without editing a
list. A hand-run `vitest` or `pnpm run typecheck:tsc` calls nothing. `./ci/build/overlay.sh --check`
copies nothing and asserts the one thing the layout forbids: a path owned by both.

**Typecheck first, and never skip it.** `vitest` transpiles and does not typecheck, so a whole
green run proves nothing about whether the code compiles. This has already shipped a push where
1161 tests passed locally and three files did not build. It is the cheapest gate and it fails
fastest — run it before the suites, not after. Do not lean on
`build-appimage.sh` to reach it for you.

**What actually needs Linux:**

| Step | On macOS |
| --- | --- |
| `pnpm run typecheck:tsc` | runs anywhere |
| `build-appimage.sh` | **runs** — Docker buildx emulates the pinned `linux/amd64` from `docker-bake.hcl`. Slow under QEMU on Apple Silicon, and emulation can fail for reasons that are not your change, so read a failure here sceptically. |
| `test-e2e.sh` | **cannot run.** It extracts the AppImage and executes `squashfs-root/resources/bin/orca-ide` on the host, which is an x86_64 Linux ELF. Needs a Linux/amd64 host or a container. |

Before the first local run: `quilt push -a`, `./ci/build/overlay.sh`, then `cd lib/orca && pnpm
install --frozen-lockfile`.

## When one fails

**`test-scripts.sh`** — a patch is stale or applies with fuzz. `quilt push` to that patch, `quilt
refresh`, `quilt push -a`. Two of its 10 checks fail for other reasons: check 5 wants every patch
header to name a test file, in backticks, that exists under `lib/orca/src` — a test that lives in
the overlay is still the patch's, and the header is the only thing that says so. Check 10 wants
every file in the submodule tree owned by a patch or the overlay; a file owned by neither was
written before `quilt add` and is in nothing.

**`test-unit.sh`** — the patch's own acceptance test. This is the one that means your change is
wrong.

**Missing-module errors instead of assertion failures, in any suite** — the overlay is not in the
tree, so everything that imports one of our files fails to resolve it, and it reads like a broken
import you just wrote. `./ci/build/overlay.sh`, then re-run. Only ever happens to a hand-run
`vitest` or typecheck; the scripts copy it in themselves.

**`test-scope.sh`** — a test the patch never names. Check for a value import from a hub module
evaluated at module scope before anything else; that shape takes out whole directories. Upstream's
suite is not green under parallel load, so run the same directories against the bare pinned tag
before blaming the patch:

```bash
git -C lib/orca worktree add --detach .cache/pristine "$(git -C lib/orca describe --tags)"
cd .cache/pristine && pnpm install --frozen-lockfile
pnpm exec vitest run --config config/vitest.config.ts <dirs>
```

A failure that reproduces there is upstream's. Note it and move on rather than fixing it in a patch.

**`test-e2e.sh`** — the AppImage builds but does not serve. Its own output names which check failed:
readiness on `GET /web-index.html`, or a listener on `0.0.0.0` meaning trusted-proxy did not engage.

**Typecheck** — the first gate above, and also re-run inside `build-appimage.sh`. Clear the
incremental info first: stale `tsbuildinfo` reports errors you fixed and hides ones you just wrote.
Use `find config -name '*.tsbuildinfo' -delete`, not `rm -f config/*.tsbuildinfo`: under zsh a glob
with no match aborts the whole command chain, so the typecheck silently never runs and you read the
empty output as success.

A type error in a *test* is the common case, because vitest never sees it. Two that have shipped:
a fixture naming a key that is not on the type (hidden by an `as T` cast, which disables
excess-property checking), and a bare `vi.fn()` — `Mock<Procedure>` satisfies any prop, so a
renamed prop still compiles. See `orca-write-test`.

## The live tile

After the workspace rebuilds. A rebuild mints a new name, so discover it each time:

```bash
WS=$(coder list -o json | jq -r '.[0].name')
coder ssh "$WS" -- 'ss -ltn; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:6799/web-index.html'
```

Pass: `ss -ltn` shows `LISTEN 127.0.0.1:<port>`, `/web-index.html` is 200, `/trusted-session` from
loopback is 200 with the offer JSON, and the subdomain tile loads the UI with no pairing prompt.
