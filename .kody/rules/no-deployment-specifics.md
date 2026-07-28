---
title: "Nothing deployment-specific enters Orca's source"
scope: "file"
path: ["src/**/*.ts", "src/**/*.tsx"]
severity_min: "critical"
languages: ["jsts"]
buckets: ["security"]
uuid: "1da9a811-0cb0-41a2-8333-83f298b550cf"
enabled: true
---

## Instructions

Domains, workspace slugs, ports and URL shapes live in the template string an
operator writes, never in a constant a patch adds. The artifact is a
self-hostable AppImage: anything naming one deployment is wrong for every other.

Flag a literal introduced in the diff that encodes a deployment:

- a hostname or domain, including one in a default value or an example
- a scheme and host pair assembled into a URL
- a workspace slug, tenant name or account identifier
- a fixed port where the operator supplies one

Placeholders inside a documented template string are fine — that is the
mechanism. `localhost` and loopback literals are fine where the trusted-proxy
bind requires them.

## Examples

### Bad example

```typescript
const WORKSPACE_URL = `https://orca.example.net/workspace/${slug}`
```

### Good example

```typescript
// The operator writes the template; we only resolve it.
const url = resolveOpenInUrl(settings.openInUrlTemplate, { slug })
```
