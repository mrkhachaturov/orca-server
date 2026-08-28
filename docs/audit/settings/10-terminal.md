# terminal - what it needs to work in the browser

Paths relative to `lib/orca/`; line numbers are `git -C lib/orca show v1.4.190:<path>`.

## State today

The section is listed and renders. Six sub-sections are composed by `TerminalPane`
(`src/renderer/src/components/settings/TerminalPane.tsx:60-118`); on the deployed `v4.190.1`
(Linux host) the operator sees five of them:

| sub-section | tile @ v4.190.1 | desktop |
| --- | --- | --- |
| Windows Shell (`TerminalWindowsShellSection`) | hidden | hidden on a Linux host too |
| Rendering - GPU acceleration | renders, works | same |
| Interaction - scroll speed, right-click paste, link actions | renders, works | same |
| Setup Script - launch mode | renders, **writes nothing the host reads** | writes the host store |
| Manage Sessions - session table, Kill, Kill All, Restart Daemon | renders, **table always empty; every button a no-op** | lists live daemon sessions |
| Advanced - scrollback, word separators, (+ Mac keyboard) | renders, works | same |

**Measured live over the CLI, no browser.** On `ceo/pink-planarian-96` running the published
artifact, the PTY daemon is up headless - PID 915,
`out/main/daemon-entry.js --socket ~/.config/orca/daemon/daemon-v36.sock` - and owns two live
shells, PIDs 4635 and 4649, both `ppid=915`. The tile's Manage Sessions table shows zero rows for
those two sessions, because `window.api.pty.management.listSessions` is a hardcoded stub
(`src/renderer/src/web/web-preload-api.ts:3413`).

Also measured on the host store `~/.config/orca/profiles/local-default/orca-data.json`:
`"setupScriptLaunchMode":"new-tab"`, `"terminalScrollbackRows":5000`,
`"terminalGpuAcceleration":"auto"`. `setupScriptLaunchMode` is the value the runtime reads
(`src/main/runtime/orca-runtime.ts:24069-24072`, `requireStore().getSettings()`); no web-client edit
can move it.

**Correction to `00-sections.md`.** That table attributes terminal's "renders partially" to
`TerminalAppearanceSection.tsx:86` (Warp theme import). `TerminalAppearanceSection` is not in this
pane - its only consumer is `AppearancePane.tsx:29,248`. **The terminal pane contains no
`isWebClientLocation()` site at all.** Its partial state has a different cause, below.

## Which gate, and why

**Not gate 1.** `useSettingsNavigationMetadata.ts:405-414` lists `terminal` in group `workflows`
with no `showDesktopOnlySettings`. `settings-nav-web-parity.diff` does not touch it.

**Not gate 2.** `Settings.tsx:1526-1548` renders `<SettingsSection id="terminal">` outside every
`showDesktopOnlySettings ? ... : null` block. Terminal is not one of the eleven.

**Gate 4, two sites, neither of them `isWebClientLocation()`:**

1. `TerminalPane.tsx:57` - `showWindowsHostSettings = isWindowsTerminalHost ?? isWindows`. Hides
   Windows Shell + PowerShell implementation. `isWindowsTerminalHost` reaches the pane from
   `Settings.tsx:918-930` via `isWindowsTerminalCapabilityHost({... hostPlatform:
   windowsTerminalCapabilities.hostPlatform})` - the **host** axis, web-aware. Gate 1 computes the
   identical expression at `useSettingsNavigationMetadata.ts:737-742` and feeds
   `getTerminalPaneSearchEntries` the same flag (`terminal-search.ts:105,112-117`). The two gates
   agree. Correct as it stands on a Linux host.
2. `TerminalPane.tsx:58` -> `TerminalAdvancedSection.tsx:299` - `isMac = isMacUserAgent()`. Hides
   `TerminalMacKeyboardSection`. This is the **renderer** axis, and here that is the right axis:
   `terminalMacOptionAsAlt` is consumed only by xterm in the renderer
   (`terminal-pane/terminal-appearance.ts:207`, `use-terminal-pane-lifecycle.ts:1651`) - it is about
   the keyboard the operator is typing on, not the host's platform. Correct as it stands. It is
   **not** the `hostPlatform`-vs-renderer disagreement that `mobile-emulator` and
   `developer-permissions` have.

So no gate needs opening. What is broken is behind the gates: **two of the six sub-sections render
fully and do nothing** - Manage Sessions (no wire) and Setup Script (no write path).

`getManageSessionsSearchEntries()` is unconditional in `getTerminalPaneSearchEntries`
(`terminal-search.ts:120`), so settings search and Cmd+J both route an operator to a control that
cannot work.

## What the pane actually needs

### 1. A `pty.management` wire - Manage Sessions

