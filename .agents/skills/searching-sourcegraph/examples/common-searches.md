# Common Search Examples

Real-world search examples for common tasks.

## Finding Implementations

### "Where is authentication handled?"

```text
nls_search: "repo:^github.com/org/repo$ authentication middleware validation"
```

### "How do we make API calls?"

```text
keyword_search: "repo:^github.com/org/repo$ fetch\|axios\|http\.request"
```

### "Find all database queries"

```text
keyword_search: "repo:^github.com/org/repo$ \.query\(\|\.execute\("
```

## Understanding Flow

### "How does user signup work end-to-end?"

```text
deepsearch_read: "Trace the user signup flow from form submission to database creation"
```

### "What happens when a payment fails?"

```text
deepsearch_read: "How does the system handle failed payment attempts?"
```

## Debugging

### "Find where this error is thrown"

```text
keyword_search: "repo:^github.com/org/repo$ 'User not found'"
find_references: Find all usages of the error constant
```

### "What changed in authentication recently?"

```text
diff_search: repos=["github.com/org/repo"] pattern="auth" after="2 weeks ago"
```

## Finding Patterns

### "How do other features handle validation?"

```text
nls_search: "repo:^github.com/org/repo$ input validation schema"
```

### "Find examples of pagination"

```text
keyword_search: "repo:^github.com/org/repo$ offset\|limit\|cursor\|pageToken"
```

## Tracing Dependencies

### "What uses this utility function?"

```text
find_references: repo="github.com/org/repo" path="src/utils/format.ts" symbol="formatDate"
```

### "Where is this type defined?"

```text
go_to_definition: repo="github.com/org/repo" path="src/api/handler.ts" symbol="UserResponse"
```
