# open-in-browser-editors — v1.4.190 re-derivation

## Problem

In the tile every "Open in" entry renders disabled with a "Local only" badge, so a worktree
cannot be opened in an editor at all. An entry can only carry a shell `command`, which would
spawn a process on the client machine against a path that lives on another one, so the runtime
disables every entry whenever a runtime environment is set — always, for a web client.

## Still present at v1.4.190

yes.

- `src/shared/ui-chrome-types.ts:6-10` — `OpenInApplication` is still `{ id, label, command }`.
  No `url`, and no adjacent URL concept anywhere on the type or on `GlobalSettings`
  (`src/shared/global-settings-types.ts:211` is still `OpenInApplication[]`).
- `src/renderer/src/lib/external-editor-open-capability.ts:12-14` — a set
  `activeRuntimeEnvironmentId` still returns `{ allowed: false, reason: 'remote-runtime' }`.
  The "Local only" disabling rule did not move.
- `src/renderer/src/components/sidebar/WorktreeOpenInMenu.tsx:39-43,307-312` and
  `src/renderer/src/components/right-sidebar/source-control/listing/entry-context-menu.tsx:46-53`
  still build entries as `{id,label,target,command}` and badge them from that verdict.
- `src/renderer/src/web/web-preload-api.ts:3307` — `openInExternalEditor: () => Promise.resolve({ ok: true })`.
  A stub that reports success, so a `command` entry cannot work in the browser even with the
  guard lifted. The symptom is structural, not a policy toggle.
- All nine upstream files this patch modifies are byte-identical between the tags:
  `git -C lib/orca diff --stat v1.4.188..v1.4.190 -- <path>` is empty for `ui-chrome-types.ts`,
  `external-editor-open-capability.ts`, `WorktreeOpenInMenu.tsx`, `open-in-applications.ts`,
  `open-in-app-catalog.tsx`, `OpenInMenuSetting.tsx`, `client-ui.ts`,
  `store/slices/settings.ts`, `entry-context-menu.tsx`.

## Who owns this logic now

**No block in `00-building-blocks.md` owns it, and no upstream owner exists for the missing
half.** The v1.4.190 host-port work is main-process-side; this patch is renderer + shared + one
RPC method, and none of the nine ports touch external-URL opening.

The upstream owners that do exist — none new at this tag — and which this patch already routes
into:

- **Opening an external URL from the web client**: `shell.openUrl`,
  `src/renderer/src/web/web-preload-api.ts:3308` —
  `window.open(url, '_blank', 'noopener,noreferrer')`. A real implementation, not a stub, and
  byte-identical across the tags. This is what our menu click calls.
- **Opening an external URL from the desktop**: `ipcMain.handle('shell:openUrl')`,
  `src/main/ipc/shell.ts:156-170`. It already parses the URL and returns without acting on any
  scheme other than `http:`/`https:` before reaching `shell.openExternal` (`:168`). Not behind
  a host port — it stays in the `ipcMain` layer, which the runtime graph never reaches, so the
  electron ratchet has no opinion on it.
- **Row shape and validity**: `normalizeOpenInApplications`, `src/shared/open-in-applications.ts`.
  It is the single writer for all three call sites — `src/main/persistence/applying-settings/settings-update.ts:145-146`,
  `src/main/persistence/loading-store/store.ts:1274`, `src/renderer/src/store/slices/settings.ts:98-99` —
  which is why widening it there covers the main-process write path and the load path without
  touching either file.
- **Per-client-kind payload scoping**: `clientKind` on the RPC handler context,
  `src/main/runtime/rpc/core.ts:77`, plumbed by `src/main/runtime/rpc/dispatcher.ts:202,264`
  and `dispatcher-stream-options.ts:11`. Upstream already scopes by it at
  `methods/accounts.ts:153,167`, `methods/client-events.ts:27`, `methods/files.ts:127`. Our
  mobile-withholding in `client-ui.ts` uses that mechanism rather than inventing one.
  `settings.get` is on `MOBILE_RPC_METHOD_ALLOWLIST` at `src/main/runtime/runtime-rpc.ts:384`,
  so the withholding is load-bearing, not decorative.

**`RuntimeBrowserCommandsFactory` does not own this.** Its surface is browser-pane automation —
`browserGoto`, `browserClick`, `browserTabCreate`, … (`src/main/runtime/orca-runtime-browser.ts:334-880`);
there is no external-URL method, and it executes on the host, not in the viewer's browser. That
orcad does not install it (`orcad-entry.ts:8-12`) is irrelevant to this patch: nothing here
reaches the runtime browser cluster, and the `browser_unavailable` proxy is never in the path.
**`RuntimeDesktopSurface` does not own this either** — notification, authoritative window, one
`terminal:tabCreateReply` channel.

