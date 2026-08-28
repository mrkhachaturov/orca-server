# computer-use — what it needs to work in the browser

Paths relative to `lib/orca/`; line numbers are `git -C lib/orca show v1.4.190:<path>` unless a patch
is named. Live probes are on the operator's Coder workspace `ceo/pink-planarian-96` (`orca-server`
4.190.1, upstream pin `v1.4.190`, Linux), reached over `coder ssh` only. No browser was started and
no tab was opened.

## State today

**Tile, published v4.190.1: listed and blank.** Taken from `00-sections.md`, which measured every
section by driving the deployed tile and reading `[data-settings-section]` after each nav click. Not
re-measured here.

Corroborated statically against the shipped tag. `git show v4.190.1:patches/settings-nav-web-parity.diff`
carries `Index:` lines for `useSettingsNavigationMetadata.ts` and its test **only** — no
`Settings.tsx`. Its nav hunk lifts the `computer-use` entry out of the `showDesktopOnlySettings`
array; its test hunk flips `expect(webIds).not.toContain('computer-use')` to `toContain`. Pristine
`Settings.tsx` therefore still ships, and `showDesktopOnlySettings` (`:343`) still wraps the
`computer-use` `<SettingsSection>` (`:1317`). Row present, no section in the React tree.

**Desktop, for contrast** (`ComputerUsePane.tsx`): a permission summary card with a Refresh button,
Accessibility and Screenshots rows each with a status pill and an **Open** button launching the macOS
privacy helper, a **Reset access** link, then the Computer Use skill setup panel.

**Desktop on a Linux host shows less than that**, and this is what the section's gate question turns
on. `ComputerUsePane.tsx:285` computes `isMac = platform === null || platform === 'darwin'` from
`computerUsePermissions.getStatus().platform`, and the whole permission block sits inside
`isMac ? … : null` (`:289`ff). On Linux the pane is the skill panel and nothing else — **on the
desktop too**. Not a web gate.

Measured on the host, over the runtime RPC the tile uses, via the AppImage shim
(`squashfs-root/resources/bin/orca-ide`):

```text
$ orca-ide computer capabilities --json
  ok: false  code "unsupported_capability"
  message "Linux Computer Use requires python3-gi and AT-SPI packages.
           Install python3-gi gir1.2-atspi-2.0 at-spi2-core, then retry."

$ orca-ide computer permissions --json        # = computer.permissions, not permissionsStatus
  ok: true  platform "linux"  helperAppPath null  openedSettings false
  launchedHelper false  nextStep null
  permissions: accessibility "unsupported", screenshots "unsupported"

$ python3 -c 'import gi'                      → ModuleNotFoundError: No module named 'gi'
```

The host is not missing the capability, only its dependencies. `resources/computer-use-linux/runtime.py`
(42887 bytes) ships inside the deployed AppImage, and `orca-ide serve --trusted-proxy --port 6799`
runs under `dbus-run-session -- xvfb-run -a` with a live `Xvfb :99` — a session bus and an X display
are both already there.

The Computer Use skill is **not** installed on this host. `COMPUTER_USE_SKILL_NAME` is `'computer-use'`
(`shared/agent-feature-install-commands.ts:6`); `orca-ide skills installed --json` returns exactly six
— `imagegen`, `openai-docs`, `plugin-creator`, `review-agent`, `skill-creator`, `skill-installer`.

## Which gate, and why

**Gate 2 alone — `Settings.tsx:343`, JSX block at `:1317`.** Gate 1 opened at v4.190.1 and gate 2 did
not; that mismatch is the whole of the blank pane, and the `Settings.tsx:1098` fallback reads gate 1,
so it does not fire.

One detail this section owns: **`:1317` is a shared fragment.** `showDesktopOnlySettings ? (<>…</>) : null`
wraps `computer-use` **and** `voice` together (`:1317-1348`) — verified by reading the pristine file.
Gate 2 cannot be opened for `computer-use` without splitting that fragment, and `voice` must stay
gated (no `speech` preload namespace). The uncommitted `settings-nav-web-parity.diff` in this tree
makes exactly that split.

