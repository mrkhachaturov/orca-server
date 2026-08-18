---
name: orca-release
description: >-
  Take a merged bump to a published release: rebase before gating, merge the `update/*` pull
  request, read the draft the workflow builds, publish it, roll the changelog, return to main and
  publish the new pin to the search mirror. Merging the pull request is what triggers the release
  workflow, so the order is not optional.
when_to_use: >-
  When a bump branch is ready to release, before the final gate — step 1 rebases, and a rebase
  invalidates any gate that ran before it. Run `orca-patch-verify` on the rebased head, not before.
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
The last slot is ours, and **this flow always produces `0`** — the workflow reads that slot from its
`patch` input, and a merge carries no inputs. Re-releasing the same Orca tag as `v4.NNN.1` needs the
Draft release workflow run by hand with `patch` set. To read a version backwards, take the first two
fields and prepend `1.`.

## 1. Rebase, then gate the rebased head

```bash
git rev-list --count HEAD..origin/main    # 0, or rebase first
gh pr update-branch --rebase              # for an open pull request
```

Then run `orca-patch-verify`. A rebase rewrites the head, so any gate that ran before it proves
nothing about what will merge — CI re-runs on the new head either way, and the ruleset refuses a
merge from a branch that is behind. Gating first means paying for the whole matrix twice, both
AppImage builds included.

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
mise run mirror      # pristine, patched and patched-<tag> at the new pin
```

`mirror` is what makes the release searchable: until it runs, Sourcegraph still answers from the
previous pin. It is the only step here that reaches outside the repository, and no gate depends
on it — a missed run costs search, not the release.
