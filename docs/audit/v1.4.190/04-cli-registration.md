# cli-registration — v1.4.190 re-derivation

## Problem

Every agent-skill setup card (Orchestration, Browser Use, Computer Use, Linear, Ephemeral VMs,
Mobile Emulator, Settings > CLI) warns "Orca CLI registration is unavailable" and can never
register `orca-ide`. `createCliApi()` in the web preload is a hardcoded `supported:false` stub,
though the terminal those cards open runs on the connected server where the CLI exists.

## Still present at v1.4.190

yes.

- `src/renderer/src/web/web-preload-api.ts:2998-3021` — `createCliApi()` unchanged: one frozen
  `status` object with `supported: false`, `state: 'unsupported'`,
  `unsupportedReason: 'launch_mode_unavailable'`, detail "CLI registration is managed on the Orca
  server, not in the web browser."; all six members return it. Wired at `:911` (`cli: createCliApi()`).
- `src/renderer/src/lib/agent-skill-cli-prerequisite.ts:78-94` — `showCliPrerequisiteWarning`
  branches on `!status.supported` first and raises the "Orca CLI registration is unavailable"
  toast (`:82`).
- No `cli.*` runtime RPC exists upstream: `git grep "'cli\." v1.4.190 -- src` returns nothing, and
  `src/main/runtime/rpc/methods/` has no `cli.ts`.
- `src/main/ipc/cli.ts` is byte-identical between v1.4.188 and v1.4.190 (not in
  `git diff --stat v1.4.188..v1.4.190 -- src/main/ipc/cli.ts`). Its three local handlers still hold
  the logic inline (`:59-73`), and `import { ipcMain } from 'electron'` (`:1`) is the file's only
  electron dependency.

Partially covered elsewhere, and it does not close the gap: desktop `--serve` best-effort
auto-installs the CLI at boot on darwin/linux (`src/main/index.ts:3245-3261`, present at v1.4.188
too). That is a fire-and-forget install with a `console.log`; it gives the card no status probe, no
remove, and no error surface, and `orcad` does not do it at all (`src/main/orcad/orcad-entry.ts`
has no `CliInstaller` reference).

## Who owns this logic now

**Modules split out of `src/main/ipc/*` to keep the runtime graph Electron-free** — the block that
owns the shape of the fix. The three functions our patch exports from `ipc/cli.ts` are exactly what
upstream now moves out of the handler file into a domain module.

The transitively-owning blocks:

- **AppEnvironment** — `CliInstaller` no longer imports `app`; at v1.4.190 it reads
  `getAppEnvironment().isPackaged()` / `.getPath('userData')` / `.getAppPath()`
  (`src/main/cli/cli-installer.ts:2,96,97,100`). So `CliInstaller` is already host-agnostic and
  needs no work from us.
- **The runtime-electron ratchet** — the gate our current shape violates.
  `config/runtime-electron-baseline.txt` is comments only and must stay empty; `runtime-rpc.ts` →
  `rpc/dispatcher.ts:15` → `ALL_RPC_METHODS` reaches our overlay method module, so
  `rpc/methods/cli.ts` → `ipc/cli.ts` → `electron` is a baseline entry.
- **orcad** — `config/scripts/build-orcad.mjs:72-91` scans its own bundle and exits 1 on any
  electron importer, so the same import also breaks `pnpm run build:orcad`.

Nothing upstream owns the *web* half: the wire representation (`cli.getInstallStatus` / `cli.install`
/ `cli.remove`) and the preload routing must still be added by us.

## Verdict

shrink — the capability and the RPC stay; the `ipc/cli.ts` hunk shrinks to a pure
extract-and-delegate that matches upstream's own v1.4.190 split, which takes the electron import out
of the runtime graph.

## Correct shape at v1.4.190

Upstream's precedent (PR #15927 and siblings): the logic moves to a **new domain module**, the
`ipcMain` registration stays behind and imports from it. Three instances at the tag —
`src/main/preflight/agent-detection.ts:1-7` out of `ipc/preflight.ts:1-18`;
`src/main/ssh/ssh-target-registry.ts:5-18` out of `ipc/ssh.ts`;
`src/main/plugins/plugin-client-list.ts:6-10` out of `ipc/plugins.ts`. The RPC method module then
imports the domain module directly — `rpc/methods/preflight.ts:9` imports
`'../../../preflight/agent-detection'`, not `'../../../ipc/preflight'`. Do the same for CLI.

