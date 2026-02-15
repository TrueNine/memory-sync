---
name: docsearch
description: Search technical documentation and knowledge bases via MCP servers, providing official docs, API references, code examples. Activate when user queries library/framework usage, API docs, technical specs, code examples.
displayName: Documentation Searcher
keywords:
  - documentation
  - search
  - mcp
  - context7
  - deepwiki
  - api-docs
  - knowledge-base
  - github
  - official-docs
author: TrueNine
version: 2026.02.02
---
# docsearch

## Core Constraints (Primacy Effect)

**MUST comply**:

- Prioritize MCP server doc search, prohibit direct web_search
- Activate immediately on keyword recognition: library names, framework names, "docs", "API", "examples"
- Results MUST cite source server (Context7 or DeepWiki)
- Fallback to web_search only when MCP fails, inform user of reason

---

## Load on Demand

- **Context7 Usage Guide** [context7.md](context7.md): Vectorized doc search, suitable for mainstream libraries/frameworks (React, Next.js, Tailwind, etc.)
- **DeepWiki Usage Guide** [deepwiki.md](deepwiki.md): GitHub repository doc intelligent Q&A, suitable for open source project queries

---

## Server Selection Strategy

| Query Type                  | Recommended Server | Reason                                                    |
| --------------------------- | ------------------ | --------------------------------------------------------- |
| Mainstream libs/frameworks  | Context7           | Version-specific, official docs, multi-source aggregation |
| GitHub open source projects | DeepWiki           | Repo docs, intelligent Q&A, no auth needed                |
| Concept understanding       | Context7           | Semantic search, related content discovery                |
| Quick Q&A                   | DeepWiki           | AI Q&A, synthesizes multiple doc sources                  |
| Code examples               | Either             | Context7 official examples, DeepWiki repo examples        |
| API reference               | Context7           | Version-precise, complete parameters                      |

---

## Usage Workflow

### 1. Identify and Select Server

**Context7 scenarios**:

- User mentions mainstream libraries: React, Next.js, Vue, Tailwind, Prisma, Zod, etc.
- Need version-specific documentation
- Query API usage, parameter descriptions

**DeepWiki scenarios**:

- User mentions GitHub repository (`owner/repo` format)
- Open source project doc queries
- Need quick AI Q&A

### 2. Invoke MCP Tools

**Context7 invocation**:

```typescript
// Step 1: Resolve library ID
resolve-library-id({ query: "react" })
// Returns: "/facebook/react/18.2.0"

// Step 2: Query docs
query-docs({ 
  libraryId: "/facebook/react/18.2.0",
  query: "useState hook usage"
})
```

**DeepWiki invocation**:

```typescript
// Quick Q&A (recommended)
ask_question({
  repoName: "facebook/react",
  question: "How do I use useState with TypeScript?"
})

// Or read doc structure
read_wiki_structure({ repoName: "facebook/react" })
read_wiki_contents({ repoName: "facebook/react", topic: "Hooks" })
```

### 3. Process Results

- Extract key info: API signatures, code examples, config descriptions
- Cite sources: `[Source: Context7 - React 18.2.0]` or `[Source: DeepWiki - facebook/react]`
- Filter redundancy: Remove navigation, footers, irrelevant content
- Control length: Single output ≤2000 characters

### 4. Fallback Strategy

When MCP fails, execute in order:

1. Check server connection status (view MCP logs)
2. Try alternative MCP server
3. Use `web_search` tool
4. Clearly inform user of fallback reason and tool used

---

## Activation Timing

**Proactive activation** (activate immediately on keyword recognition):

- Library/framework names: React, Next.js, Vue, Tailwind, Prisma, TypeScript, Vite, etc.
- Doc-related words: official docs, API docs, technical specs, usage guides
- Query intent: how to use, parameter descriptions, code examples, best practices, version differences
- GitHub repositories: `owner/repo` format or explicit repo mention

**Example trigger words**:

- "how to use React Hooks"
- "Next.js 14 app router docs"
- "Prisma schema config"
- "facebook/react repository docs"
- "Tailwind CSS latest version"

---

## Caveats

1. **API Key protection**: Context7 API Key in `mcp.json` is sensitive, prohibit disclosure
2. **Service availability**: MCP servers may be offline, handle exceptions gracefully
3. **Result validation**: Docs may be outdated, cross-validate or cite version
4. **Character limit**: Single output ≤2000 characters, exceed requires segmentation or summary
5. **Repo format**: DeepWiki only supports `owner/repo` format, public repos only

---

## Verification Checklist (Recency Effect)

After using this Skill, check:

- [ ] Recognized keywords and proactively activated
- [ ] Selected appropriate MCP server (Context7 or DeepWiki)
- [ ] Invoked correct MCP tools
- [ ] Results cited source server and version
- [ ] Output length ≤2000 characters
- [ ] Fallback strategy executed (if needed)
- [ ] No API Key or sensitive info disclosed