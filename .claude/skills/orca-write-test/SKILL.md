---
name: orca-write-test
description: >-
  Write a test for an orca-server patch so that it compiles, fails without the patch, and passes
  with it. Use whenever adding or editing a `*.test.ts` / `*.test.tsx` carried by the overlay or by
  the series — including a test drafted by a subagent, which must be checked before it lands.
when_to_use: >-
  Before writing or landing any test, in `src/` or in a patch. Triggers: "add a test", "cover this
  patch", "write the acceptance test", "promote this test", "this patch has no test", or reviewing
  a subagent's drafted test.
---

# Write a test that actually checks something

A test written to verify the work is worthless if the test itself is broken. Three ways it can be
broken, in the order they have actually bitten this repo:

1. **It does not compile.** `vitest` transpiles and never typechecks, so a test with a wrong prop
   type, a fixture key that is not a real key, or a stale import runs green locally and fails only
   in `mise run test:types`, or minutes into CI if you skip it.
2. **It never fails.** A test that has never been red proves nothing about the code — only that it
   agrees with it.
3. **It asserts the defect.** Written by reading the implementation, it freezes the bug in place.

## The loop

```bash
mise run overlay       # after EVERY edit to a file in src/
mise run test:types    # MUST be clean — vitest will not tell you
cd lib/orca && pnpm exec vitest run --config config/vitest.config.ts <file>
```

An overlay test is edited in `src/` and run from the copy at `lib/orca/src/`, so a run that skips
the overlay executes the previous version of the test. Editing the copy instead is worse: the next
overlay run overwrites it and nothing records the edit.

`test:types` is not optional and not a later gate. Run it before you claim a test is written. It
deletes the stale `tsbuildinfo` that would otherwise hide an error you just wrote, which is the
step a hand-run `pnpm run typecheck:tsc` skips — and under zsh a `rm config/*.tsbuildinfo` with no
match aborts the whole command chain, so the typecheck silently never runs.

## Prove it red before you make it green

Popping the patch alone does not prove it: `quilt pop` takes neither the overlay's test nor the
overlay's implementation, so an overlay test of an overlay module stays green with its patch popped.
To remove both owners:

```bash
mise run down   # lib/orca back to pristine
mise run up     # and back again
```

That answers "does this fail on bare upstream", which is the drop question. It does not answer
"which cases does this patch own", because a whole-file collection failure looks identical to a real
assertion failure. For that, disable the behaviour, run the test, watch the right cases fail, then
restore:

- delete the one call the patch adds, or
- invert the one condition the patch introduces.

Then say which cases went red **and which did not**. A case that stays green either way is a
regression guard, not a proof — that is fine, but label it. Never report "all cases pass" as
evidence; it is evidence of nothing until they have been seen failing.

Prefer assertion-level failure over collection-level. If disabling the behaviour removes an export
the test imports, the file fails to collect and every case "fails" for one reason, which
discriminates nothing.

## Write it from the symptom, never from the code

Every patch header carries a **To test** line describing what a user sees when the patch is absent.
That sentence is the test. Read the header first. You may read the diff to learn signatures so the
test compiles — you may not derive expected *values* by reading what the implementation returns.
That is how a sibling patch shipped a green test asserting its own defect.

If the header does not say enough to write a symptom-derived assertion, say so instead of inventing
one that merely agrees with the code.

## Types are part of the test

- **Never cast a fixture.** `const x: T = {...} as T` disables excess-property checking, so a
  fixture can name a key that does not exist on `T` and the assertion against it tests nothing. Use
  the annotation alone and let the compiler reject the key.
- **Type mocks from the real signature.** A bare `vi.fn()` is `Mock<Procedure>` and satisfies any
  prop, so a renamed or re-signatured prop still compiles and the case quietly stops testing
  anything. Derive from the component's own props:
  ```ts
  type Handlers = { [K in 'onChange' | 'onCommit']: Mock<OpenInMenuRowProps[K]> }
  ```
- **Check a key exists before asserting on it.** A property that is not on the type is not a
  setting; `git -C lib/orca show <tag>:src/shared/types.ts` and read the real declaration, and mind
  which type a line actually falls inside — `GlobalSettings` ends well before the file does.

## Every capability gets its own case

Eight RPC methods and one allowlist assertion is not eight tested methods. If a patch adds N
capabilities, N cases. Where a capability has no user-visible symptom yet, say what it *is*
specified against (usually the desktop handler it mirrors) and record that limit in the patch
header rather than implying coverage the test does not have.

## Landing it

A new test file goes in the overlay, at `src/<path>`, mirroring where it must land under
`lib/orca/src/`. No quilt command touches it. A test that *modifies* an upstream test file stays
in the patch that modifies it: `quilt add` **before** the first edit — see `orca-patch-author` —
then `quilt refresh` and confirm with `grep -c '^+++ orca-server/lib/orca/<path>$'
patches/<patch>.diff`. Either way the file count from `mise run test:unit` must rise; it
derives its list from the patches and the overlay together. `series.bats` check 10 fails a file
owned by neither.

Name the test file in the patch header's *To test* line, in backticks. That naming is now the only
link between a capability and its test, and `series.bats` check 5 asserts only that the header
names a `*.test.ts` and that a file of that name exists in the tree; it cannot tell whether the
test is any good.

## Reviewing a subagent's drafted test

Treat it as unverified. Run the loop above yourself: typecheck it, prove it red, and read it for
the three failure modes. Drafted tests in this repo have arrived with a non-existent settings key
and an untyped mock — both compiled fine under `vitest` and both failed `tsc`.

Then gate the push with `orca-patch-verify`, all four gates, not three.
