# Context7 MCP Usage Guide

Context7 provides latest, version-specific official documentation and code examples via MCP protocol, preventing AI from generating outdated or incorrect code.

[Source: Upstash Blog](https://upstash.com/blog/context7-mcp)

---

## AI Usage Workflow

### Step 1: Resolve Library ID

**MUST call** `resolve-library-id` tool first to get Context7-compatible library ID:

```
Tool: resolve-library-id
Args: { query: "react" }
Returns: "/facebook/react" or "/facebook/react/18.2.0"
```

**Note**: Unless user explicitly provides library ID in `/org/project` or `/org/project/version` format, this step is mandatory.

### Step 2: Query Documentation

Use resolved library ID to call `query-docs` tool:

```
Tool: query-docs
Args: {
  libraryId: "/facebook/react/18.2.0",
  query: "useState hook usage"
}
```

---

## Invocation Timing

### Proactive Invocation (Immediate on Keyword Recognition)

Use Context7 immediately when user query contains:

- Specific library/framework names: "Next.js", "Zod", "Tailwind", "React Query"
- API usage inquiries: "how to use XXX", "XXX parameters"
- Version-related: "XXX latest version", "XXX v2 vs v3"
- Code examples: "XXX example", "how to write XXX"

### Reactive Invocation (Explicit User Request)

- "check with context7"
- "get XXX official docs"
- "fetch docs from context7"

---

## Result Processing

### Extract Key Information

From returned documentation extract:
1. API signatures and parameter descriptions
2. Code examples (prioritize official examples)
3. Best practice recommendations
4. Version compatibility notes

### Cite Sources

Clearly cite in response:
```
[Source: Context7 - React 18.2.0 Official Documentation]
```

### Filter Redundancy

- Remove navigation, footers, and irrelevant content from docs
- Keep only parts directly relevant to user query
- Control output within 2000 characters

---

## Error Handling Strategy

### Library Not Found

```
Error: LIBRARY_NOT_FOUND
Handling: 
1. Try more generic library name (e.g., "react-router" → "react")
2. Fallback to web_search tool
3. Inform user Context7 doesn't support this library yet
```

### Rate Limit

```
Error: RATE_LIMIT
Handling:
1. Wait 60 seconds then retry
2. Use cached documentation (if available)
3. Fallback to web_search
```

### Outdated Documentation

```
Situation: Returned doc version doesn't match user needs
Handling:
1. Specify version in resolve-library-id
2. Cross-validate with web_search results
3. Clearly inform user of doc version
```

---

## Best Practices

### Priority Rules

1. **Prefer Context7**: For mainstream libraries (React, Next.js, Vue, Tailwind, etc.)
2. **Fallback web_search**: When Context7 fails or library unsupported
3. **Combined Use**: Context7 provides foundation, web_search supplements latest changes

### Query Optimization

- **Specific queries**: `"useState hook"` better than `"react state"`
- **Include version**: `"Next.js 14 app router"` better than `"Next.js routing"`
- **Focus topic**: One topic per query, avoid overly broad

### Result Validation

- Check if returned code examples are complete and runnable
- Verify API signatures match user environment version
- Compare multiple sources to confirm accuracy

---

## Caveats

1. **Must resolve library ID first**: Direct `query-docs` call will fail
2. **Version sensitive**: Fast-iterating libraries (Next.js, Tailwind) must specify version
3. **Free tier limits**: Mind rate limits, avoid excessive requests in short time
4. **Not omnipotent**: Niche or internal libraries may be unsupported, need fallback

Content was rephrased for compliance with licensing restrictions.
