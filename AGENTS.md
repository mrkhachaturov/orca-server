# orca-server

Upstream [Orca](https://github.com/stablyai/orca) (Electron, MIT) pinned as the `lib/orca`
submodule, plus a quilt series and our own source that make it a **self-hostable web application**.
The artifact is a Linux AppImage; `orca serve --trusted-proxy` runs behind a subdomain proxy the way
`code-server` does.

The goal is the full desktop capability set in the browser. YOLO-mode agents must not run on a
laptop, so the server has to be reachable and the browser a first-class client rather than a
degraded desktop.

## Two owners, disjoint

**`patches/` modifies files that exist upstream. `src/` adds files that do not.** No path may be
owned by both; `mise run overlay --check` fails if one is.

The order is always `quilt push -a` → `mise run overlay` → build or test; `mise run up` is those two
halves in that order. The overlay copies `src/<path>` to `lib/orca/src/<path>`, so an import reads
the same either way. Our code runs inside Orca's process; only the storage location differs.

This splits the bump gates. **`quilt push` gates `patches/`; `mise run test:types` gates `src/`.**
An overlay file cannot fail to apply, and still breaks when upstream renames or drops something it
imports. Neither gate says whether a capability is still needed — that is the review.

## Commands

| Task | Command |
| --- | --- |
| Assemble the tree | `mise run up` |
| Back to pristine upstream | `mise run down` |
| Who owns a file | `mise run owner <path>` |
| Typecheck | `mise run test:types` |
| Series integrity (10 checks) | `mise run test:series` |
| Acceptance tests | `mise run test:unit` |
| Tests beside every touched directory | `mise run test:scope` |
| Shell lint | `mise run lint:shell` |
| Everything above that gates a push | `mise run check` |
| Build the AppImage | `mise run build` |
| Boot it and fetch the web client | `mise run test:e2e` — Linux/amd64 only |

`mise run overlay --into <root>` copies the overlay into another tree, for a probe worktree at
a different tag.

## Flow

A capability change:

```
decide the owner and the patch → write it → test it red before green → gate it
```

An upstream bump:

```
mise run bump → re-justify each patch: keep | shrink | merge | drop → write → gate
```

The restack decides nothing. A clean restack means the patches still apply, which is not the
same as still being needed.

Under Claude Code each step is a skill in `.claude/skills/`: `orca-patch-audit`,
`orca-patch-author`, `orca-write-test`, `orca-patch-verify`. Run the skill rather than
reconstructing its steps.

## The quality bar

**A patch an upstream maintainer would accept.** A workaround has to be re-justified on every bump
and can never be contributed back. In order of preference:

1. **Wire up Orca's own building block.** Usually the runtime already holds the data and merely
   fails to project it, or an RPC exists and the web preload stubs past it.
2. **Add a new building block, written properly.** New modules, new dependencies, even a real
   backing service are fine when nothing exists to reuse. It goes in `src/`, at the path it will
   occupy in Orca's tree.
3. Never a workaround. That is the only banned category.

The code should read as though upstream wrote it, because the goal is that upstream takes it.

## The one fact behind every tile bug

Upstream's model is two machines — a server owning repos, worktrees, terminals and agent processes,
and a client running the UI. orca-server collapses both onto one host. So `LOCAL_EXECUTION_HOST_ID`
is a fiction, headless drops every window-bound subsystem, and **every capability needs a wire
representation**: there is no "just do it locally" fallback, because local *is* the server.

Upstream stubs `web-preload-api.ts` exactly where no wire exists yet.

## Invariants

- **Order in the series is data**, held in `patches/series`. Patches are named for the capability
  they add. There is no such operation as renumbering, and no patch identifier belongs in a code
  comment — name the rule instead.
- **A new file is never a quilt operation.** It goes in `src/`. Nothing is `quilt add`ed, nothing
  refreshed, and it cannot conflict on a bump.
- **`quilt add` before touching a file that exists upstream.** An edit to a file not in the current
  patch is invisible to `quilt refresh` — it stays in the working tree, the tests pass, and the
  series does not carry it. `series.bats` fails a working-tree file owned by neither owner, which is
  the only way that failure is visible.
- **A patch applying cleanly is not acceptance.** It can apply and still be redundant or already
  shipped upstream. Every bump re-justifies each patch: keep, shrink, merge or drop.
- **A patch not covered by a test that fails without it does not ship.** "Has a test file" is not
  coverage — every patch had one while four were untested in substance, and one shipped a green test
  asserting its own defect. Write the test from the header's *To test* symptom, never from the
  implementation; watch it fail before you make it pass.
- **The header names the tests; that naming is the only link left.** A new test file lives in the
  overlay, so a patch cannot prove coverage by containing one. `series.bats` requires every patch to
  name its tests in backticks and requires those files to exist.
- **A green `vitest` run is not a working build.** vitest transpiles and never typechecks, so a test
  that does not compile passes locally and fails minutes into CI. Casting a fixture (`{...} as T`)
  or leaving a mock as a bare `vi.fn()` hides exactly the errors typecheck would catch.
- **Every patch carries a rationale header** saying the symptom, the cause and how to check.
- **A path existing in source is not evidence it is taken.** Graph traces and grep hits are leads;
  behavioural claims need a test or a live check.
- **Check the read path before designing the write.** A host-side fix substitutes for a client-side
  one only when the data reaches the client over a surface the client actually reads.
- **Fill a derived field at the publish boundary, never in a snapshot producer.** The snapshot merge
  keeps the cached tab, so a value stamped at build time is frozen or dropped.
- **Value imports from a hub module go in a leaf under `src/shared/`,** and nothing crossing an
  import cycle may be evaluated at module scope. One violation took out 411 upstream tests while the
  patch's own tests stayed green.
- **Nothing deployment-specific enters Orca's source.** Domains, workspace slugs and URL shapes live
  in the template string an operator writes, never in a constant a patch adds. A patch that only
  works for one install is not contributable and will not survive a bump.
- **Upstream's identity stays untouched** — `productName` Orca, `appId` `com.stablyai.orca`,
  userData `~/.config/orca`. Only the release asset carries our name. The MIT license ships inside
  the AppImage.
- Anything host-mutating or credential-minting is never on `MOBILE_RPC_METHOD_ALLOWLIST`; a
  phone-reachable method there would be privilege escalation. Test-enforced.
- **Coder is authentication, Orca is authorisation plus E2EE.** Trusted mode binds the listener to
  loopback and treats that bind as proof the proxy already authenticated. Safe only on a
  single-owner host: any local process can read the offer.

## ⚠️ Launch contract

`squashfs-root/AppRun` is the Electron **desktop** entrypoint and silently ignores a `serve`
positional — it boots the GUI with the stock server on another port and reports success. The
user-facing CLI is the shim at `squashfs-root/resources/bin/orca-ide`. The `test:e2e` task encodes
the whole launch line; read `.mise/tasks/test/e2e.sh` rather than reconstructing one.
`docs/install.md` is the public version.

## More

Releasing, the version scheme and upstream bumps: `docs/MAINTAINING.md`. Contributing and the
day-to-day loop: `docs/CONTRIBUTING.md`.
