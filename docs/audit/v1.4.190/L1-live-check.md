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