| thing | state | how established |
| --- | --- | --- |
| preload `window.api.pty.management.*` (5 members) | **explicitly stubbed** - `listSessions -> {sessions: [], degraded: false}`, `killAll -> {killedCount: 0, ...}`, `killOne -> {success: false}`, `restart -> {success: false}`, `macTccAttribution -> {health: 'unknown'}` | read at `web-preload-api.ts:3412-3420` |
| RPC family | **absent** | `TERMINAL_METHODS` (`rpc/methods/terminal.ts:1186`) and `TERMINAL_ORPHAN_METHODS` (`terminal-orphan.ts:107`) enumerate 36 methods; none is a daemon-session method. `terminal.list` is the tab/pane list, not the daemon's session list |
| host implementation | **exists and runs headless** | `src/main/ipc/pty-management.ts:54-176` implements all five over `getDaemonProvider()`. Live: daemon PID 915 with two child shells under `orca serve` |
| host registration | **window-bound** | `registerDaemonManagementHandlers()` is called only from `window/attach-main-window-services.ts:141`, reached from `index.ts:1591` inside window creation. Headless never calls it - and would not benefit, since it registers `ipcMain` channels no web client can reach |
| the daemon itself under `orca serve` | **runs** | `index.ts:1041-1046`, comment: "both desktop and headless serve must adopt the same persistent provider before creating terminals or a renderer"; serve takes the `else` branch at `index.ts:3204-3205` |

**Note on the stub, not the fallback proxy.** `createFallbackProxy`
(`web-preload-api.ts:4534-4594`) is not the mechanism here. `pty.management` is a real object with
five real functions returning correctly-shaped empties, so the pane never errors, never toasts, and
shows an honest-looking "no sessions". That is worse than a throw: it is indistinguishable from a
host with no terminals, on a host that has two.

Why it is stubbed: the whole `pty` namespace is stubbed
(`web-preload-api.ts:3330 createPtyApi`) because web terminals ride `terminal.*` runtime RPC instead
of local PTY IPC - `spawn` rejects with "Local PTYs are unavailable in the web client." That
reasoning is right for the other 40 members and wrong for `management`, which inspects the **host's**
daemon, not a local one. Management got swept up with the namespace.

Building block: **Modules split out of `src/main/ipc/*`** (`00-building-blocks.md`) - `pty-management.ts`
imports `ipcMain` at line 1, but `getDaemonAdapters`, `isDaemonDegraded`, `collectSessions` and the
kill-ladder polling are Electron-free.

### 2. A settings write path - Setup Script

| thing | state | how established |
| --- | --- | --- |
| `setupScriptLaunchMode` in `SettingsUpdate` | **absent** | read `rpc/methods/client-ui-schemas.ts:128-166`; the schema is `.strict()`, so sending it today is a rejected write |
| `setupScriptLaunchMode` in `syncRuntimeBackedSettings` | **absent** | read `web-preload-api.ts:3960-3988` - six keys, none terminal |
| `setupScriptLaunchMode` in `pickRuntimeSeededSettings` | **absent** | read `src/shared/runtime-seeded-settings.ts:43-86` - seeds `terminalThemeDark`/`terminalThemeLight`/`terminalUseSeparateLightTheme` only, first visit only, one-way |
| host reader | **exists** | `orca-runtime.ts:24069-24072` and `ipc/worktree-remote.ts:359-360`, both `store.getSettings()`. Live store value `"new-tab"` |

`TerminalSetupScriptSection.tsx:70-72` writes exactly this one key. It is the only setting in this
pane that the host reads and the browser cannot reach.

### 3. Settings that already work from the browser - no wire needed

Verified by tracing each key's consumers, not by grepping a method list:

- `terminalScrollbackRows` - the renderer applies its own backlog cap
  (`lib/pane-manager/pane-terminal-output-scheduler.ts:111-112`) and its own xterm `scrollback`
  (`use-terminal-pane-lifecycle.ts:1639-1641`), and the value **does** reach the host as an RPC
  parameter: `terminal.subscribe`/`terminal.read` take `scrollbackRows`
  (`rpc/methods/terminal.ts:1136`), and the client supplies it from its own xterm options
  (`pty-connection.ts:7752,8213,8464`). The main-side read at `ipc/pty/delivery/pending.ts:21` is on
  the local-PTY delivery gate that web panes bypass by design.
- `terminalGpuAcceleration` - renderer only (`pane-manager.ts:263`, `pty-connection.ts:2869`).
- `terminalScrollSensitivity` / `terminalFastScrollSensitivity` / `terminalTuiScrollSensitivity`,
  `terminalWordSeparator`, `terminalRightClickToPaste`, `terminalMacOptionAsAlt` - renderer only;
  zero non-test `src/main` behavioural readers.
