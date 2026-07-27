# Triage

One maintainer, so this is a checklist rather than a process. The filter for untriaged work:

```text
is:issue is:open label:triage sort:created-asc
```

## Deciding who owns a bug

Almost every report lands in one of three buckets, and the bug report form asks the two questions that separate them.

If it reproduces in the desktop Orca app, it is upstream's. Close it here and point the reporter at
[stablyai/orca](https://github.com/stablyai/orca/issues). Nothing in this repository touches behaviour the desktop app
gets wrong on its own.

If the desktop app is fine but a browser pointed at a desktop Orca breaks the same way, the gap is in Orca's browser
client. That is what most of the patch series exists to close, so it is ours to fix, and the fix should be written so
upstream could take it. Label it `upstream-gap`. It is worth periodically going back through these to see whether
upstream has since filled one, because then the patch can be dropped.

If it only breaks against orca-server, it is ours outright. Either a patch is wrong, or the headless host is missing
something the desktop computes in its renderer and nobody has built an equivalent for yet.

When the reporter answered "I did not test", ask, label `waiting-for-info`, and leave it. Guessing which bucket a report
belongs in wastes more time than waiting does.

## Labels

`bug`, `enhancement`, `docs` and `triage` come from the issue forms. Beyond those:

`upstream-gap` marks the second bucket above, a browser-client gap we carry a patch for or should.

`upstream-fixed` marks an issue that upstream has resolved and that will close itself on the next version bump. Check
these when the update pull request opens.

`blocked` marks work waiting on something outside this repository.

## Questions

Convert questions and open-ended discussion into
[Discussions](https://github.com/mrkhachaturov/orca-server/discussions) rather than leaving them as issues.
