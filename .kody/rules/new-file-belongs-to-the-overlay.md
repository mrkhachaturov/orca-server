---
title: "A new file is never a quilt operation"
scope: "pull-request"
path: ["patches/**", "src/**"]
severity_min: "critical"
buckets: ["maintainability"]
uuid: "2b760c72-37d7-4c41-a7ac-6e641c68f0ad"
enabled: true
---

## Instructions

Two owners, disjoint: `patches/` modifies files that exist upstream, `src/` adds
files that do not. A file created inside a `.diff` has to be re-applied and can
conflict on every bump, and the series integrity suite does not catch it — its
ownership check accepts "owned by a patch" for a file the patch itself created.

Flag a `.diff` in the PR whose hunk header creates a file — a hunk against
`/dev/null`, or a `new file mode` line. The fix is to move the file to `src/` at
the same path it would occupy in Orca's tree, and re-run `quilt refresh` so the
patch no longer carries it.

Test files are the common case and the same rule applies: a new `*.test.ts`
belongs in `src/`, and the patch names it in the header instead of containing it.

## Examples

### Bad example

```diff
--- /dev/null
+++ orca-server/lib/orca/src/main/runtime/rpc/methods/usage.ts
@@ -0,0 +1,48 @@
+export function registerUsageMethods(...) {
```

### Good example

```diff
--- orca-server/lib/orca/src/main/runtime/rpc/dispatcher.ts
+++ orca-server/lib/orca/src/main/runtime/rpc/dispatcher.ts
@@
+import { registerUsageMethods } from './methods/usage'
```

with `src/main/runtime/rpc/methods/usage.ts` added to the overlay in the same PR.
