# orca-server

[![License](https://img.shields.io/github/license/mrkhachaturov/orca-server)](https://github.com/mrkhachaturov/orca-server/blob/main/LICENSE)
[![Latest release](https://img.shields.io/github/v/release/mrkhachaturov/orca-server)](https://github.com/mrkhachaturov/orca-server/releases/latest)

Run full [Orca](https://github.com/stablyai/orca) capabilities from the browser.

## Highlights

- Any device with a browser
- Agents, terminals, chat and source control as in the desktop app
- Sign in through your own SSO; no pairing code to paste

## Requirements

Linux on `x86_64` or `aarch64`, glibc 2.31 or newer, Xvfb, D-Bus. `orca serve` is an Electron process: it needs
Chromium's shared libraries and a display even though it never opens a window.

Package list and a systemd unit: [install](./install.md).

## Getting started

Download the AppImage for your architecture from
[Releases](https://github.com/mrkhachaturov/orca-server/releases/latest), then:

```bash
chmod +x orca-server-*-"$(uname -m)".AppImage
./orca-server-*-"$(uname -m)".AppImage --appimage-extract

LIBGL_ALWAYS_SOFTWARE=1 ORCA_APPIMAGE_NO_SANDBOX=1 \
  dbus-run-session -- xvfb-run -a \
  squashfs-root/resources/bin/orca-ide serve --trusted-proxy --port 6799
```

Point a reverse proxy that authenticates your users at `127.0.0.1:6799`, then open it.

Health is `GET /web-index.html`.

Two mistakes fail silently: starting `squashfs-root/AppRun` instead of `resources/bin/orca-ide` (AppRun ignores the
`serve` argument), and passing `--no-sandbox` as a flag instead of setting `ORCA_APPIMAGE_NO_SANDBOX` as an environment
variable (the CLI rejects the flag and never starts).

## Want to help?

Nearly every gap this project closes is a gap in Orca's own browser client, and the patches are written so upstream
could take them. See [Contributing](./CONTRIBUTING.md) for where to start.
