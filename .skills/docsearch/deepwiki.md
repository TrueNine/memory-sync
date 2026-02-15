# DeepWiki MCP Usage Guide

DeepWiki converts GitHub repositories into structured documentation, providing programmatic access via MCP protocol with AI-powered Q&A.

[Source: Devin Docs](https://docs.devin.ai/work-with-devin/deepwiki-mcp)

---

## AI Usage Workflow

DeepWiki MCP provides three core tools, use in following order:

### Step 1: Read Documentation Structure

**Tool**: `read_wiki_structure`

Get repository's documentation topic list to understand available content:

```
Tool: read_wiki_structure
Args: { 
  repoName: "facebook/react"
}
Returns: [
  "Getting Started",
  "Hooks",
  "API Reference",
  "Advanced Guides"
]
```

**Use cases**:
- Explore repository documentation organization
- Identify doc topics corresponding to user query
- Provide navigation for subsequent queries

### Step 2: Read Documentation Content

**Tool**: `read_wiki_contents`

Get detailed documentation for specific topic:

```
Tool: read_wiki_contents
Args: {
  repoName: "facebook/react",
  topic: "Hooks"
}
Returns: Complete documentation content in Markdown format
```

**Use cases**:
- Get detailed explanations for specific topics
- Extract code examples and API signatures
- View complete usage guides

### Step 3: Intelligent Q&A

**Tool**: `ask_question`

Ask AI directly, get context-based answers:

```
Tool: ask_question
Args: {
  repoName: "facebook/react",
  question: "How do I use useState with TypeScript?"
}
Returns: AI-generated answer based on repository documentation
```

**Use cases**:
- Quickly get answers to specific questions
- No need to manually browse documentation structure
- Get answers synthesizing multiple doc sources

---

## Invocation Timing

### Proactive Invocation (Immediate on Scenario Recognition)

Use DeepWiki when user query involves:

- **GitHub repository related**: "how to use XXX repo", "XXX project docs"
- **Open source project queries**: "Vite config", "Prisma schema"
- **Precise API queries**: "XXX function parameters", "XXX config options"
- **Version comparison**: "XXX v1 vs v2", "migration guide"

### Reactive Invocation (Explicit User Request)

- "check XXX repository docs"
- "get XXX info from DeepWiki"
- "ask XXX project documentation"

---

## Tool Selection Strategy

Choose appropriate tool based on query type:

| Query Type           | Recommended Tool      | Reason                       |
| -------------------- | --------------------- | ---------------------------- |
| Exploratory query    | `read_wiki_structure` | Understand doc organization first |
| Specific topic details | `read_wiki_contents` | Get complete documentation   |
| Quick Q&A            | `ask_question`        | AI provides direct answers   |
| Code examples        | `read_wiki_contents`  | Complete examples in docs    |
| Configuration guide  | `read_wiki_contents`  | Need detailed config options |
| Concept understanding | `ask_question`       | AI synthesizes multiple doc sources |
| Troubleshooting      | `ask_question`        | AI provides context-relevant solutions |

---

## Result Processing

### Extract Key Information

From returned results extract:

1. **read_wiki_structure**:
   - Documentation topic list
   - Related topic recommendations

2. **read_wiki_contents**:
   - Markdown formatted documentation
   - Code blocks and examples
   - API signatures and parameter descriptions

3. **ask_question**:
   - AI-generated answers
   - Cited documentation sources
   - Related code examples

### Cite Sources

Clearly cite information sources:

```
[Source: DeepWiki - facebook/react Official Documentation]
```

### Format Output

- Preserve Markdown formatted code blocks
- Extract key steps as lists
- Highlight important configuration options

---

## Error Handling Strategy

### Repository Not Found

```
Error: REPOSITORY_NOT_FOUND
Handling:
1. Check repo name format (must be "owner/repo")
2. Confirm repository is public (private repos need Devin API Key)
3. Fallback to web_search
```

### Documentation Not Available

```
Error: DOCUMENTATION_NOT_AVAILABLE
Handling:
1. Use read_wiki_structure to view available topics
2. Try more generic topic names
3. Use ask_question as alternative
```

### Q&A Timeout

```
Error: TIMEOUT
Handling:
1. Simplify question, focus on single topic
2. Use read_wiki_contents to read docs directly
3. Break into multiple smaller questions
```

---

## Best Practices

### Priority Rules

1. **Prefer ask_question**: Quick answers, suitable for most scenarios
2. **Secondary read_wiki_contents**: When need complete docs or code examples
3. **Last read_wiki_structure**: Exploratory queries or uncertain topics

### Query Optimization

- **Repo name format**: Must be `owner/repo` (e.g., `facebook/react`)
- **Specific questions**: `"useState with TypeScript"` better than `"React hooks"`
- **Avoid overly broad**: One specific question per query

### Result Validation

- Check if returned docs are latest version
- Verify code examples are complete and runnable
- Cross-validate information from multiple sources

---

## Comparison with Context7

| Feature          | DeepWiki                     | Context7                     |
| ---------------- | ---------------------------- | ---------------------------- |
| Data source      | GitHub repository docs       | Multi-source official docs   |
| Authentication   | No auth needed (public repos) | Requires API Key            |
| Intelligent Q&A  | ✅ Built-in AI Q&A           | ❌ Doc retrieval only        |
| Doc structure    | ✅ Can view structure        | ❌ Direct search             |
| Version support  | Follows repo latest version  | Supports specific versions   |
| Use cases        | GitHub open source projects  | Mainstream libraries/frameworks |

### Combined Use Recommendations

- **GitHub projects**: Prefer DeepWiki
- **NPM packages/frameworks**: Prefer Context7
- **Quick Q&A**: DeepWiki's `ask_question`
- **Version-specific**: Context7

---

## Caveats

1. **Public repos only**: Private repos need Devin API Key
2. **Parameter names**: Use `repoName` not `repository`
3. **Strict repo name format**: Must be `owner/repo` format
4. **No authentication**: Free to use, no rate limits (public repos)
5. **Recommended protocol**: Use `/mcp` endpoint, `/sse` deprecated
6. **Documentation dependency**: Repository must have structured docs (README, docs directory, etc.)

Content was rephrased for compliance with licensing restrictions.
