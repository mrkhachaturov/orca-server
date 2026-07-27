# Upgrade

Extract the new AppImage over the old one and restart the service. State lives in `~/.config/orca` and
`~/.config/Orca`, so projects, worktree metadata, terminal history, orchestration state and paired device keys survive.
Phones and browsers reconnect without pairing again.

```bash
VERSION=4.157.0
ARCH=$(uname -m)
cd /opt/orca-server
sudo curl -fL -O "https://github.com/mrkhachaturov/orca-server/releases/download/v$VERSION/orca-server-$VERSION-$ARCH.AppImage"
sudo chmod +x "orca-server-$VERSION-$ARCH.AppImage"
sudo rm -rf squashfs-root
sudo ./orca-server-$VERSION-$ARCH.AppImage --appimage-extract
sudo systemctl restart orca-server.service
```

Nothing updates itself: headless Orca wires up no auto-updater, and no paired client can trigger one remotely.

## Rolling back

State migration is forward-only. Keep the previous AppImage until you are satisfied with the new one, and copy
`~/.config/orca` before a downgrade.
