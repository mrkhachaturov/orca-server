---
name: orca-release
description: >-
  Take a merged bump to a published release: rebase before gating, merge the `update/*` pull
  request, read the draft the workflow builds, publish it, roll the changelog, return to main and
  reindex the pin graphs. Merging the pull request is what triggers the release workflow, so the
  order is not optional.
when_to_use: >-
  After `orca-patch-verify` is green on a bump branch, or whenever a release has to go out.
  Triggers: "release it", "publish the release", "ship v4.x", "merge the bump", "cut a release",
  "finish the bump", "back to main after the release".
---

# Release

`docs/MAINTAINING.md` is the human version. This is the order of operations, with the traps that
cost real time.

## Placeholders — substitute before running anything

Nothing below is meant to be run verbatim.

| Placeholder | Means | Read it from |
| --- | --- | --- |
| `NNN` | Orca's minor, the only digits that move | `git -C lib/orca describe --tags` → `v1.4.NNN` |
| `PR` | the pull request number | `gh pr list` |
| `YYYY-MM-DD` | today, in the changelog heading | the date of the release |

Our version drops Orca's major and keeps the two that move: Orca `v1.4.NNN` ships as `v4.NNN.0`.
The last slot is ours — the same Orca with a changed series is `v4.NNN.1`, which the workflow
produces from the `patch` input. To read a version backwards, take the first two fields and prepend
`1.`.

## 1. Rebase before you gate

```bash
git rev-list --count HEAD..origin/main    # 0, or rebase first
gh pr update-branch --rebase              # for an open pull request
```

**Why first:** a rebase resets every CI check, and the ruleset refuses a merge from a branch that is
behind. Gating before rebasing runs the whole matrix twice, both AppImage builds included. The
`gate-freshness` hook refuses a gate run from a stale branch, but the check is cheap to make by
hand.

## 2. Check the changelog

`## Unreleased` must hold the changes, and the Orca version on the line under the heading must be
the tag `lib/orca` is pinned to. That section becomes the release body verbatim — the workflow cuts
it out of the file.

Convention, from the entries already in `CHANGELOG.md`: a bump records the re-justification outcome,
not just the version. *"All thirteen patches were re-justified against the new tag and all thirteen
were kept."*

## 3. Merge the pull request

```bash
gh pr merge PR --squash --delete-branch
```

Merging an `update/*` branch **triggers the Draft release workflow by itself**. Do not also run it
from the Actions tab.

**Trap: `mergeStateStatus: BLOCKED` with every check green.** The ruleset sets
`required_review_thread_resolution: true`, so an open review thread blocks the merge even when the
required check (`Gate`) passes. Read every open thread before resolving it:

```bash
gh api graphql -f query='{repository(owner:"mrkhachaturov",name:"orca-server"){pullRequest(number:PR){
  reviewThreads(first:20){nodes{id isResolved path comments(first:1){nodes{databaseId body}}}}}}}'
```

A Kodus re-review after a rebase can add findings that were not there the first time, and a new one
can sit next to a repeat of an old one. Resolving the batch to unblock the merge is how a real
finding gets shipped. Reply with the reasoning, react 👎 on a false positive, then resolve.

## 4. Read the draft, then publish

```bash
gh release view v4.NNN.0 --json tagName,isDraft,body,assets
```

Pass: body is the `## Unreleased` section, and there are **two** assets —
`orca-server-4.NNN.0-x86_64.AppImage` and `orca-server-4.NNN.0-aarch64.AppImage`. Both are release
targets; one asset means a build was skipped.

```bash
gh release edit v4.NNN.0 --draft=false --latest
```

## 5. Roll the changelog

Rename `## Unreleased` to `## [4.NNN.0] - YYYY-MM-DD` and open a fresh empty `## Unreleased` above it.
Its own commit, `docs: roll the changelog for v4.NNN.0`, on a branch — `hk` refuses a commit on
`main`. The heavy CI jobs skip on a changelog-only diff; `Gate` still reports.

## 6. Return to main

```bash
git checkout main && git pull --ff-only
git submodule update --init --recursive lib/orca
mise run up          # every patch in patches/series applied, none skipped
mise run cbm         # orca-patched and orca-pristine at the new pin
```

`mise run cbm`, not `cbm-next`: the tag that just shipped **is** the pin now. `orca-next` only ever
holds a release we have not pinned, so leave it until the next candidate appears.
