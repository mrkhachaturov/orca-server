---
title: "A comment states what and why in one or two lines"
scope: "file"
path: ["src/**/*.ts", "src/**/*.tsx", ".mise/**/*.sh"]
severity_min: "medium"
buckets: ["documentation"]
uuid: "37728bef-785e-4543-b37d-1d86fa8b8909"
enabled: true
---

## Instructions

A comment is never longer than the code it explains. It states what and why —
never how, never the reasoning that led there, never a justification nobody
asked for. If a comment needs a paragraph, the code needs the rewrite instead.

Flag a comment introduced in the diff that:

- restates the next line in English
- narrates the author's reasoning or the alternatives they rejected
- runs longer than the block it sits above
- names a patch by its file or identifier — name the rule the code obeys instead,
  because order in the series is data and a patch can be merged or dropped

Comments that survive: a non-obvious constraint, an ordering that looks wrong but
is required, an upstream quirk being worked with.

## Examples

### Bad example

```typescript
// We loop over every worktree in the list. For each one we check whether it is
// visible. We considered filtering earlier but that changed the ordering, and
// ordering matters here because the sidebar renders in this order, so instead
// we filter here after the map has been built.
for (const wt of worktrees) {
```

### Good example

```typescript
// Filter after the map: the sidebar renders in insertion order.
for (const wt of worktrees) {
```
