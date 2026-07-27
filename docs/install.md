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

There is one artifact: a Linux x86_64 AppImage published on
[Releases](https://github.com/mrkhachaturov/orca-server/releases). No package repositories, no install script.

## Requirements

Linux x86_64 with glibc 2.36 or newer. The build is done on Debian bookworm, so anything at or above that works;
Ubuntu 22.04 and 24.04 and current Debian stable are known to.

`orca serve` is an Electron process. It never opens a window, but Chromium still refuses to start without its
libraries and a display, so both have to be there:

```bash
sudo apt-get update
sudo apt-get install -y \
  libgtk-3-0 libnss3 libgbm1 libasound2 libatk-bridge2.0-0 libatspi2.0-0 \
  libdrm2 libxcomposite1 libxdamage1 libxfixes3 libxkbcommon0 libxrandr2 libxss1 \
  xvfb xauth dbus-x11
```

FUSE is not required. The instructions below extract the AppImage instead of mounting it, which is also what makes it
work inside a container or an unprivileged LXC.

## Download and extract

```bash
VERSION=4.156.0
sudo mkdir -p /opt/orca-server
cd /opt/orca-server
sudo curl -fL -O "https://github.com/mrkhachaturov/orca-server/releases/download/v$VERSION/orca-server-$VERSION-x86_64.AppImage"
sudo chmod +x "orca-server-$VERSION-x86_64.AppImage"
sudo ./orca-server-$VERSION-x86_64.AppImage --appimage-extract
```

Extraction leaves a `squashfs-root` directory. Everything below runs out of it.

## Run it

```bash
LIBGL_ALWAYS_SOFTWARE=1 ORCA_APPIMAGE_NO_SANDBOX=1 \
  dbus-run-session -- xvfb-run -a \
  /opt/orca-server/squashfs-root/resources/bin/orca-ide serve --trusted-proxy --port 6799
```

Then put a reverse proxy that authenticates your users in front of `127.0.0.1:6799`. The proxy must pass WebSocket
upgrades. Open the proxied URL and the UI loads with nothing to paste.

Health is `GET /web-index.html`. Do not health-check `/trusted-session`, which answers 503 until the first pairing
offer is minted, and do not health-check the WebSocket port.

### Three things that fail quietly

The entry point is `resources/bin/orca-ide`. `squashfs-root/AppRun` is the desktop entry point: it ignores the `serve`
argument, boots the GUI under Xvfb with a stock server on port 6768, and exits zero. Nothing in the log says you got the
wrong thing.

`ORCA_APPIMAGE_NO_SANDBOX` is an environment variable. Passing `--no-sandbox` as a flag makes the CLI reject the
launch, because it is not in the allowed flag list for `serve`.

`dbus-run-session -- xvfb-run -a` is required. Without a display the process dies with "Missing X server or $DISPLAY".
Upstream's own documentation says modern builds start Xvfb on their own and that D-Bus is unnecessary; that is not what
happens here, and both wrappers have been verified as needed.

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

Mobile pairing needs an address the phone can dial, and the server will not invent one. Add `--pairing-address` with a
LAN or Tailscale hostname the phone can actually reach:

```bash
... orca-ide serve --trusted-proxy --port 6799 --pairing-address orca.tailnet-name.ts.net
```

Without it, generating a code fails with "no advertised pairing address". The browser does not need this, because it
derives the endpoint from the page it was served from.

## Uninstall

```bash
sudo rm -rf /opt/orca-server
rm -rf ~/.config/orca ~/.config/Orca
```

The second line deletes projects, worktree metadata, terminal history, orchestration state, and paired device keys.

Note that the data directory is Orca's own, not renamed. A stock Orca installed on the same machine for the same user
shares it.

## Upgrading

See [upgrade](./upgrade.md).
