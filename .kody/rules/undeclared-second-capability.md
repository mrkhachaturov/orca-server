---
title: "A patch carries exactly the capability its header names"
scope: "pull-request"
path: ["**/*"]
severity_min: "high"
buckets: ["documentation"]
uuid: "05b42b05-6cc7-4f2b-a751-18befd845b3d"
enabled: true
---

## Instructions

Every patch carries a rationale header naming one capability, the symptom when
it is absent, and how to test it. A diff that also does a second, unnamed thing
is invisible to a review that reads the header — an audit of this series found
six patches doing a quiet second thing.

Compare what the diff changes against what the header claims. Flag a change
that:

- touches a subsystem the header never mentions
- adds a second RPC method, setting or projection beyond the named one
- fixes an unrelated bug found along the way
- adds an entry to an allowlist or catalogue the header does not discuss

The remedy is never to delete the work. Either name it in the header and its
*To test* line, or move it to its own patch.

## Examples

### Bad example

Header names "restore the last active workspace after a browser restart". The
diff restores the workspace and also changes terminal tab ordering, with no
mention of ordering anywhere in the header.

### Good example

Header names "restore the last active workspace after a browser restart" and the
diff touches only the workspace pointer, its wire representation, and the test
named in the header.
