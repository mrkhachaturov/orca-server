# L1 — the live `orca serve` check

Run against `dist/orca-server-4.190.0-aarch64.AppImage`, built from this tree, booted in an
Ubuntu 24.04 arm64 container via the launch line in `.mise/tasks/test/e2e.sh`:
`resources/bin/orca-ide serve --trusted-proxy --port 6799` under `dbus-run-session` + `xvfb-run`.
Facts below are read off `orca-ide status --json` against that running server.

## Answers

**Contradictions #4 — is `browser.screencast.v1` advertised? YES.**
The 49 advertised capabilities include `browser.screencast.v1`, `browser.tab-create-known-id.v1`,
`browser.headless.v1`, `browser.certificate-trust.v1`. Patch 08's ten
`browser-pane/stream-remote/**` files rest on a capability that is live. **Corollary the audit
asked for and nobody had checked:** the filter is `hasRenderer || hasOffscreen`, and `hasRenderer`
is false here (below), so the `--serve` path *does* install an offscreen browser backend.

**Contradictions #5 — is `getAvailableAuthoritativeWindow()` null? YES.**
`app.desktopWindowStatus` is `openable`. It is published as `hasRenderer ? 'available' : fn()`
(`orca-runtime.ts:6127`), and `openable` is the constructor default `fn`, so `hasRenderer` is
false — the accessor returned null. This is what 09 needs (its leaf graph stays empty) and what 11
needs (`presentation:'background'` reaches the background spawn branch). Both are confirmed.

*Limit:* measured with no browser attached. A web client cannot publish a window graph
(`syncWindowGraph` is a stub and there is no `graph.*` RPC), so attaching one cannot create an
authoritative window — but that step is inferred, not measured.

**Patch 01's bind invariant holds at v1.4.190.** `ss -ltn` shows `LISTEN 127.0.0.1:6799` only, and
`GET /trusted-session` returns a `scope: "runtime"` offer to a loopback peer.

## Still unverified

- **08 item 3** — whether a worktree row stamped `runtime:<env>` can coexist with a null
  `activeWorkspaceExecutionHostId`. It needs a browser session with a project worktree activated
  from the sidebar; the CLI cannot reach renderer store state. Not answered.

## Correction to `99-cross-cutting.md`

The **Gaps** section lists jira as one of three capabilities where "the wire already exists
upstream" and the web preload stubs past it. **Jira is not a gap.**
`src/renderer/src/runtime/runtime-jira-client.ts` already routes every method to
`callRuntimeRpc(target, 'jira.<name>', …)` whenever `getJiraRuntimeTarget()` resolves an
environment, falling back to `window.api.jira` only for `kind: 'local'`. The web tile always has
`activeRuntimeEnvironmentId` set, so it never takes that branch. Zero occurrences of `jira` in
`web-preload-api.ts` is the correct design, not a stub.

The claim was derived by counting namespace occurrences in `web-preload-api.ts`, which the
cross-cutting pass itself labelled unverified. Speech and plugins *are* real gaps; they are not
the same size as each other:

- **plugins** — 21 preload members, 6 with a runtime method. Done (`plugins-web-bridge.diff`).
- **speech** — 17 preload members whose names do not correspond to the eight `speech.*` RPC
  methods at all (`getCatalog`/`downloadModel`/`startDictation`/`feedAudio` vs
  `speech.models.list`/`speech.dictation.start`), and six of the seventeen are event
  subscriptions (`onPartialTranscript`, `onDownloadProgress`, …) that need a push channel the
  RPC namespace proxy does not provide. Not a preload one-liner: it needs a name adapter and a
  streaming design. Not done.

---

## L1b — the share surfaces, measured on the deployed workspace

A second pass, against a *deployed* server rather than a locally built AppImage: Coder workspace
`ceo/pink-planarian-96` running orca-server v4.190.0 (Orca v1.4.190) on Debian 13, launched as
`orca-ide serve --trusted-proxy --port 6799` under `dbus-run-session` + `xvfb-run`. Reached from a
browser over `coder port-forward` to 127.0.0.1, so the peer is loopback and `/trusted-session`
answers 200. RPC results are read by calling `window.api.runtime.call` from the tile itself, which
is the paired-client path; DOM facts are read off the rendered page, not inferred from components.

### What the live box answered

**Both `artifacts.*` and `skills.*` answer over the wire, unpatched.** `artifacts.list` and
`artifacts.getPublishedLink` return `{status:'reconnect-required'}` — so `setArtifactService`
*does* run on the `--serve` path, which no report had checked. `skills.discover` returns 6 skills
across 31 sources of real host data; `skills.listManagedInstalls` returns `[]`. The RPC was never
the gap.

**`window.api.artifacts` does not exist — and does not exist on the desktop either.** The Artifacts
page reaches the runtime through `callRuntimeRpc({kind:'local'}, 'artifacts.publish', …)`, and
`kind:'local'` resolves to `window.api.runtime.call`. So the page already works in the tile. This
is why the cross-cutting **Gaps** sweep could not see it: its unit was "preload namespace absent,
RPC family present", and a surface with no preload namespace on *either* client is invisible to
that test. Two more failure modes are equally invisible to it — a namespace that is present but
whose members reject (`skills`, 20 of them), and a pane the settings nav never lists.

**The web client IS a paired principal.** `accounts.addClaudeFromConfigDir` from the tile answers
"only available on the Orca host runtime", so `clientKind !== undefined`. Anything upstream gates
on that gates the tile.