**Gate 4 does not apply.** `ComputerUsePane.tsx` calls no `isWebClientLocation()`. Its
`platform !== 'darwin'` drop reads `computer.permissionsStatus`'s answer — the **host's** platform,
`process.platform` at `main/computer/macos-computer-use-permission-status.ts:24-33` — not the
client's. It is the host axis, and on this host it is **correct behaviour**: the block it hides is
macOS TCC grants, granted through a helper app on the console. Two rows both stamped "macOS only"
behind a disabled Open button would be noise.

Gate 3 does not apply.

## What the pane actually needs

`web-preload-api.ts` here is `src/renderer/src/web/web-preload-api.ts`.

| wire | state | how established |
| --- | --- | --- |
| `computer.permissionsStatus` → the pane's status read and its `isMac` branch | **real, end to end** | `web-preload-api.ts:3096-3101` routes it with `callRuntimeResult`, not the fallback proxy. Its non-darwin shape is `macos-computer-use-permission-status.ts:24-33`. Not CLI-reachable — see Unverified |
| `computer.permissions` → the Open button | **real; unreachable on Linux** | `web-preload-api.ts:3102-3113` (preload member `openSetup`). Probed over the wire: `platform "linux"`, both permissions `unsupported`. The button lives inside the `isMac` block, so it never draws here. Note its `.catch()` fallback (`:3107-3113`) answers `getBrowserPlatform()` — the *renderer's* platform — so a rejected call would flip `isMac` on a Mac browser against a Linux host |
| `computerUsePermissions.reset` → the Reset access link | **stubbed, and there is no RPC to route it to** | `web-preload-api.ts:3114-3121` resolves a local object, `helperUnavailableReason: 'web_client'`, `permissions: []`. `resetComputerUsePermissions` (`main/computer/macos-computer-use-permissions.ts:82`) has exactly one non-test caller, `main/ipc/computer-use-permissions.ts:32-34` — Electron IPC. `COMPUTER_METHODS` (`runtime/rpc/methods/computer.ts`) has 15 members and no reset; grepped the file for `reset` — only `resetComputerSidecarForTest`. Not a Linux problem: the link is inside the `isMac` block |
| `skills.discover` → the skill panel's installed badge | **real host data** | `web-preload-api.ts:3127-3128` routes it over the wire. Probed: six skills on the host, no `computer-use` |
| `cli.getInstallStatus` / `cli.install` → the panel's PATH prerequisite | **routed to the host by `patches/cli-registration.diff`** | that patch replaces upstream's frozen object with `callRuntimeResult('cli.getInstallStatus')` (its `web-preload-api.ts` hunk) and registers `cli.getInstallStatus` / `cli.install` / `cli.remove`. `ComputerUseSkillSetupPanel.tsx:69-76` calls `window.api.cli.getInstallStatus()` and `ensureOrcaCliAvailableForAgentSkillTerminal()`. `orca-ide` is **not** on the host PATH (measured), so the install branch is the live one. Not exercised — a host write |
| the panel's install terminal | **assumed working; not driven** | `ComputerUseSkillSetupPanel.tsx:60` opens a terminal on the synthetic worktree `settings-computer-use-skill-terminal`. `OrchestrationPane` uses the same `AgentSkillSetupPanel`, and `00-sections.md` measures `orchestration` as *works* in the tile |
| `skills.freshnessInventory` → the "update available" badge | **stubbed empty; no badge either way** | `web-preload-api.ts:3130-3138` returns an inventory with empty `installations` and `eligibleUpdateNames`. `ComputerUseSkillSetupPanel.tsx:83-85` passes `freshnessSkillName` only when `canUseLocalSkillFreshness` (`shouldUseLocalSkillFreshness`: `runtimeTarget?.kind === 'local'`). Whichever branch the tile takes, the result is no badge — either the pane never asks, or it asks and gets nothing. Which branch, see Unverified |
| **`computer.capabilities` → the host's actual readiness** | **exists, answers correctly, and NOTHING in the renderer calls it** | `git -C lib/orca grep "computer\.\(capabilities\|permissionsStatus\|permissions\|listApps\)" v1.4.190 -- src/renderer`, tests excluded, returns exactly two hits — `web-preload-api.ts:3098` and `:3104`, the two members above. Not the pane, not the feature wall, not the nav |