What has no upstream owner and would have to be added, exactly as today: the optional `url` on
`OpenInApplication`, `{path}` substitution, and a **render-time** validity verdict. Upstream's
scheme check lives inside the `ipcMain` handler, unreachable from the renderer, and the web
`openUrl` at `:3308` performs none at all — so a client-side validator is required, not
duplicated.

## Verdict

keep — unchanged. Every upstream file it touches is byte-identical across the two tags, no
v1.4.190 block took ownership of any part of it, and the symptom reproduces at the tag.

## Correct shape at v1.4.190

Identical to the current patch. Written today against the tag, it is:

Quilt hunks on upstream files:

- `src/shared/ui-chrome-types.ts` — add optional `url?: string` to `OpenInApplication`.
- `src/shared/open-in-applications.ts` — export `createOpenInApplicationId()` (moved from the
  private copy in `store/slices/settings.ts:60-66`) and `isOpenInApplicationIncomplete()`;
  make `normalizeOpenInApplications` accept `command`-less rows that carry a `url`, and spread
  `url` conditionally. This one edit covers `settings-update.ts:145`, `store.ts:1274` and
  `store/slices/settings.ts:99` — do not add a rule at any of those three.
- `src/renderer/src/lib/external-editor-open-capability.ts` — take `url` in `context`, return
  early for a URL row before the `activeRuntimeEnvironmentId` and `connectionId` guards, and add
  `'invalid-url'` to the failure reasons.
- `src/renderer/src/components/sidebar/WorktreeOpenInMenu.tsx` — delete `OpenInMenuEntry`,
  `getWorktreeOpenInEntries` and `getOpenInEntryAvailability` from this file, re-export them
  from the overlay, add the URL branch at the top of `openWorktreePath` calling
  `window.api.shell.openUrl(resolveOpenInUrl(...))`, and add `openWorktreeOpenInEntry(entry, …)`
  so the whole entry travels to the call.
- `src/renderer/src/components/right-sidebar/source-control/listing/entry-context-menu.tsx` —
  switch its `onSelect` to `openWorktreeOpenInEntry(entry, …)`. This is the call site that
  silently dropped `url`; it is the reason the entry is passed whole rather than destructured.
- `src/renderer/src/components/settings/OpenInMenuSetting.tsx` — extract `OpenInMenuRow` to the
  overlay, use the shared `createOpenInApplicationId`/`isOpenInApplicationIncomplete`, and give
  `createPresetOpenInApplication` a `takenIds` argument (a seeded row may already hold `vscode`,
  and the normalizer dedupes by id keeping the first).
- `src/renderer/src/lib/open-in-app-catalog.tsx` — `getOpenInUrlFaviconDomain()` keyed on the
  entry id, and `OpenInApplicationIcon` accepting `id`/`url`.
- `src/renderer/src/store/slices/settings.ts` — delete the private `createOpenInApplicationId`,
  import the shared one.
- `src/main/runtime/rpc/methods/client-ui.ts` — `settings.get` strips `openInApplications` when
  `clientKind === 'mobile'`.

Overlay files (`src/`), none of which upstream has an equivalent for:

- `src/shared/open-in-url-template.ts` — `resolveOpenInUrl`, `isOpenInUrlTemplateUsable`,
  `isOpenInUrlEntry`, `OPEN_IN_URL_PATH_PLACEHOLDER`.
- `src/renderer/src/lib/open-in-menu-entries.tsx` — `OpenInMenuEntry`,
  `getWorktreeOpenInEntries`, `getOpenInEntryAvailability`, `OpenInMenuEntryIcon`.
- `src/renderer/src/components/settings/OpenInMenuRow.tsx`.
- The `openInApplications` entry and `isSeedableOpenInApplication` in
  `src/shared/runtime-seeded-settings.ts` (that file is patch 06's overlay; this patch
  contributes to it).

Do not: put the scheme check only in `src/main/ipc/shell.ts` and rely on it. That handler is the
desktop path; the web path is `window.open` at `web-preload-api.ts:3308` with no validation, and
neither is reachable at render time, which is where the menu decides enabledness.

Do not: add a `shell.*` RPC method. There is none upstream at v1.4.190
(`git -C lib/orca grep "name: 'shell\." v1.4.190 -- src/main/runtime/rpc` is empty), and the URL
must open in the *viewer's* browser, not on the host.

## Blocks this touches that other patches may share

