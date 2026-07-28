---
title: "Local is the server, so there is no local fallback"
scope: "file"
path: ["src/**/*.ts", "src/**/*.tsx"]
severity_min: "high"
languages: ["jsts"]
buckets: ["error-handling"]
uuid: "df97e602-c8f7-498d-a4dd-c2bec980d2ad"
enabled: true
---

## Instructions

Upstream's model is two machines — a server owning repos, worktrees, terminals
and agent processes, and a client running the UI. orca-server collapses both
onto one host, so `LOCAL_EXECUTION_HOST_ID` is a fiction and headless drops every
window-bound subsystem. Every capability therefore needs a wire representation;
there is nothing local to fall back to.

Flag code added in the diff that:

- branches on whether the execution host is local and takes a direct,
  non-RPC path
- reaches for `BrowserWindow`, `webContents`, a focused window or any
  window-bound singleton on a path the web client reaches
- treats a missing window, missing display or missing native module as a reason
  to return a default rather than to answer over the wire
- compares an id against `LOCAL_EXECUTION_HOST_ID` to decide capability

The fix is a wire representation: an RPC method, a projection into an existing
payload, or a client event.

## Examples

### Bad example

```typescript
if (hostId === LOCAL_EXECUTION_HOST_ID) {
  return readFromMainProcessDirectly(path)
}
return runtime.request('file.read', { path })
```

### Good example

```typescript
// One host, one path: the wire is the only representation there is.
return runtime.request('file.read', { path })
```
