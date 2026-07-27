# Security Policy

## What this project ships

Almost all of the code in a release is upstream [Orca](https://github.com/stablyai/orca), built from a pinned tag. A
vulnerability in Orca is Orca's to fix, and ours to pick up quickly by moving the pin. Report those upstream. What
belongs here is anything in the patch series, the build, or the way the server is exposed.

## Trusted-proxy mode and its threat model

`--trusted-proxy` binds the runtime to `127.0.0.1` and serves the browser its pairing credential over that same
loopback, with no token in the URL. Loopback is the entire authorization check. The reasoning is that a request could
only arrive there through the reverse proxy you put in front, and that proxy has already authenticated the user.

The consequence is direct: any process on that host can fetch the credential and reach the runtime with it. Run this on
a host with one owner. Do not run it on a shared machine, and do not skip the proxy and expose the port.

Without `--trusted-proxy` the server behaves as upstream built it, and the pairing URL is a secret. Anyone holding it
has the runtime. Keep it out of proxy logs, CI output, and Terraform state.

## Tools

Dependabot opens pull requests for GitHub Actions updates once a month. There is no dependency manifest of our own to
audit; the only third-party code in this repository is the pinned submodule.

The scheduled update workflow tracks upstream releases and opens a pull request that restacks the series. It never
merges on its own, because a bump can change what a patch is doing.

## Supported versions

| Version                                                         | Supported          |
| --------------------------------------------------------------- | ------------------ |
| [Latest](https://github.com/mrkhachaturov/orca-server/releases) | :white_check_mark: |

Fixes go into the next release. There are no backports or patch releases for older versions.

## Reporting a vulnerability

Use [private vulnerability reporting](https://github.com/mrkhachaturov/orca-server/security/advisories/new) on this
repository. Please do not open a public issue for anything exploitable.
