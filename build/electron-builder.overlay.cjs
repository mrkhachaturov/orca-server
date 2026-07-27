// Product identity for orca-server.
//
// This is the analogue of code-server's product.json overlay in
// ci/build/build-vscode.sh: a build-time rename, deliberately NOT a patch, so
// it survives every upstream bump with nothing to restack.
//
// The mechanism is electron-builder's own `extends`, verified in its source:
// a `file:` spec is resolved against projectDir and .cjs parents are loaded as
// modules (util/config/load.ts), then doMergeConfigs deep-merges with the child
// last, so the fields below win over upstream's (util/config/config.ts).
//
// Do NOT override `files` here. It is merged by mergeFileSets with the opposite
// priority to everything else, so a value here would silently lose to upstream's.
//
// Why rename at all: this build is not upstream Orca — it carries a patch
// series — and a bug report or a screenshot has to be attributable to one or the
// other. code-server renames for a stronger reason (marketplace terms of service
// forbid a non-Microsoft VS Code from using it); that reason does not exist for
// Orca, so ours is attribution alone.
//
// Known limitation: the runtime data directory is NOT renamed. Electron derives
// it from package.json `name` at initDataPath(), before app.setName() runs — see
// src/main/persistence.ts. Moving it would mean patching upstream's package.json
// on a code path its authors have twice annotated as having lost data before.
// So this build still uses ~/.config/orca and shares it with a co-installed
// upstream Orca.

module.exports = {
  extends: "file:config/electron-builder.config.cjs",
  appId: "io.github.mrkhachaturov.orca-server",
  productName: "orca-server",
  // Upstream keeps artifactName under `appImage`, not `linux`. Putting it under
  // `linux` here parsed fine, merged fine, and silently did nothing.
  appImage: {
    artifactName: "orca-server-linux.${ext}",
  },
}
