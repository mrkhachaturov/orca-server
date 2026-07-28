---
title: "A green vitest run is not a working build"
scope: "file"
path: ["src/**/*.test.ts", "src/**/*.test.tsx"]
severity_min: "high"
languages: ["jsts"]
buckets: ["testing"]
uuid: "a366d2ac-5960-4133-9b1b-330f726e6aa3"
enabled: true
---

## Instructions

vitest transpiles and never typechecks, so a test can pass while the shape it
asserts no longer exists. Two constructs hide exactly the errors `test:types`
would catch, and both make the test survive an upstream rename that should have
broken it.

Flag in a test file:

- a fixture cast to satisfy a type — `{ ... } as SomeType`, `as unknown as T`,
  `as any` — instead of being built to the real shape
- a mock left as a bare `vi.fn()` where the mocked member has a signature, so no
  argument or return type is checked
- `@ts-expect-error` or `@ts-ignore` over an assertion rather than over the
  single line under test

Build the fixture properly, or type the mock:
`vi.fn<Parameters<T>, ReturnType<T>>()` / `satisfies`.

## Examples

### Bad example

```typescript
const summary = { id: 'w1' } as RuntimeWorktreeSummary
const runtime = { listResolvedWorktrees: vi.fn() }
```

### Good example

```typescript
const summary: RuntimeWorktreeSummary = {
  id: 'w1',
  path: '/repo/w1',
  branch: 'main',
  status: 'clean'
}
const runtime = {
  listResolvedWorktrees:
    vi.fn<[], Promise<RuntimeWorktreeSummary[]>>().mockResolvedValue([summary])
}
```
