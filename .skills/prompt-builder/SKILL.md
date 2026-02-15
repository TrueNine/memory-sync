---
name: prompt-builder
description: |
  Organise scattered ideas into clear agt.cn.mdx prompts; manage Global/Root/Child three-level context hierarchy.
  Activate when user has a new project draft or needs to optimise existing prompts.
displayName: Prompt Builder
keywords:
  - prompt
  - agents
  - memory
  - global
  - root
  - child
  - context
  - hierarchy
  - bootstrap
  - idea
  - draft
author: TrueNine
version: 2025.12.27
---
**Scope**

| File path                 | Type   | Reference                                           |
| :------------------------ | :----- | :-------------------------------------------------- |
| `app/global.cn.mdx`       | Global | [global-memory-prompt.md](global-memory-prompt.md) |
| `app/*/src/agt.cn.mdx`    | Root   | [root-memory-prompt.md](root-memory-prompt.md)     |
| `app/*/src/**/agt.cn.mdx` | Child  | [child-memory-prompt.md](child-memory-prompt.md)   |

⚠️ MUST stop and warn user when file path does not match. `skill.cn.mdx` is handled by skill-builder.

**Core Specifications**

| Spec                | Link                            |
| :------------------ | :------------------------------ |
| Prompt techniques   | [prompt.md](prompt.md)         |
| Directory structure | [structure.md](structure.md)   |
| Emoji validation    | [emoji.md](validates/emoji.md) |

**Bootstrap Process (From Draft)**

User drafts may be minimal, e.g.:

```
nextjs
use figma for design
google stitch for prototypes
```

Steps:

1. **Identify Draft Type**

- Infer Root vs Child from file path
- Root: `app/*/src/agt.cn.mdx`
- Child: `app/*/src/**/agt.cn.mdx`

2. **Extract Existing Info**

- From draft: tech stack? tools? goals?
- Example above: Next.js (stack), Figma (design), Google Stitch (prototype)

3. **Access Real Project**

- Read `~/project/{project-name}/` for `package.json`, `tsconfig.json`, etc. for versions
- Read directory layout for project organisation

4. **Ask Missing Info** (only when needed)

- What does the project do? (purpose/context)
- Tech stack versions? (if not obtainable from project)
- AI collaboration focus? (optional)

5. **Output by Template**

- Root: [root-memory-prompt.md](root-memory-prompt.md)
- Child: [child-memory-prompt.md](child-memory-prompt.md)
- Preserve user’s wording style

**Example: Bootstrap Root from Draft**

Input draft:

```
nextjs
use figma for design
```

Output:

```md
# fishkit

Next.js frontend project, using Figma for UI design.

**Type**
Frontend project

**Tech Stack**
- Next.js 14.2.0
- React 18.3.1
- TypeScript 5.4.0

**MUST Use MCP Servers**
- figma: UI design review and component mapping
```

**Optimization Process (Improve Existing)**

When optimising existing prompts under `app/*/src`:

1. Collect all agt.cn.mdx in that project
2. Analyse hierarchy (Root → Child → nested Child)
3. Check for context conflicts; ensure Child does not contradict Root/parent
4. Restructure by level so that:

- Root defines project-wide rules
- Child refines per module without contradicting Root
- Nested Child further specialises without contradicting parent

**Hierarchy Priority**

From high to low: Global > Root > Child (deeper = more specialised)

**✅ Correct: Child refines Root**

- Root: use camelCase
- Child: controller methods use `handle` prefix

**❌ Wrong: Child contradicts Root**

- Root: use camelCase
- Child: use snake_case (conflicts with Root)

**Writing Constraints**

- Token budget: ≤12,000 characters (Chinese ≤6,000)
- Primacy–Recency: core task at start, validation at end
- Versions: tech stack MUST state explicit versions
- Format priority: TOON > YAML > Markdown > XML/JSON
- Few-Shot: use when format matters; use Zero-Shot for open-ended questions

**Anti-Patterns**

- Vague descriptions (no clear criteria)
- Conflicting constraints (rules contradict)
- No validation (cannot tell when done)
- Context conflict (Child vs parent)
- Over-asking (do not ask for info obtainable from project)
- **No hardcoded .cn.mdx cross-links**: Do not write concrete paths or links to other .cn.mdx; refer by level (Root, Child, sibling agt, Monorepo Root prompt, etc.)

**Validation Checklist (Recency)**

- [ ] File path is in scope
- [ ] Written per type reference
- [ ] Token budget not exceeded
- [ ] Tech stack has versions (from project or marked TBD)
- [ ] No context conflicts