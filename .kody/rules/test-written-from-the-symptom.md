---
title: "A test is written from the symptom, never from the implementation"
scope: "pull-request"
path: ["src/**/*.test.ts", "src/**/*.test.tsx", "patches/**"]
severity_min: "high"
buckets: ["testing"]
uuid: "96ac275e-ed56-46d1-92ba-856f1e3dfa1c"
enabled: true
---

## Instructions

"Has a test file" is not coverage. The series suite checks only that a patch
names a test in backticks and that the file exists — whether that test fails
without the patch stays a review question, and this is where it gets asked.

A test written from the implementation passes the moment the code is present and
proves nothing. Read the patch header's *To test* line, then the test, and flag
when the test:

- asserts on an identifier the patch itself introduces, rather than on the
  behaviour a user would observe
- mocks the very unit under test, so the assertion only re-states the mock
- would still pass with the patch reverted, because every branch it exercises is
  in the fixture rather than in the code
- checks that a method was called rather than what the caller then observes

The test should be derivable from the *To test* sentence alone, by someone who
has not read the diff.

## Examples

### Bad example

```typescript
// Asserts our own registration helper ran. Passes whatever it registered.
it('registers usage methods', () => {
  registerUsageMethods(dispatcher)
  expect(registerSpy).toHaveBeenCalledWith('usage.get')
})
```

### Good example

```typescript
// The symptom: the browser tile shows no usage. Ask over the wire and look.
it('answers usage.get over the runtime dispatcher', async () => {
  const response = await dispatcher.dispatch({ id: '1', method: 'usage.get' })
  expect(response.result).toMatchObject({ providers: expect.any(Array) })
})
```
