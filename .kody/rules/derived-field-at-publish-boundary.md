---
title: "Fill a derived field at the publish boundary, never in a snapshot producer"
scope: "file"
path: ["src/**/*.ts", "src/**/*.tsx"]
severity_min: "high"
languages: ["jsts"]
buckets: ["error-handling"]
uuid: "74a885f5-fcbb-4a5a-97e0-347fb39f8ca0"
enabled: true
---

## Instructions

The snapshot merge keeps the cached tab, so a value stamped while a snapshot is
built is frozen at that moment or dropped by the merge. Derived fields must be
filled where the payload is published to the client, after the merge has run.

Flag a derived or time-sensitive field assigned inside a function that builds,
clones or hydrates a snapshot — names like `build*`, `create*Snapshot`,
`hydrate*`, `toResult`, `clone*`. Signals that a field is derived: it is
computed from other fields, from a clock, from liveness, or from current
ownership.

Reading such a field there is fine. Writing it is the defect.

## Examples

### Bad example

```typescript
function buildMobileSessionSnapshot(tab: SessionTab): SessionTabSnapshot {
  return {
    ...tab,
    // Frozen at build time; the merge keeps the cached tab and this never moves.
    agentStatus: resolveAgentStatus(tab.ptyId)
  }
}
```

### Good example

```typescript
function publishMobileSessionTabs(tabs: readonly SessionTabSnapshot[]): void {
  emit(
    tabs.map((tab) => ({ ...tab, agentStatus: resolveAgentStatus(tab.ptyId) }))
  )
}
```
