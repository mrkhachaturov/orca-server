# orca-server

[![License](https://img.shields.io/github/license/mrkhachaturov/orca-server)](https://github.com/mrkhachaturov/orca-server/blob/main/LICENSE) [![Latest release](https://img.shields.io/github/v/release/mrkhachaturov/orca-server)](https://github.com/mrkhachaturov/orca-server/releases/latest)

Run full [Orca](https://github.com/stablyai/orca) capabilities from the browser.

## Highlights

- Work on any device; the only thing it needs is a browser
- Run agents, terminals, chat, and source control the same way you would in the desktop app
- Sign in through the SSO you already run; there is no pairing code to paste

## Requirements

See [install](./install.md) for the package list and a systemd unit.

**TL;DR:** Linux x86_64 with glibc 2.36 or newer, Xvfb, and D-Bus.

`orca serve` is an Electron process. It needs Chromium's shared libraries and a display, even though it never opens a
window.

## Getting started

Download the AppImage from [Releases](https://github.com/mrkhachaturov/orca-server/releases/latest), then:

```bash
chmod +x orca-server-*-x86_64.AppImage
./orca-server-*-x86_64.AppImage --appimage-extract

LIBGL_ALWAYS_SOFTWARE=1 ORCA_APPIMAGE_NO_SANDBOX=1 \
  dbus-run-session -- xvfb-run -a \
  squashfs-root/resources/bin/orca-ide serve --trusted-proxy --port 6799
```

Point a reverse proxy that authenticates your users at `127.0.0.1:6799`, then open it. There is no pairing code to
paste. In trusted-proxy mode the server binds loopback and hands the browser its credential over that same loopback, so
anything reaching it has already been through your proxy.

Health is `GET /web-index.html`.

Two mistakes here fail silently. Start `resources/bin/orca-ide`, not `squashfs-root/AppRun`; AppRun is the desktop entry
point and ignores the `serve` argument. And set `ORCA_APPIMAGE_NO_SANDBOX` as an environment variable, because the CLI
rejects `--no-sandbox` as a flag and then never starts.

## Questions?

See answers to [frequently asked questions](./FAQ.md).

## Want to help?

See [Contributing](./CONTRIBUTING.md) for details.
