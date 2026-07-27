<!-- prettier-ignore-start -->
<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
# Install

- [Requirements](#requirements)
- [Download and extract](#download-and-extract)
- [Run it](#run-it)
  - [Three things that fail quietly](#three-things-that-fail-quietly)
- [Run it under systemd](#run-it-under-systemd)
- [Pairing a phone](#pairing-a-phone)
- [Uninstall](#uninstall)
- [Upgrading](#upgrading)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->
<!-- prettier-ignore-end -->

Two artifacts, one per architecture — `x86_64` and `aarch64` — on
[Releases](https://github.com/mrkhachaturov/orca-server/releases). No package repositories, no install script.

## Requirements

Linux on `x86_64` or `aarch64`, glibc 2.31 or newer — stock Ubuntu 20.04+, Debian 11+, RHEL 9. The architecture in the
asset name is `uname -m`.

`orca serve` is an Electron process. It never opens a window, but Chromium still needs its libraries and a display:

```bash
sudo apt-get update
sudo apt-get install -y \
  libgtk-3-0 libnss3 libgbm1 libatk-bridge2.0-0 libatspi2.0-0 \
  libdrm2 libxcomposite1 libxdamage1 libxfixes3 libxkbcommon0 libxrandr2 libxss1 \
  xvfb xauth dbus-x11

# Renamed in Ubuntu 24.04 and Debian 13. Naming the wrong one aborts the whole
# install, because the other is a virtual package with no candidate.
sudo apt-get install -y libasound2t64 || sudo apt-get install -y libasound2
```

FUSE is not required: the steps below extract the AppImage rather than mount it, which is also what makes it work
inside a container or an unprivileged LXC.

## Download and extract

```bash
VERSION=4.156.0
ARCH=$(uname -m)
sudo mkdir -p /opt/orca-server
cd /opt/orca-server
sudo curl -fL -O "https://github.com/mrkhachaturov/orca-server/releases/download/v$VERSION/orca-server-$VERSION-$ARCH.AppImage"
sudo chmod +x "orca-server-$VERSION-$ARCH.AppImage"
sudo ./orca-server-$VERSION-$ARCH.AppImage --appimage-extract
```

Extraction leaves a `squashfs-root` directory. Everything below runs out of it.

## Run it

```bash
LIBGL_ALWAYS_SOFTWARE=1 ORCA_APPIMAGE_NO_SANDBOX=1 \
  dbus-run-session -- xvfb-run -a \
  /opt/orca-server/squashfs-root/resources/bin/orca-ide serve --trusted-proxy --port 6799
```

Put a reverse proxy that authenticates your users in front of `127.0.0.1:6799`. The proxy must pass WebSocket upgrades.

Health is `GET /web-index.html`. Do not health-check `/trusted-session`, which answers 503 until the first pairing offer
is minted, and do not health-check the WebSocket port.

### Three things that fail quietly

The entry point is `resources/bin/orca-ide`. `squashfs-root/AppRun` is the desktop entry point: it ignores the `serve`
argument, boots the GUI under Xvfb with a stock server on port 6768, and exits zero.

`ORCA_APPIMAGE_NO_SANDBOX` is an environment variable. `--no-sandbox` is not in the allowed flag list for `serve` and
the CLI rejects the launch.

`dbus-run-session -- xvfb-run -a` is required. Without a display the process dies with "Missing X server or $DISPLAY".
Upstream documentation claims modern builds start Xvfb themselves and need no D-Bus; both wrappers are needed here.

## Run it under systemd

```ini
# /etc/systemd/system/orca-server.service
[Unit]
Description=orca-server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=orca
WorkingDirectory=/home/orca
Environment=LIBGL_ALWAYS_SOFTWARE=1
Environment=ORCA_APPIMAGE_NO_SANDBOX=1
ExecStart=/usr/bin/dbus-run-session -- /usr/bin/xvfb-run -a \
  /opt/orca-server/squashfs-root/resources/bin/orca-ide serve --trusted-proxy --port 6799
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Create the service user first, and keep the install directory owned by root so the service can read and execute the
binary but not replace it:

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin orca
sudo chown -R root:root /opt/orca-server
sudo systemctl daemon-reload
sudo systemctl enable --now orca-server.service
sudo journalctl -u orca-server.service -f
```

## Pairing a phone

Mobile pairing needs `--pairing-address` with a LAN or Tailscale hostname the phone can reach:

```bash
... orca-ide serve --trusted-proxy --port 6799 --pairing-address orca.tailnet-name.ts.net
```

Without it, generating a code fails with "no advertised pairing address". The browser does not need it — it derives the
endpoint from the page it was served from.

## Uninstall

```bash
sudo rm -rf /opt/orca-server
rm -rf ~/.config/orca ~/.config/Orca
```

The second line deletes projects, worktree metadata, terminal history, orchestration state, and paired device keys. The
data directory is Orca's own, not renamed: a stock Orca installed for the same user on the same machine shares it.

## Upgrading

See [upgrade](./upgrade.md).
