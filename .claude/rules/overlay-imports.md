---
paths:
  - "src/**"
---

# Overlay imports

Loads when an overlay file is open. The overlay is ours outright, so nothing here is about quilt —
it is about what an import does at module load.

- **Value imports from a hub module go in a leaf under `src/shared/`,** and nothing crossing an
  import cycle may be evaluated at module scope. One violation took out 411 upstream tests.

  ```ts
  import { SOME_CONST } from '../../shared/types' // hub: pulls the cycle in at module scope
  const DEFAULTS = buildFrom(SOME_CONST) //           evaluated on import — this is the failure
  import type { Worktree } from '../../shared/types' // type-only: erased, always safe
  import { SOME_CONST } from '../../shared/some-leaf' // value: leaf module, no cycle
  ```

  A type-only import is always safe: it is erased before the module runs. A value import is only
  safe from a leaf. If the value must come from a hub, read it inside the function that needs it
  rather than at module scope.

- **A file here is never in a patch.** `mise run overlay` copies `src/<path>` to
  `lib/orca/src/<path>`, so an import reads the same either way; `mise run overlay --check` fails if
  a path ends up owned by both halves.

- **`mise run test:types` is the gate for this half.** An overlay file cannot fail to apply, so
  nothing else catches an upstream rename in something it imports. vitest transpiles and never
  typechecks.