Five files.

1. **New overlay file `src/main/cli/cli-registration.ts`** (does not exist upstream —
   `git ls-tree v1.4.190 src/main/cli/` confirms; `src/` is the right owner). Moves verbatim out of
   `ipc/cli.ts`: `hydrateLocalShellPathForCli(force = false)` (`ipc/cli.ts:47-57`, private) plus
   `getCliInstallStatusWithShellPathHydration` / `installCliWithShellPathHydration` /
   `removeCliWithShellPathHydration`. Imports `CliInstaller` from `./cli-installer`,
   `hydrateShellPath` + `mergePathSegments` from `../startup/hydrate-shell-path`, and the
   `CliInstallStatus` type from `../../shared/cli-install-types`. All four are electron-free at
   v1.4.190 (verified: `git grep "from 'electron'" v1.4.190 -- src/main/cli/
   src/main/startup/hydrate-shell-path.ts` is empty). File header in upstream's own idiom: split out
   of `ipc/cli.ts` so the runtime's `cli.*` RPC reaches it without dragging `ipcMain` into its
   module graph.

2. **`patches/cli-registration.diff` hunk on `src/main/ipc/cli.ts`** becomes delete-and-delegate,
   not add-exports:
   - delete `hydrateLocalShellPathForCli` and the three inline handler bodies;
   - add `import { getCliInstallStatusWithShellPathHydration, installCliWithShellPathHydration,
     removeCliWithShellPathHydration } from '../cli/cli-registration'`;
   - `registerCliHandlers` becomes `ipcMain.handle('cli:getInstallStatus',
     getCliInstallStatusWithShellPathHydration)` and the two siblings — same three lines the patch
     already produces;
   - drop the now-unused imports `CliInstaller` (`:3`) and `hydrateShellPath, mergePathSegments`
     (`:11`). Keep `WslCliInstaller`, `getCanonicalUserDataPath`, `getDefaultWslDistro` and the
     `CliInstallStatus` type — the three WSL handlers (`:75-117`) still use them and stay put.
   - No `export * from '../cli/cli-registration'` compat re-export: `register-core-handlers.ts:3` is
     the only importer of `ipc/cli` at the tag (`ipc/cli.test.ts:33` aside), so nothing needs it.
     Upstream added one in `ipc/preflight.ts:18` only because that file had many importers.

3. **`src/main/runtime/rpc/methods/cli.ts`** (overlay, exists): change the import specifier from
   `'../../../ipc/cli'` to `'../../../cli/cli-registration'`. That single line is the whole ratchet
   fix — the three `defineMethod` bodies, the names, and the "not on
   `MOBILE_RPC_METHOD_ALLOWLIST`" comment are unchanged.

4. **`src/main/runtime/rpc/methods/cli.test.ts`** (overlay, exists): retarget
   `vi.mock('../../../ipc/cli', …)` (`:13`) to `'../../../cli/cli-registration'`. Assertions unchanged.

5. **`web-preload-api.ts` and `mobile-rpc-allowlist.test.ts` hunks unchanged.** The preload routing
   (`requireActiveEnvironmentOrNull()` gate, `callRuntimeResult` for the three real methods,
   `wslUnsupportedStatus` for the three WSL members) is still correct: nothing upstream at v1.4.190
   routes `cli:*` over the wire, and the `rpc/methods/index.ts` one-line registration is still the
   only way in.

Also update the patch header's *To test* line to name the new file's test alongside `cli.test.ts`
and `mobile-rpc-allowlist.test.ts` — `series.bats` requires every named test file to exist.

Net effect on the measured ratchet: this patch's contribution drops from 1 to 0. The remaining
entry is patch 05's, not ours.

## Blocks this touches that other patches may share

- **Modules split out of `src/main/ipc/*` to keep the runtime graph Electron-free** —
  **`floating-workspace-picker.diff` (05) has the identical defect, verified not suspected**: its
  overlay `src/main/runtime/rpc/methods/floating-workspace.ts:5` imports
  `'../../../ipc/floating-workspace-directory'`, and that upstream file imports `app` from
  `electron` at `src/main/ipc/floating-workspace-directory.ts:4`. Those two overlay files are the
  only ones in `src/` that reach into `main/ipc/` at all. The same extract-to-domain-module fix
  applies, and the two should be decided together.
