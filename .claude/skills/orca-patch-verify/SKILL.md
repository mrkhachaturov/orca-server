---
name: orca-patch-verify
description: >-
  Verify a patch before pushing. Every gate is a mise task; this names the order and what
  to do when one fails. Run after `orca-patch-author`.
when_to_use: >-
  After writing or editing any patch, before pushing, and to check the series after the submodule
  pin moves. Triggers: "is this ready", "verify the patch", "run the tests", "did I break
  anything".
---

# Verify a patch

```bash
mise run test:types    # typecheck the assembled tree
mise run test:series   # series integrity: 10 checks over patches/, series and the tree
mise run test:unit     # the acceptance tests the series and the overlay carry
mise run test:scope    # every test in the directories either owner touches
mise run lint          # flint over the whole repo: shell, markdown, yaml, toml, Dockerfile, workflows
mise run build         # assembles, typechecks inside the sandbox, bundles and packages
mise run test:e2e      # Linux host only — see below
```

`mise run check` is the first five: `test:series` alone, then `mise run up`, then `test:types`,
`test:unit`, `test:scope` and `lint` in parallel. `test:series` pops and pushes the series, so it
cannot share a tree with the gates reading it. `mise run ci` adds the build. Run `check` locally
rather than learning from a red pipeline.

hk's pre-push hook runs `test:series` and `lint:docs`; pre-commit runs diff-scoped flint plus
`mise run overlay --check`. `mise run check` covers everything the hooks do not.

Each gate derives its file list from patches ∪ overlay, so a new file in either owner is picked up
without editing a list. A hand-run `vitest` or `pnpm run typecheck:tsc` assembles nothing:
`mise run up` first.

**Run `test:types` first, and never skip it.** It is the cheapest gate and fails fastest; a push
already shipped with 1161 tests passing locally and three files not building. Do not lean on
`mise run build` to reach it for you.

**What actually needs Linux:**

| Step | On macOS |
| --- | --- |
| `mise run test:types` | runs anywhere |
| `mise run build` | **runs** — it builds `linux/<host arch>` in Docker, so on Apple Silicon that is a native `linux/arm64` build, and arm64 is a release target rather than a stand-in for amd64. `--platform linux/amd64` cross-builds under QEMU: slow, and a failure there can be emulation rather than your change. |
| `mise run test:e2e` | **cannot run.** It extracts the AppImage and executes `squashfs-root/resources/bin/orca-ide` on the host, which is a Linux ELF. Needs a Linux host or container of the artifact's architecture. |

Before the first local run: `mise run up`, then `cd lib/orca && pnpm install --frozen-lockfile`.

## When one fails

**`test:series`** — a patch is stale or applies with fuzz: `quilt push` to that patch, `quilt
refresh`, `quilt push -a`. Two of its 10 checks fail for other reasons. Check 5 wants every patch
header to name a test file, in backticks, that exists under `lib/orca/src`. Check 10 wants every
file in the submodule tree owned by a patch or the overlay; a file owned by neither was written
before `quilt add` and is in nothing.

**`test:unit`** — the patch's own acceptance test. This one means your change is wrong.

**Missing-module errors instead of assertion failures, in any suite** — the overlay is not in the
tree. `mise run overlay`, then re-run. Only happens to a hand-run `vitest` or typecheck.

**`test:scope`** — a test the patch never names. Check for a value import from a hub module
evaluated at module scope first; that shape takes out whole directories. Upstream's suite is not
green under parallel load, so run the same directories against the bare pinned tag before blaming
the patch:

```bash
# Absolute: `git -C` resolves a relative path against lib/orca, not the root.
git -C lib/orca worktree add --detach "$PWD/.cache/pristine" "$(git -C lib/orca describe --tags)"
cd .cache/pristine && pnpm install --frozen-lockfile
pnpm exec vitest run --config config/vitest.config.ts <dirs>
```

A failure that reproduces there is upstream's. Note it and move on.

**`test:e2e`** — the AppImage builds but does not serve. Its output names which check failed:
readiness on `GET /web-index.html`, or a listener on `0.0.0.0` meaning trusted-proxy did not engage.

**`lint`** — flint names the tool, the file and the line. Fix it there, or silence it there with an
inline directive carrying the reason (`# shellcheck disable=SC2086`). `flint.toml` scopes what the
linters may read; it is not where a finding gets quietened.

**`test:types`** — the first gate above, and re-run inside `mise run build`. The task clears the
incremental info itself; stale `tsbuildinfo` reports errors you fixed and hides ones you just wrote.
A hand-run typecheck must do it too, with `find config -name '*.tsbuildinfo' -delete` rather than
`rm -f config/*.tsbuildinfo`: under zsh a glob with no match aborts the whole command chain, so the
typecheck silently never runs and the empty output reads as success.

A type error in a *test* is the common case, because vitest never sees it. Two that have shipped: a
fixture naming a key that is not on the type (hidden by an `as T` cast, which disables
excess-property checking), and a bare `vi.fn()` — `Mock<Procedure>` satisfies any prop, so a renamed
prop still compiles. See `orca-write-test`.

## The live tile

After the workspace rebuilds. A rebuild mints a new name, so discover it each time:

```bash
WS=$(coder list -o json | jq -r '.[0].name')
coder ssh "$WS" -- 'ss -ltn; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:6799/web-index.html'
```

Pass: `ss -ltn` shows `LISTEN 127.0.0.1:<port>`, `/web-index.html` is 200, `/trusted-session` from
loopback is 200 with the offer JSON, and the subdomain tile loads the UI with no pairing prompt.