- **`src/shared/runtime-seeded-settings.ts` (the runtime-seeded settings allowlist)** — not a
  `00-building-blocks.md` block; it is our overlay, introduced by `runtime-seeded-settings.diff`
  (06). This patch adds the `openInApplications` key and `isSeedableOpenInApplication` to it.
  **Coupling is one-directional and confined to the overlay**: `runtime-seeded-settings.diff`
  contains no `openIn` reference at all (verified), so the seeding half of this patch lives
  entirely in the un-patched overlay file plus the `client-ui.ts` hunk, which 06 does not touch.
  If 06's allowlist mechanism changes shape (e.g. the schema map becomes per-client-kind, or
  seeding moves off `settings.get`), **this patch changes with it** — the `openInApplications`
  entry, `isSeedableOpenInApplication` and the `client-ui.ts` mobile strip all sit on that
  mechanism. **Suspected merge candidate with 06 for the cross-patch pass**; my own read is that
  they should stay separate — 06 owns "which keys seed", 07 owns "there is a URL row worth
  seeding" — but the decision belongs to the cross-patch pass, not here.
- **`src/renderer/src/store/slices/settings.ts`** — also touched by `execution-owner.diff` (08).
  Both patches edit the import block near the top (08 adds an import at `:8`, this one rewrites
  the `open-in-applications` import at `:12-15`); 08's body hunk is at `:193` and this one's at
  `:57-66`. Adjacent, not overlapping, and 07 applies first. Coordination note only.
- **`clientKind` RPC handler context (`src/main/runtime/rpc/core.ts:77`,
  `dispatcher.ts:202,264`, `dispatcher-stream-options.ts:11`)** — not a `00-building-blocks.md`
  block. `pairing-credentials.diff` (02) patches all three of those files (it adds
  `trustedMobilePairing` alongside `clientKind`). This patch only *reads* `clientKind` from an
  already-plumbed context in `methods/client-ui.ts`, which 02 does not touch. Suspected shared
  surface: if 02 reshapes the handler context, this patch's `settings.get` hunk reads it.
- **`MOBILE_RPC_METHOD_ALLOWLIST` (`src/main/runtime/runtime-rpc.ts:179-…`, `settings.get` at
  `:384`)** — not a `00-building-blocks.md` block. `mobile-rpc-allowlist.test.ts` is patched by
  `cli-registration.diff` (04), `floating-workspace-picker.diff` (05),
  `execution-owner.diff` (08), `usage-analytics.diff` (10) and `pairing-credentials.diff` (02).
  This patch adds no method to the allowlist; it narrows what an already-allowlisted method
  returns. Suspected shared concern with those five: the invariant "nothing host-mutating or
  credential-minting on the mobile allowlist" is the same rule, applied from the payload side.
- **`the runtime-electron ratchet`** (block name verbatim from `00-building-blocks.md`) — the
  `client-ui.ts` hunk sits inside the `runtime-rpc.ts` entry-point graph. It adds no import, so
  the baseline stays empty. Suspected shared with every patch that touches
  `src/main/runtime/orca-runtime.ts` — 05, 06, 08, 09, 10, 11 — which are the ones that can
  actually break it.
- **`vitest-host-ports-setup`** (block name verbatim) — this patch's eight named test files are
  renderer/shared suites; none installs a host port, and the global `beforeEach` covers whatever
  `AppEnvironment`/`SecretStore` access their import graphs cause. Suspected shared with every
  patch carrying tests, i.e. all of them.

## Unverified

- I did not run anything. No `mise run up`, no `vitest`, no `quilt push`. Every claim above is
  read from `git -C lib/orca show v1.4.190:<path>` and from the patch files on disk.
- I did not verify that the patch still *applies* cleanly at v1.4.190. The file-level diffs
  being empty makes conflicts very unlikely, but "the nine files did not change" is not the same
  check as `quilt push`.
- **`activeRuntimeEnvironmentId` is always set for our web client**: not verified at v1.4.190.
  The web store's default is `null` (`web-preload-api.ts:3863`) and it is written by
  `setActiveRuntimeEnvironmentPreference` (`:762-770`). The "always, for a web client" claim in
  the patch header depends on our own bootstrap (patches 01/08), which I did not trace. If it
  can be `null`, the symptom is worse rather than absent — the entry renders *enabled* and calls
  the `{ ok: true }` stub at `:3307`.
- Whether `getOpenInAppPresets()` contains a preset with an empty `command` — the reason the
  patch adds a `!command` early return to `getOpenInAppPreset` — was not re-checked at the tag.
- I did not enumerate every renderer call site of `getWorktreeOpenInEntries` /
  `openWorktreePath` at v1.4.190 beyond the two menus the patch names; a third caller added
  since v1.4.188 would be a silently-dropped `url` the same way `entry-context-menu.tsx` was.
  `git grep` at the tag showed only those two, but a grep returning nothing more is not proof.
- Whether `www.google.com/s2/favicons` is reachable from a deployed tile (the favicon request
  the header mentions) — not checked; it is upstream's existing behaviour for presets either way.
