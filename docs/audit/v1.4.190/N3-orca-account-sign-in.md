# Orca account sign-in from the browser — designed, measured, not built

Design only. Nothing here ships in `web-share-surfaces.diff`, which routes
`orcaProfiles.authStatus` and stops there: the tile reports the host's real account state and says
that starting sign-in is a host action. One risk decides whether this design works at all, and it
cannot be settled without real credentials.

## The loop is already closed on the host

`beginOrcaCloudPkceFlow` opens an HTTP server on the host's own 127.0.0.1, mints the authorize URL,
keeps the `code_verifier`, and calls `shell.openExternal(authorizeUrl)`. login.onorca.dev accepts
loopback redirect URIs only — an https proxy origin is a flat 400 — and there is no device-code
grant, so no proxy-reachable callback can be registered. That reads as a dead end and is not one.

**The host has a browser.** Orca ships and runs its own, `agent-browser-linux-x64`
(`agent-browser-bridge.ts` builds the name as `agent-browser-${platform()}-${arch()}`). A headless
`serve` provides browser pages through the offscreen backend over the same `browser.screencast.v1`
path a desktop renderer uses, and advertises `browser.headless.v1` so clients know this host owns
browser pages and must not fall back to a local desktop tab. A page in that browser is on the
host's loopback — which is exactly where the redirect lands.

`shell.openExternal` is what fails, not the flow: the host has no `xdg-open` and no `gio`.

## Measured, on the deployed workspace

From the previous session's L1b pass, on the same box as `L1-live-check.md`:

- `browser.screenshot` returned real pixels and `browser.snapshot` an a11y tree, so the operator can
  see the page from the tile.
- `browser.keypress` and `browser.eval` worked, so the operator can drive it.
- The real login page at auth.onorca.dev renders, with its email, password, Google and GitHub
  controls.

Not re-measured this session; recorded as that session found it.

## The change

Rung 1, and small: keep `beginOrcaCloudPkceFlow` as it is and replace its one
`shell.openExternal(authorizeUrl)` call with opening that URL in Orca's own browser when no system
browser exists. No manual step for the operator.

Rung 2, the fallback, only if rung 1 is refused: manual code entry — the host mints the URL and
keeps the `code_verifier`, the operator pastes the code back from the failed-loopback URL bar, the
host exchanges it. PKCE makes a pasted code useless on its own. **Do not build this first.**

## The open risk — why it is not built

The backend presents as Chrome/150, and Google and some identity providers refuse OAuth in browsers
they classify as embedded or automated. Nobody has tested past the login form, because that needs
real credentials. Email, password and SSO on auth.onorca.dev are likely fine. **"Sign in with
Google" may be refused outright**, and that is plausibly the path most operators reach for.

Settle it with one real sign-in attempt before writing any code.

## What the pane must say, whichever route is built

The session is **memory-only on this host**. `safeStorage.isEncryptionAvailable()` is false with no
keyring, and a packaged build refuses the plaintext branch, so `saveOrcaCloudSession` falls to
memory — it neither throws nor writes plaintext. **The operator signs in again after every `serve`
restart.** That belongs in the pane's copy where an operator meets it, not in a footnote.
