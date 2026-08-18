<!-- @kody-ignore — the invariants below ship as explicit rules under .kody/rules/, one per
     file. Auto-import would collapse them into a single LLM-rewritten rule competing with those. -->

# orca-server

Upstream [Orca](https://github.com/stablyai/orca) (Electron, MIT) pinned as the `lib/orca`
submodule, plus a quilt series and our own source that make it a **self-hostable web application**.
The artifact is a Linux AppImage; `orca serve --trusted-proxy` runs behind a subdomain proxy the way
`code-server` does. The goal is the full desktop capability set in the browser.

## Two owners, disjoint

**`patches/` modifies files that exist upstream. `src/` adds files that do not.** No path may be
owned by both; `mise run overlay --check` fails if one is.

The order is always `quilt push -a` → `mise run overlay` → build or test; `mise run up` is both
halves. The overlay copies `src/<path>` to `lib/orca/src/<path>`, so an import reads the same either
way.

**`quilt push` gates `patches/`; `mise run test:types` gates `src/`** — an overlay file cannot fail
to apply, and still breaks when upstream renames something it imports. Neither gate says whether a
capability is still needed; that is the review.

## Commands

| Task | Command |
| --- | --- |
| Assemble the tree | `mise run up` |
| Back to pristine upstream | `mise run down` |
| Who owns a file | `mise run owner <path>` |
| Copy the overlay into another tree | `mise run overlay --into <root>` — e.g. a probe worktree at another tag |
| Typecheck | `mise run test:types` |
| Series integrity (10 checks) | `mise run test:series` |
| Acceptance tests | `mise run test:unit` |
| Tests beside every touched directory | `mise run test:scope` |
| Lint every file type | `mise run lint` |
| Regenerate the tables of contents | `mise run lint:docs` |
| Everything that gates a push | `mise run check` |
| That, then the AppImage | `mise run ci` |
| Build the AppImage | `mise run build [--platform linux/arm64]` |
| Boot it and fetch the web client | `mise run test:e2e` — Linux host of the artifact's arch |
| Move the pin and restack the series | `VERSION=<tag> mise run bump` |
| Publish the tree to the search mirror | `mise run mirror` |
| Push the review rules to Kodus | `mise run kodus:rules` |
| Validate `kodus-config.yml` | `mise run kodus:config` |

Every gate that reads the assembled tree declares `depends = ["up"]` except `test:series`, which
pops and pushes the series itself. `check` sequences them: `test:series` alone, then `up`, then the
rest in parallel. Run `up` by hand only before a hand-run `vitest`.

`mirror` is the exception: it publishes and no gate reads it, so a stale mirror costs search, not
CI. Run it after a bump and after any change to the series — see **Searching Orca** below.

**Every task lives in a folder, and that folder is what CI reads.** `tree/`, `build/` and `test/`
run the full matrix on change; `lint/`, `kodus/` and `hooks/` run lint alone. Put a new task in the
folder matching what it can reach. Short names survive as `#MISE alias`, so `mise run up` reaches
`tree:up`.

`build` targets this machine's architecture; both `linux/amd64` and `linux/arm64` are release
targets, each built on a native runner in CI. The artifact is
`dist/orca-server-<version>-<arch>.AppImage`, where `<arch>` is `uname -m` (`x86_64`, `aarch64`) —
not the `amd64`/`arm64` the platform flag takes.

`hk.pkl` owns the git lifecycle and installs itself from mise's `postinstall`. Pre-commit: hygiene,
`main` refused, diff-scoped flint, `mise run overlay --check`; it runs `fix = true`, so shfmt, rumdl,
ryl, taplo and `flint-setup` rewrite what you are committing. Commit-msg: conventional commit.
Pre-push: `test:series` and `lint:docs`; the Kodus review step is commented out while the branch is
mid-work. The server-side `Kody Code Review` on the pull request is untouched. `hk run check` and
`hk run fix` fire only by name. Bypass one command with `HK=0`. Do not re-run by hand what a hook
already runs.

Silence a lint finding inline, at the line it applies to (`# shellcheck disable=SCxxxx`,
`# hadolint ignore=DLxxxx`, `# zizmor: ignore[rule]`), with the reason. `flint.toml` excludes only
upstream's tree, byte-exact artifacts and verbatim third-party text.

## Write facts, not prose

**A comment states what and why in one or two lines. Never more than the code it explains.** This
binds every doc and every comment in the repo. Do not narrate the reasoning, restate the code in
English, or justify decisions nobody asked about.

This file and `.claude/skills/` load in full every session, so every line is a recurring token cost.
If a comment needs a paragraph, the code needs the rewrite instead.

## Flow

```text
capability: orca-patch-audit (owner and patch) → orca-patch-author → orca-write-test
            → orca-patch-verify
bump:       mise run bump → orca-patch-audit (re-justify: keep | shrink | merge | drop)
            → orca-patch-author → orca-write-test → orca-patch-verify
```

Each step names the canonical skill in `.agents/skills/` that owns it. `.claude/skills/` exposes
the same directories to Claude Code through symlinks. Run the skill rather than reconstructing its
steps.

## Searching Orca

**Do not grep `lib/orca`.** Both trees are indexed on Sourcegraph, and precise navigation crosses
the patch boundary — a patched upstream file resolves into the overlay module it imports.

| question | where |
| --- | --- |
| how upstream does it | `repo:^github\.com/mrkhachaturov/orca-mirror$ rev:pristine` |
| how we do it | same repo, `rev:patched` |
| which patch owns it, and why | `repo:^github\.com/mrkhachaturov/orca-server$` — the `.diff` bodies are indexed as text |
| what the series changes | `compare_revisions pristine → patched` — the diff **is** the series |
| what a bump moves | `compare_revisions v<pin> → v<candidate>` |

`mise run mirror` is what publishes those refs; both branches move, and `patched-<tag>` stays as
the snapshot of that pin. Until it runs, Sourcegraph answers from the previous one.

The `searching-sourcegraph` skill owns tool choice. Two worth knowing: `evaluator` runs Lua across
many searches when a claim needs the **complete** set rather than the first hits, and `deepsearch`
returns a conversation at a stable URL that later sessions read back with `deepsearch_read`.

## The quality bar

**A patch an upstream maintainer would accept.** In order of preference:

1. **Wire up Orca's own building block.** Usually the runtime already holds the data and merely
   fails to project it, or an RPC exists and the web preload stubs past it.
2. **Add a new building block, written properly.** New modules, new dependencies, even a real
   backing service are fine when nothing exists to reuse. It goes in `src/`, at the path it will
   occupy in Orca's tree.
3. Never a workaround — the only banned category. It can never be contributed back and has to be
   re-justified on every bump.

## The one fact behind every tile bug

Upstream's model is two machines — a server owning repos, worktrees, terminals and agent processes,
and a client running the UI. orca-server collapses both onto one host, so `LOCAL_EXECUTION_HOST_ID`
is a fiction, headless drops every window-bound subsystem, and **every capability needs a wire
representation**: local *is* the server, so there is no local fallback. Upstream stubs
`web-preload-api.ts` exactly where no wire exists yet.

## Invariants

Judgement is held every session. Claude loads the path-scoped mechanics from `.claude/rules/`;
other agents must read the matching file before editing:

- `patches/**` or `lib/orca/src/**` → `.claude/rules/quilt-mechanics.md`
- `src/**` → `.claude/rules/overlay-imports.md`
- **Fixing how a step ran does not re-check whether it should run.** When the premise moved — the
  pin, the branch, the tag — re-decide the step instead of re-running a corrected version of it.
- **An unverified claim is labelled unverified.** "I did not check" is an answer; a guess stated as
  a finding is not. A query returning nothing is not evidence of absence — it can also mean the
  query was wrong.
- **A patch applying cleanly is not acceptance.** It can apply and still be redundant or already
  shipped upstream. Every bump re-justifies each patch: keep, shrink, merge or drop.
- **A patch not covered by a test that fails without it does not ship.** "Has a test file" is not
  coverage. Write the test from the header's *To test* symptom, never from the implementation; watch
  it fail before you make it pass.
- **The header names the tests; that naming is the only link left.** New test files live in the
  overlay, so a patch cannot prove coverage by containing one. `series.bats` requires every patch to
  name its tests in backticks and requires those files to exist.
- **A green `vitest` run is not a working build.** vitest transpiles and never typechecks. Casting a
  fixture (`{...} as T`) or leaving a mock as a bare `vi.fn()` hides exactly the errors typecheck
  would catch.
- **Every patch carries a rationale header**: the symptom, the cause and how to check.
- **A path existing in source is not evidence it is taken.** Graph traces and grep hits are leads;
  behavioural claims need a test or a live check.
- **Check the read path before designing the write.** A host-side fix substitutes for a client-side
  one only when the data reaches the client over a surface the client actually reads.
- **Fill a derived field at the publish boundary, never in a snapshot producer.** The snapshot merge
  keeps the cached tab, so a value stamped at build time is frozen or dropped.
- **Nothing deployment-specific enters Orca's source.** Domains, workspace slugs and URL shapes live
  in the template string an operator writes, never in a constant a patch adds.
- **The rename is a build-time overlay, never a patch.** `build/electron-builder.overlay.cjs` sets
  `productName` `orca-server` and `appId` `io.github.mrkhachaturov.orca-server` via
  electron-builder's `extends`, so there is nothing to restack. **userData stays `~/.config/orca`**:
  Electron derives it from `package.json` `name` before `setName()` runs. The MIT license ships
  inside the AppImage.
- **Nothing host-mutating or credential-minting goes on `MOBILE_RPC_METHOD_ALLOWLIST`** — a
  phone-reachable method there would be privilege escalation. Test-enforced.
- **Coder is authentication, Orca is authorisation plus E2EE.** Trusted mode binds the listener to
  loopback and treats that bind as proof the proxy already authenticated. Safe only on a
  single-owner host: any local process can read the offer.

## ⚠️ Launch contract

`squashfs-root/AppRun` is the Electron **desktop** entrypoint and silently ignores a `serve`
positional — it boots the GUI with the stock server on another port and reports success. The
user-facing CLI is the shim at `squashfs-root/resources/bin/orca-ide`. Read
`.mise/tasks/test/e2e.sh` for the launch line rather than reconstructing one; `docs/install.md` is
the public version.

## More

Releasing, the version scheme and upstream bumps: `docs/MAINTAINING.md`. Contributing and the
day-to-day loop: `docs/CONTRIBUTING.md`.