- `terminalWindowsShell`, `terminalWindowsPowerShellImplementation` - host-read
  (`ipc/pty/provider/local-configure.ts:37`, `daemon/pty-subprocess.ts:732-745`) and equally
  unreachable from the browser, but correctly hidden on a non-Windows host by gate-4 site 1. They
  become the same defect as Setup Script the day the host is Windows.

These persist to this browser's localStorage only, so they do not follow the operator to another
browser or device. That is a durability gap, not a functional one.

## Verdict

**Works partially - two sub-sections need a wire built first.**

- Rendering, Interaction, Advanced (incl. Mac keyboard), Windows Shell: **work**, and their gates are
  on the correct axes. Nothing to open.
- **Manage Sessions: needs a wire built first.** No `pty.management` RPC family exists; the preload
  is a shaped stub. The host implementation and the live data both exist under `orca serve` -
  measured, PID 915 with two sessions.
- **Setup Script: needs a write path first.** `setupScriptLaunchMode` is absent from both the
  `syncRuntimeBackedSettings` allowlist and the `.strict()` `SettingsUpdate` schema.
- `macTccAttribution` on a Linux host is correctly `'unknown'`; on a **Mac** host the tile would
  still report `'unknown'` and silently withhold the severed-TCC warning that desktop shows. Same
  wire as Manage Sessions.

## Size of the work

Two independent pieces. Neither belongs in `settings-nav-web-parity.diff` - that patch owns the two
nav gates, and terminal is behind neither.

**A. `pty.management` over the wire - a new patch, `terminal-session-management.diff`.**

1. Overlay, `src/main/ipc/pty/daemon-session-management.ts` (new file, ours): the Electron-free half
   of `pty-management.ts` - `getDaemonAdapters`, `isDaemonDegraded`, `collectSessions`,
   `listDaemonSessions`, `killAllDaemonSessions` (with the 65x100ms ladder), `killOneDaemonSession`,
   `restartDaemonSessions`, `readMacTccAttribution`. Straight extraction; no new behaviour.
2. Patch `src/main/ipc/pty-management.ts`: the five `ipcMain.handle` bodies become one-line calls
   into (1). Desktop behaviour byte-identical.
3. Overlay, `src/main/runtime/rpc/methods/pty-management.ts` (new file, ours): `PTY_MANAGEMENT_METHODS`
   - `ptyManagement.listSessions`, `.killAll`, `.killOne`, `.restart`, `.macTccAttribution` - each
   calling (1). Follows `plugin-client-list.ts` and `ssh-target-registry.ts` as the same seam.
4. Patch `src/main/runtime/rpc/methods/index.ts`: register the family. Same one-line shape as
   `usage-analytics.diff:106` and `floating-workspace-picker.diff:212`.
5. Patch `src/renderer/src/web/web-preload-api.ts:3412-3420`: replace the five stubs with
   `callRuntimeResult` calls. `resource-manager.diff` and `plugins-web-bridge.diff` both already
   carry hunks in this file - check for overlap before restacking.
6. Patch `src/main/runtime/mobile-rpc-allowlist.test.ts`: assert **none** of the five is on
   `MOBILE_RPC_METHOD_ALLOWLIST`. `ptyManagement.restart` restarts the host's PTY daemon and
   `.killAll` tears down every live shell - phone-reachable, that is host mutation. This is the
   invariant the test exists for.
7. Test, overlay: drive `ManageSessionsSection` with a preload whose `listSessions` resolves two
   sessions and assert two rows; today's stub gives zero. Symptom-first, per the *To test* rule.

Roughly one new overlay module, one new RPC family, four patch hunks. No new dependency, no new
service.

**B. `setupScriptLaunchMode` reaching the host - extends an existing patch.**

The key must be added in both places or the write is rejected: `SettingsUpdate`
(`rpc/methods/client-ui-schemas.ts:128`) and the `syncRuntimeBackedSettings` allowlist
(`web-preload-api.ts:3960`). This is shared dependency 3+4 verbatim, so it is **not** terminal's to
land alone - whichever patch widens that pair for Browser/Advanced/Notifications adds this key in the
same hunk. `settings.update` is on `MOBILE_RPC_METHOD_ALLOWLIST`; `setupScriptLaunchMode` is a UI
preference with no host-mutating effect, so widening is acceptable, but it must be stated.

The alternative - `web-share-surfaces.diff`'s shape, a separate narrow method off `SettingsUpdate` -
is not worth it for one enum. Fold it into the shared widening.

## Blocks this shares with other sections

From `00-sections.md`'s shared-dependency list:

- **(3) `syncRuntimeBackedSettings` / `getRuntimeBackedStoredSettings`** and **(4) `SettingsUpdate`
  `.strict()`** - piece B is the same widening `browser` (4 keys), `advanced` (3 keys) and
  `notifications` need. One hunk, one schema change, four sections fixed. Whoever lands it must add
  `setupScriptLaunchMode`.