That last row is the finding. `settings-nav-web-parity.diff`'s own nav comment at v4.190.1 justifies
listing the section with *"`computer.capabilities` answers with what this host is missing (on a Linux
host, the python3-gi/AT-SPI packages to install)"*. It does — the CLI probe above returns that exact
string over the same runtime RPC. But no UI on any client asks the question, so an operator opening
the pane on this host is told nothing about it. The message reaches a human only when an agent
attempts a computer-use action and fails.

The same blind spot appears a second time, on a different surface.
`renderer/src/components/feature-wall/agent-capability-setup-status.ts:276-281` computes `ready` as
`helperUnavailableReason === null && permissions.every(p => p.status !== 'not-granted')`. On a
non-darwin host `macos-computer-use-permission-status.ts:24-33` returns `helperUnavailableReason: null`
and two `'unsupported'` entries → **`ready: true`**. Once the skill is installed the feature wall
reports Computer Use as ready on a host where `computer.capabilities` refuses every call. Readiness
is derived from macOS TCC state and from nothing else.

No new preload namespace is needed to fix it. `MobileEmulatorSettingsPane.tsx:132` is upstream's own
precedent: a settings pane calling `callRuntimeRpc({ kind: 'local' }, 'emulator.availability', {})`
with no preload member. `runtime/runtime-rpc-client.ts:83-84` routes `kind: 'local'` to
`window.api.runtime.call`, which the web preload wires to `callRuntimeEnvelope`
(`web-preload-api.ts:1432`) — a real call against the connected server returning the envelope intact
(`:3502-3522`), so `unwrapRuntimeRpcResult` (`runtime/runtime-rpc-result.ts:64-69`) throws a
`RuntimeRpcCallError` carrying `error.message` verbatim. The actionable package string reaches the
renderer over exactly the route the CLI probe just used.

`COMPUTER_METHODS` carries no member on `MOBILE_RPC_METHOD_ALLOWLIST` — the set is
`main/runtime/runtime-rpc.ts:179-442` (not `mobile-rpc-allowlist.ts`, which is only the test), and
the file contains no `computer.` string at all. Adding a read of `computer.capabilities` to a pane
does not change that.

## Verdict

**works partially — the host-readiness surface is missing.**

Open gate 2 and the pane draws the Computer Use skill panel with real host data: the install badge is
`skills.discover`, the CLI prerequisite is routed by `cli-registration.diff`, and the install terminal
runs on the host where the skill files land. The macOS permission block correctly stays hidden on a
Linux host. That is a working pane, and it is worth listing.

It is not the whole capability. What the operator cannot see anywhere in the product is that this host
answers `unsupported_capability` to every computer-use call, and exactly which three packages fix it.
The skill can be installed to completion and Computer Use will still refuse, with the pane and the
feature wall both reporting green. `computer.capabilities` already answers with the fix; nothing asks
it.

Not a browser limitation. Nothing here is client-side: the same pane on desktop Linux is equally
blind. Every wire needed already exists and answers correctly.

## Size of the work

**Two pieces, and they should not be one patch.**

