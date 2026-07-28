---
title: "A patch must wire up a building block, never work around one"
scope: "pull-request"
path: ["src/**/*.ts", "src/**/*.tsx", "patches/**"]
severity_min: "critical"
languages: ["jsts"]
buckets: ["error-handling"]
uuid: "7ba8a985-babe-458f-95e5-c3e6ee0510c4"
enabled: true
---

## Instructions

The bar is a patch an upstream maintainer would accept. In order of preference:
wire up Orca's own building block; or add a new one, written properly, at the
path it will occupy in Orca's tree. A workaround is the one banned category — it
can never be contributed back and has to be re-justified on every bump.

Flag a change that reaches its result by side-stepping the mechanism rather than
using or extending it. Signals:

- polling, retry loops or timers standing in for an event the runtime already emits
- reading a value off the DOM, a title string or a log line that the runtime holds
  in state
- duplicating a projection instead of calling the existing producer
- a comment admitting the shape — "for now", "until upstream", "hack", "temporary"

Absence of an upstream mechanism is a claim, not a fact. If the change asserts
one does not exist, say which producer or RPC was checked.

## Examples

### Bad example

```typescript
// No RPC for this yet — poll the title until it settles.
setInterval(() => {
  const title = document.querySelector('.pane-title')?.textContent
  if (title) applyStatus(parseStatus(title))
}, 500)
```

### Good example

```typescript
// The runtime already emits this; the web preload just never subscribed.
runtime.onTerminalAgentStatus((payload) => applyStatus(payload))
```