**The store the runtime reads is `<userData>/profiles/<profileId>/orca-data.json`**, 186 settings
keys — *not* the legacy `<userData>/orca-data.json`, which is what the Coder module's
`applied-settings.json` writes and which only migrates on first boot. Editing the legacy file after
first boot changes nothing. `runtime-seeded-settings.diff`'s header names the right path; this is
the trap next to it.

**Flipping the two capability keys in the profile store and restarting proves the read path is
already complete upstream.** `settings.get` reports both `true`, `window.api.settings.get()` mirrors
them, and the tile's toggles render checked — and still `disabled`. `artifacts.publish` then passes
the device gate and returns `{status:'reconnect-required'}`; with the gate off it returns
`artifact_sharing_disabled`. Nothing needed adding to the read path; the write path is the gap.

**`skills.share` has a second refusal behind the device gate.** With the gate on, the tile gets
`agent_skill_sharing_unsupported_environment` — "Publishing skills through a paired client is not
supported." The host's own CLI (`clientKind === undefined`) gets past it. The device gate is
caller-blind: `orca skills share` typed by a human is refused exactly like an agent.

### Sign-in — what the host can and cannot do

- The Orca account session is host-side only, `<userData>/profiles/<id>/account-session.json.enc`.
  There is no `orcaProfiles.*` RPC at v1.4.190; the web preload answers a hardcoded
  `{configured:false, state:'unconfigured'}`, which is why Artifacts says the host is not
  configured when it is.
- `safeStorage.isEncryptionAvailable()` is **false** here. Evidence is the host's own
  `orca-secret-protection.json`, which records the `!isEncryptionAvailable()` branch's exact string
  ("The OS keyring is unavailable…"), not the `basic_text` one. Confirmed absent on the host:
  gnome-keyring/kwallet binaries, the keyring socket, `org.freedesktop.secrets`.
  Consequence: `saveOrcaCloudSession` does **not** throw and does **not** write plaintext — a
  packaged build refuses the plaintext branch, so it falls to `memory-only`. A session would
  survive until the next serve restart. That corrects the assumption that sealing throws.
- `beginOrcaCloudPkceFlow` opens an http server on the **host's** 127.0.0.1 and calls
  `shell.openExternal`. The host has no `xdg-open` and no `gio`, so that call cannot succeed.
  **It does have a browser.** Orca ships and runs its own, `agent-browser-linux-x64`
  (`agent-browser-bridge.ts` builds the name as `agent-browser-${platform()}-${arch()}`), and a
  headless `serve` provides browser pages through the offscreen backend over the same
  `browser.screencast.v1` path a desktop renderer uses (`orca-runtime.ts`, the `hasRenderer ||
  hasOffscreen` filter); `browser.headless.v1` is advertised to tell clients this host owns browser
  pages and they must not fall back to a local desktop tab. So the redirect landing on the host's
  loopback is not the dead end it looks like: a page in Orca's own browser **is** on the host's
  loopback.
- Probed unauthenticated against `login.onorca.dev`: a `http://127.0.0.1:<port>` redirect_uri is
  accepted (302, error delivered *to* the redirect), any https origin is rejected with a flat 400,
  `/.well-known/openid-configuration` and `/.well-known/oauth-authorization-server` are 404, and
  `/v1/desktop/auth/device` is 404 on GET and POST. **Loopback-only, and no device-code grant.**
  So no proxy-reachable callback route can be registered.

**Corrected conclusion.** The loop `beginOrcaCloudPkceFlow` needs closes with no manual step:
keep the flow as it is and replace its one `shell.openExternal(authorizeUrl)` call with opening
that URL in Orca's own browser when no system browser exists. The operator can see and drive that
page from the tile. Manual code entry — the host mints the URL and keeps the `code_verifier`, the
operator pastes the code back — is the fallback, not the design. Neither is built in this release;
the route, what was measured and the one open risk are in `N3-orca-account-sign-in.md`.

### The settings navigation

`useSettingsNavigationMetadata.ts`'s `showDesktopOnlySettings = !isWebClient` hid **ten** sections
from the tile, confirmed by reading the rendered sidebar: Orca Account, Mobile, Plugins, SSH Hosts,
Browser, Computer Use, Voice, Notifications, Advanced, Mobile Emulator. Settings search finds none
of them either — entries come from the same builder, so `"plugin"` and `"orca account"` both return
*No settings found*. Two shipped patches' `To test` lines were therefore unfollowable
(`plugins-web-bridge.diff` → Settings > Plugins, `pairing-credentials.diff` → Settings > Mobile).

`status.get` on this host reports `hostPlatform: 'linux'`, which is the value the host-axis sections
need. `computer.capabilities` answers `unsupported_capability` with an actionable message naming the
Linux packages to install — an answer the hidden section was suppressing.

### Not verified in this pass

- Everything above was measured on the **unpatched** v4.190.0 artifact. The patches in this branch
  were exercised by their tests, not on a rebuilt AppImage.
- Whether the Voice, Notifications and Advanced panes behave as reasoned once listed — they are
  deliberately left hidden, so this was not tested.
- Whether `browser`, `ssh` and `computer-use` panes are fully functional in the tile beyond their
  RPC families being reachable. Only the capability advertisement and one `computer.capabilities`
  call were checked.
- The workspace state was mutated during this pass; see the PR description for what was restored.