*1 — open gate 2.* `Settings.tsx:1317`: split the shared `computer-use` + `voice` fragment, leave
`voice` gated, unwrap `computer-use`. Two companions move with it or the pane draws a stale badge:
`Settings.tsx:776-785`, the nav install badge `next.set('computer-use', …)` inside the same
`if (showDesktopOnlySettings)` block (`voice`'s `next.set` at `:786-795` stays behind), and
`:354-358`, `enabled: showDesktopOnlySettings` on `useInstalledAgentSkill`. Owner:
**`patches/settings-nav-web-parity.diff`** — shared dependency 7; it already owns
`useSettingsNavigationMetadata.ts` and takes `Settings.tsx` with it. The version uncommitted in this
tree already adds a `Settings.tsx` `Index:` line. Do not open this in a second patch:
`pairing-credentials.diff` already carries a `Settings.tsx` hunk at `:1741-1747` and a third owner
would collide.

*2 — surface host readiness.* A **new patch**; `ComputerUsePane.tsx` is unowned today
(`grep '^Index:.*[Cc]omputer' patches/*.diff` → no match). Roughly 40 lines: a `useEffect` calling
`callRuntimeRpc({ kind: 'local' }, 'computer.capabilities', {})` on mount and on Refresh, and a
banner above the skill panel rendering `error.message` when it rejects — the string is written to be
read by a human and already names the packages. Reuse, not new logic: the RPC, the error mapping and
the transport all exist. Quality bar tier 1. Ordering: after `settings-nav-web-parity.diff` in
`series`, because the pane it edits is unreachable in the tile until gate 2 opens.

Its test comes from the header's *To test* symptom, not the implementation: mock
`window.api.runtime.call` to return the `unsupported_capability` envelope and assert the pane renders
the package list. A second case worth writing while here — `agent-capability-setup-status.ts`
reporting `ready: true` for two `unsupported` permissions — is the same defect on the feature wall and
belongs with it if that surface is in scope.

Not in scope, recorded so it is not lost: `computerUsePermissions.reset` has no RPC to route to, and
the web stub's `helperUnavailableReason: 'web_client'` would flip a **Mac** host's pane to
unavailable and disable every control. Adding `computer.permissionsReset` to `COMPUTER_METHODS` is
the fix. Unreachable on this Linux host.

## Blocks this shares with other sections

From `00-sections.md`'s shared-dependency list:

- **(1) `Settings.tsx:343` and its 11 JSX gates.** `computer-use` is one of them, and its JSX
  fragment at `:1317` is **physically shared with `voice`** — the only place in the file where two
  sections sit in one gated fragment. Opening one edits the other's block. `mobile`, `orca-account`,
  `browser`, `ssh`, `plugins`, `notifications`, `advanced`, `mobile-emulator`,
  `developer-permissions` and `dev` are the other consumers of the same `const`.
- **(2) the gate-1/gate-2 pairing rule.** `computer-use` is the section that made the mismatch
  visible; whatever test reads both files covers all 35.
- **(6) the `hostPlatform` axis.** `computer-use` reads the host's platform through
  `computer.permissionsStatus`, not through `windowsTerminalCapabilities.hostPlatform`. Its answer is
  already host-correct, so it needs no move — but it is a **third** way to ask the same question, and
  anyone unifying the axis for `mobile-emulator` and `developer-permissions` should know this one
  exists and is fine.
- **(7) `patches/settings-nav-web-parity.diff` ownership.** Piece 1 lands there. Piece 2 does not, and
  must not.

Shared blocks not on that list, found here:

- **`AgentSkillSetupPanel` + `cli.*` + `skills.discover`.** One component, seven surfaces:
  `orchestration` (`OrchestrationPane.tsx`), `linear` (`LinearAgentSkillPane.tsx`), `tasks`
  (`TasksPane.tsx:212` → `TaskSourceLinearSetup`), `general` (`GeneralPane.tsx:209` → `CliSection`),
  `experimental` (`ExperimentalPane.tsx:307` → `EphemeralVmsPane`), `mobile-emulator`
  (`MobileEmulatorSettingsPane.tsx:307` → `MobileEmulatorAgentControlRow`), and `computer-use`. Any
  change to `cli.getInstallStatus` routing, to `skills.discover`, or to the panel's terminal moves all
  seven. `cli-registration.diff` already fixed all seven at once — that is why the `computer-use`
  skill panel works in the tile today with nothing else done.
- **`skills.freshnessInventory` stubbed empty.** Same seven, plus `share-skills`. Empty for every
  client in the tile, so no skill panel there shows an update badge. Honest today; if freshness ever
  routes over the wire it lights up everywhere at once.
- **`callRuntimeRpc({ kind: 'local' }, …)` as a settings pane's escape hatch.** Shared with
  `mobile-emulator`, which uses it for `emulator.availability`. It works in the tile
  (`web-preload-api.ts:1432`), and it is why piece 2 needs no preload change. Any section needing an
  RPC the web preload does not expose can take this route — `plugins`' missing
  `install`/`refresh`/`remove` cannot, because the methods do not exist server-side, but a read of an
  existing method can.
- **The feature wall's `computerUseReady`.** `agent-capability-setup-status.ts` is not a settings
  section, but it reads `computerUsePermissions.getStatus()` — the same call this pane makes — and
  draws the wrong conclusion on a non-Mac host. Fixing readiness in one place fixes both.

## Unverified

- **The tile screenshot.** "Listed and blank" is `00-sections.md`'s measurement, taken as given per
  instruction. Independently corroborated only statically, from the shipped patch's `Index:` lines and
  pristine `Settings.tsx:1317`.
- **`computer.permissionsStatus` over the wire.** The CLI exposes 14 `computer` verbs and
  `permissions` is `computer.permissions` (its JSON carries `openedSettings`/`launchedHelper`, not
  `helperUnavailableReason`) — so `permissionsStatus` was **not** probed. `helperUnavailableReason: null`
  on this host, which is what drives both the pane's `isMac` branch and the feature wall's
  `ready: true`, is read from `macos-computer-use-permission-status.ts:24-33`, not measured. *Probe
  that would settle it:* call `computer.permissionsStatus` over the runtime RPC directly, or read
  `window.api.computerUsePermissions.getStatus()` in the tile.
- **Which freshness branch the tile takes.** `shouldUseLocalSkillFreshness` needs
  `runtimeTarget?.kind === 'local'`, and that resolves from `settings.activeRuntimeEnvironmentId`
  (`runtime-client-target.ts:5-10`, `single-runtime-legacy-owner.ts:6-17`) — a runtime value, not a
  static one. Not read. The outcome is no badge on either branch, so nothing above depends on it.
  *Probe:* read `activeRuntimeEnvironmentId` from the tile's settings.
- **Whether the pane renders correctly once gate 2 opens.** Nothing was built: no `quilt push`, no
  `mise run up`, no `vitest`, no AppImage. The wires were probed; the pane was not drawn. *Probe:*
  build the branch, open Settings › Computer Use in the tile, read `[data-settings-section="computer-use"]`.
- **The skill install terminal in the tile.** Reasoned from `orchestration` using the same
  `AgentSkillSetupPanel` and measuring as *works*. Not driven — the button installs software on the
  host. *Probe:* click Install in Settings › Orchestration and confirm the terminal opens.
- **`cli.install` on this host.** `orca-ide` is not on PATH (measured), so the prerequisite path would
  call it. Not run — a host write.
- **A Mac host.** The `reset` stub flipping a Mac pane to unavailable, `openSetup`'s `.catch()`
  returning the browser's platform, and the Open button's behaviour are read from source. The only
  live host is Linux.
- **Whether installing `python3-gi gir1.2-atspi-2.0 at-spi2-core` actually makes
  `computer.capabilities` succeed here.** The error names them; that they are sufficient under
  `Xvfb :99` + `dbus-run-session` is not tested. Not attempted — a host mutation.
- **Search.** The Cmd+J palette and the settings search box both carry `computer-use` via
  `getComputerUsePaneSearchEntries()` in gate 1. A hit landing on the blank pane is the same defect
  through a second door; not exercised.
- **No browser was started and no tab opened.** All live evidence is `coder ssh` shell probes and
  read-only `orca-ide` RPC reads (`computer capabilities`, `computer permissions`, `computer --help`,
  `skills installed`) plus process and filesystem reads. Nothing was written, the server on 6799 was
  not touched, and no token or generated link is reproduced here.