- **The runtime-electron ratchet** — the two entries measured with the series applied are this patch
  and 05, nothing else. `pairing-credentials.diff` (02), `floating-workspace-picker.diff` (05) and
  `usage-analytics.diff` (10) all add lines to the same `src/main/runtime/rpc/methods/index.ts`
  import + `ALL_RPC_METHODS` spread, so their hunks collide on context even though only 05's method
  module reaches electron. `usage.ts` and `mobile-pairing.ts` in the overlay import no `ipc/` module
  and are clean.
- **orcad** — anything that adds to `ALL_RPC_METHODS` lands in the orcad bundle too, so 02, 05 and
  10 share the stricter `build-orcad.mjs` gate with this patch.
- **AppEnvironment** — consumed transitively via `CliInstaller`. Suspected sharers:
  `trusted-proxy-session.diff` (01), which touches `src/main/index.ts` where all nine ports are
  installed (`:885-912`), and `src/cli/**`. Suspicion only — I did not read 01's hunks.
- **vitest-host-ports-setup** — a test for the new `cli-registration.ts` that constructs a real
  `CliInstaller` needs an installed `AppEnvironment`; the global setup already provides a benign
  default, so it likely needs nothing extra. Any patch whose tests construct main-process objects
  shares this — suspected: `runtime-seeded-settings.diff` (06), `execution-owner.diff` (08),
  `agent-cold-restore.diff` (11). Suspicion only.
- **Shared upstream files, not blocks, that the cross-patch pass still has to sequence**:
  `src/main/runtime/mobile-rpc-allowlist.test.ts` is appended to by 02, 04, 05, 08, 10;
  `src/renderer/src/web/web-preload-api.ts` by 01, 02, 03, 04, 05, 06, 08, 12. Note
  `execution-owner.diff` (08) touches
  `src/renderer/src/components/settings/CliSkillRuntimeSetup.tsx` — the Settings > CLI card this
  patch's status must render into. Suspected overlap in intent; I did not read 08's hunk on it.

## Unverified

- **Whether importing `ipc/cli.ts` under `orcad` fails at require() time.** `node_modules` is not
  installed in this worktree (`lib/orca/node_modules/electron` absent), so I could not execute it.
  What is verified from source: `build-orcad.mjs:29` keeps `electron` external and its header
  (`:20-24`) states the intent is that "a residual import fails loudly at require() time rather than
  silently bundling the npm package's installer shim, which is what happened the first time and made
  the bundle look clean while it was not" — i.e. upstream has observed the shim resolving in a dev
  checkout. My reading is that with `node_modules/electron` present the CJS `require('electron')`
  resolves to the installer shim (a path string), `ipcMain` is `undefined`, and only calling
  `ipcMain.handle` throws; with it absent it is `MODULE_NOT_FOUND` at load. Not executed either way.
- I did not run `config/scripts/check-runtime-electron-ratchet.mjs`; the "0 bare / 2 patched" figures
  are taken as given from the brief and corroborated only by reading imports.
- Behaviour of `CliInstaller` under `orcad`'s `AppEnvironment` (`isPackaged() === true`,
  `getAppPath() === process.cwd()`, `process.execPath` = the node binary). Read from source it looks
  like it degrades to `unsupported`/`launcher_missing` rather than registering a wrong target,
  because `appImagePath` falls back to `process.env.APPIMAGE ?? null`
  (`cli-installer.ts:122-125`) and `resolveLauncherPath()` then finds no bundled launcher. Not
  executed. Irrelevant to our AppImage deployment, where `--serve` runs under Electron and `$APPIMAGE`
  is set — but relevant if orca-server ever boots `orcad`.
- I did not read the hunks of patches 01, 06, 08, 10, 11; every cross-patch claim about them above
  is labelled a suspicion and derives only from the `Index:` file lists in `patches/`.
- Whether upstream intends to add `cli.*` RPC itself. `git grep` at v1.4.190 finds no such method and
  no TODO naming one; a query returning nothing is not proof of absence.
- Whether `mise run test:series` / typecheck pass with the proposed shape. Nothing was assembled or
  built — this audit is read-only against the tag.
