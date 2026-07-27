# Upgrade

Extract the new AppImage over the old one and restart the service. State lives in `~/.config/orca` and
`~/.config/Orca`, well away from the binary, so projects, worktree metadata, terminal history, orchestration state and
paired device keys all survive. Phones and browsers reconnect without pairing again.

```bash
VERSION=4.157.0
cd /opt/orca-server
sudo curl -fL -O "https://github.com/mrkhachaturov/orca-server/releases/download/v$VERSION/orca-server-$VERSION-x86_64.AppImage"
sudo chmod +x "orca-server-$VERSION-x86_64.AppImage"
sudo rm -rf squashfs-root
sudo ./orca-server-$VERSION-x86_64.AppImage --appimage-extract
sudo systemctl restart orca-server.service
```

Nothing updates itself. Orca wires up no auto-updater in headless mode, and no paired client can trigger one remotely,
so an upgrade only ever happens because you did this.

## Rolling back

Going forward is safe because a newer build reads older state and rewrites it in the current shape. Going backward is
not covered by that, so keep the previous AppImage until you are satisfied with the new one, and take a copy of
`~/.config/orca` before a downgrade.
