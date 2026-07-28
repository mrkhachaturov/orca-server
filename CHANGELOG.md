# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versions mirror the Orca release they carry, the way code-server mirrors Code.
Orca's major is always 1 and says nothing, so we drop it and keep the two
components that move: Orca `1.4.156` ships as `4.156.0`. The last slot is ours,
so `4.156.1` is the same Orca with a changed patch series. To read the Orca
version off ours, take the first two fields and put `1.` in front.

Each entry also names the Orca version in full, on its own line under the
heading.

<!-- Example:

## [9.99.999] - 9090-09-09

Orca v9.99.999

### Changed
### Added
### Deprecated
### Removed
### Fixed
### Security

-->

## Unreleased

Orca v1.4.159

### Changed

- Update to Orca v1.4.159. All thirteen patches were re-justified against the
  new tag and all thirteen were kept: upstream shipped nothing that closes any
  of the capabilities they carry.

## [4.158.0] - 2026-07-28

Orca v1.4.158

### Added

- An `aarch64` AppImage alongside the `x86_64` one. Both are release targets,
  each built and end-to-end tested on a native runner. A release now holds two
  assets.

### Changed

- Update to Orca v1.4.158. All thirteen patches were re-justified against the
  new tag and all thirteen were kept: upstream shipped nothing that closes any
  of the capabilities they carry.

## [4.156.0] - 2026-07-27

Orca v1.4.156

First release. Orca packaged as a self-hosted Linux AppImage, patched so a
browser is a first-class client rather than a degraded one.

### Added

- Serve the web client behind a trusted proxy with no pairing prompt, so a
  reverse proxy that has already authenticated the user opens straight into the
  full UI.
- Mint and revoke pairing credentials from the web client, so a phone or another
  client can be paired without a desktop app.
- Show the workspace's own processes in the web Resource Manager, which
  previously read all zeroes.
- Register the Orca CLI from the web client, so agent-skill setup no longer
  reports the CLI as unavailable.
- Pick a floating workspace directory from the web client, replacing a native
  file dialog the browser could never open.
- Seed appearance and experimental settings from the runtime, so a provisioned
  workspace decides how its Orca looks on a browser's first visit.
- Open a worktree in a browser editor, per worktree, instead of every "Open in"
  entry being disabled as local-only.
- Own the web client's execution without a local machine: floating terminals,
  skill terminals and floating notes now resolve to the connected runtime rather
  than to a laptop that is not there.
- Deliver orchestration messages on a headless host, so a waiting agent is
  handed its message instead of having to be told to check its inbox.
- Bridge usage analytics to the web client, so Stats & Usage scans and the
  provider Enable buttons work.
- Carry agent status on the headless session-tab surface, so an agent pane opens
  its transcript and model instead of an empty chat state.
- Cold-restore a dead agent pane on a headless host: after a restart the pane
  resumes the real agent session rather than leaving a shell behind the composer.
- Restore the web client's last active workspace after a restart.