- **Modules split out of `src/main/ipc/*`** (`00-building-blocks.md`) - the same seam
  `ssh` needs for `ssh-target-registry.ts`. Both are an `src/main/ipc/*` module whose logic is
  Electron-free and whose only Electron dependency is the `ipcMain.handle` registration. Doing one
  establishes the shape for the other; they do not collide (different files).
- **(5) `createFallbackProxy`** - explicitly **not** the mechanism here, unlike `voice`, `jira` and
  `plugins`. `pty.management` is a shaped stub, so the proof that it is dead is the stub's source,
  not a live probe. Recording it so no one re-derives it.
- **(6) the `hostPlatform` axis** - terminal uses `isWindowsTerminalCapabilityHost({... hostPlatform})`
  identically in gate 1 (`useSettingsNavigationMetadata.ts:737-742`) and gate 2
  (`Settings.tsx:918-930`). It is the **worked example** of the axis being right in both places, and
  the fix template for `mobile-emulator` and `developer-permissions`, which use the host axis in gate
  1 and the renderer axis in gate 2.
- **(7) `settings-nav-web-parity.diff`** - terminal does **not** need a hunk in it. Neither gate 1 nor
  gate 2 gates this section. Anyone editing that patch should leave terminal alone.

Found here, not in that list:

- **`TerminalTccAttributionNotice`** is rendered by both `ManageSessionsSection.tsx:217` and
  `DeveloperPermissionsPane.tsx:319`, and both read `pty.management.macTccAttribution`. Piece A fixes
  the notice in **`developer-permissions`** as well - one of the two sections that becomes
  listed-and-blank on a Mac host, and the one where the severed-TCC warning matters most.
  `useMacTccAttributionSeveredNotice.ts:9` deep-links into `MANAGE_SESSIONS_SECTION_ID`, so the
  app-wide severed banner is dead on the web today for the same reason.
- **`TerminalAppearanceSection`** (Warp theme import, `isWebClientLocation()` at `:86`) belongs to
  **`appearance`**, not to terminal - its only consumer is `AppearancePane.tsx:248`. The `appearance`
  agent owns that gate; `00-sections.md`'s terminal row should be corrected to point at it.
- **`runtime-seeded-settings.diff`** seeds `terminalThemeDark`, `terminalThemeLight` and
  `terminalUseSeparateLightTheme` on first visit. Those are `appearance`'s controls, not this pane's;
  no terminal-pane key is seeded.
- **`terminal.subscribe` / `terminal.read` `scrollbackRows`** (`rpc/methods/terminal.ts:1136`) is a
  per-request RPC parameter, not a setting - it is why `terminalScrollbackRows` works from the
  browser without any allowlist change. Any section arguing "terminal settings cannot reach the
  host" should read this first.

## Unverified

- **The tile's Manage Sessions table was not observed.** Phase 0 measured `terminal` as "renders
  partially" and I did not drive the tile. The empty table is inferred from the stub's source plus
  the live daemon holding two sessions the tile cannot be showing. **Probe that settles it:** open
  Settings > Terminal on the tile, scroll to Manage Sessions, read the table body; then in the same
  console `await window.api.pty.management.listSessions()` and compare with the host's PID 915 child
  list.
- **Kill All / Restart Daemon were not clicked.** `killAll -> {killedCount: 0, remainingCount: 0}`
  and `restart -> {success: false}` are read from the stub; whether `useDaemonActions` toasts an
  error or silently closes the dialog on `success: false` was not traced. Both are host-mutating and
  I did not exercise them against the live workspace.
- **`setupScriptLaunchMode` was not written from the tile.** The store value `"new-tab"` was read on
  the host and the key's absence from `SettingsUpdate` and the sync allowlist was read from source.
  I did not observe a `settings.update` rejection.
- **A Windows host.** `terminalWindowsShell` and `terminalWindowsPowerShellImplementation` being
  unreachable from the browser is reasoned from the same two allowlists; the only live host is Linux,
  where the section is correctly hidden.
- **A Mac host.** `macTccAttribution` returning `'unknown'` on the web against a macOS host, and the
  desktop returning `'severed'`, is read from `pty-management.ts:62-69` and the stub. Not measured.
- **`PtyIpcSurface` / `PtyPowerSurface`** (`ipc/pty-host-bindings.ts:22,29`, no-op when absent) were
  not traced. They are named here only because they sit in the same subsystem; whether they bear on
  `pty.management` was not established.
- **Nothing was assembled or built.** No `quilt push`, no `mise run up`, no `vitest`, no typecheck.
  The overlay/patch split proposed above is a plan, not a compiled one.
- **Live probes were reads only**, over `coder ssh`: `ps`, `ls ~/.config/orca`, and four `grep -o`
  key reads from `profiles/local-default/orca-data.json`. No file written, no process signalled, no
  daemon touched, no browser started.
