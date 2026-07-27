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

### Changed

- Our own source now lives in `src/` instead of inside the patches. A patch
  modifies a file that exists upstream; the overlay in `src/` adds a file that
  does not, and `ci/build/overlay.sh` copies it into Orca's tree after the series
  applies. 29 files and 3575 lines moved out, taking `patches/` from 5856 added
  lines to 2640. The build and the tests are unchanged — 26 test files and 1161
  tests pass exactly as before. On a bump those files can no longer fail to
  apply, since upstream has no version of them to conflict with; they can still
  fail to compile when upstream renames or drops something they import, and
  `pnpm run typecheck:tsc` is what reports it.
- `series.bats` now requires a patch to name its tests in its header, rather than
  to contain a test file. Containing one was never evidence: all thirteen patches
  passed that check while four were untested in substance.

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
