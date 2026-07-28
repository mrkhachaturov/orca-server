---
title: "Value imports from a hub module go in a leaf, and nothing crosses a cycle at module scope"
scope: "file"
path: ["src/**/*.ts", "src/**/*.tsx"]
severity_min: "critical"
languages: ["jsts"]
buckets: ["performance-and-optimization"]
uuid: "88e4ce30-e93d-4cfd-8ad8-8932d1e0fbab"
enabled: true
---

## Instructions

A value import from a hub module — one that re-exports or is imported by much of
the tree — pulls the whole hub into the cycle. Nothing crossing an import cycle
may be evaluated at module scope: the binding is still in its temporal dead zone
when the other side initialises. One violation took out 411 upstream tests.

Flag in the diff:

- a **value** import (function, class, constant, enum) pulled from a hub or
  barrel module rather than from a leaf under `src/shared/`
- a module-scope constant, array, `new`, or immediately-invoked call whose value
  comes from such an import
- a decorator or default parameter evaluating an imported value at load time

Type-only imports are safe — they erase. Prefer `import type` and make it
explicit. Moving the value into a leaf under `src/shared/` is the fix; deferring
the read into a function body is the fallback.

## Examples

### Bad example

```typescript
import { DEFAULT_SETTINGS } from '../store/slices/settings'

// Evaluated at module scope, across the cycle — undefined at import time.
const SEEDED = Object.keys(DEFAULT_SETTINGS)
```

### Good example

```typescript
import type { GlobalSettings } from '../../shared/types'
import { seededSettingKeys } from '../../shared/runtime-seeded-settings'

function seeded(): readonly (keyof GlobalSettings)[] {
  return seededSettingKeys()
}
```
