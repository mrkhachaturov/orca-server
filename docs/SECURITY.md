# Security Policy

## What this project ships

Almost all of a release is upstream [Orca](https://github.com/stablyai/orca), built from a pinned tag. Report Orca
vulnerabilities upstream; we pick them up by moving the pin. Report here anything in the patch series, the build, or the
way the server is exposed.

## Trusted-proxy mode and its threat model

`--trusted-proxy` binds the runtime to `127.0.0.1` and serves the browser its pairing credential over that same
loopback, with no token in the URL. Loopback is the entire authorization check.

Any process on that host can fetch the credential and reach the runtime with it. Run this only on a host with one owner.
Do not run it on a shared machine, and do not expose the port without the proxy.

Without `--trusted-proxy` the server behaves as upstream built it and the pairing URL is a secret — anyone holding it
has the runtime. Keep it out of proxy logs, CI output, and Terraform state.

## Tools

Dependabot opens pull requests for GitHub Actions updates once a month. There is no dependency manifest of our own; the
only third-party code here is the pinned submodule.

The scheduled update workflow tracks upstream releases and opens a pull request that restacks the series. It never
merges on its own.

## Supported versions

| Version                                                         | Supported          |
| --------------------------------------------------------------- | ------------------ |
| [Latest](https://github.com/mrkhachaturov/orca-server/releases) | :white_check_mark: |

Fixes go into the next release. There are no backports or patch releases for older versions.

## Reporting a vulnerability

Use [private vulnerability reporting](https://github.com/mrkhachaturov/orca-server/security/advisories/new) on this
repository. Do not open a public issue for anything exploitable.
