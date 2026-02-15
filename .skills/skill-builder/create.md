# Create Skill

## Core Philosophy

A Skill is not a specification document — it's **a guide teaching AI how to do things**.

A good Skill answers three questions:
1. **What to do** — the core tasks in this domain
2. **How to do it** — your usual approach and preferences
3. **When to do it** — trigger conditions and on-demand loading

Based on the [agentskills.io](https://agentskills.io) open standard, the core idea is **Progressive Disclosure**:
- Discovery — Agent loads only name + description at startup (~100 tokens)
- Activation — Full skill.md loaded when task matches (\<5000 tokens)
- Execution — Sub-documents loaded on demand

**Key premise**: AI is already smart. Only supplement what it doesn't know. Concise examples beat verbose explanations. Ask yourself for every piece of content: "Is this worth the token cost?"

---

## Creation Workflow

### Phase 1: Discovery

Before writing, clarify:
- What problem does this Skill solve? Who is the target user?
- What **key information does AI lack** on its own?
- Is there existing context to infer from (conversations, codebase, docs)?
- What can be loaded on demand vs. what must be in the main file?

### Phase 2: Design

Determine structure:
- Simple Skill (\<3000 chars) → single file
- Complex Skill (\>3000 chars) → main file + sub-documents
- Draft `name` (kebab-case), `description` (WHAT + WHEN), `keywords`

### Phase 3: Implementation

Write following the Writing Principles and File Structure below.

### Phase 4: Verification

Run through the main file's Validation Checklist item by item.

---

## Writing Principles

### 1. Concise Over Verbose

AI is already smart — only supplement what it doesn't know. Ask yourself for every piece of content: "Is this worth the token cost?"

- Concise examples beat verbose explanations
- One good code snippet beats three paragraphs of description
- Keep main file under 500 lines

### 2. Description is the Soul

The description determines whether a Skill gets activated. It must contain:
- **WHAT** — functionality description
- **WHEN** — trigger conditions

**Must use third person** (description is injected into system prompt):

```js
// Good — third person, WHAT + WHEN clear
description: 'Relational database design standards with PostgreSQL as the de facto standard. Use when designing database tables, writing SQL, naming fields, or seeding data.'

// Bad — first person
description: 'I help you handle database-related work.'

// Bad — no WHEN
description: 'Best practices for database design.'
```

### 3. Core Constraints Go First

AI has a Primacy-Recency effect when reading docs: it remembers the beginning and end best.

Place **mandatory rules** in `## Core Constraints (Primacy)` at the very top of the body.

### 4. On-Demand Loading, No Piling Up

Split when content exceeds 3000 chars. Main file should only contain:
- Core constraints
- On-demand loading index
- Validation checklist

Sub-document format: `**Trigger condition** [file link](path): brief description`

```mdx
## On-Demand Loading

- **Table creation, primary key definition** [primary-key.md](primary-key.md): uuid + UUIDv7 preferred
- **Business tables, change tracking** [audit.md](audit.md): crd/mrd/rlv three audit fields
```

### 5. Validation Checklist Goes Last (Optional)

If the task needs check items, place `## Validation Checklist (Recency)` at the end. Not every Skill needs one.

---

## File Structure

```
{skill-name}/
├── skill.cn.mdx          # Main entry (required)
├── {topic-a}.cn.mdx      # Sub-document (optional)
├── {topic-b}.cn.mdx      # Sub-document (optional)
└── examples/             # One-level directory (optional)
    └── example_xxx.cn.mdx
```

**Recommendation**: Consider organising with a one-level directory when files exceed 3
**Allowed**: One-level directories like `examples/`, `references/`
**Prohibited**: Nested directories like `examples/nested/`

---

## Front Matter

```js
export default {
  name: 'skill-name',              // kebab-case, matches directory name
  version: '2025.12.27',           // date-based version
  displayName: 'Skill Name',       // display name
  description: 'Function + trigger timing',   // ≤100 chars, most important
  keywords: ['kw1', 'kw2', 'kw3'], // 5–7 precise keywords
  author: 'AuthorName',            // author
}
```

**keywords must be precise**:
```js
// Good — specific and relevant
keywords: ['postgresql', 'postgres', 'sql', 'schema', 'table', 'primary-key']

// Bad — too broad, prone to false triggers
keywords: ['database', 'data', 'help']
```

---

## Two Modes

### Simple Skill (Under 3000 Characters)

All content in one file:

```mdx
export default {
  name: 'simple-skill',
  ...
}

## Core Constraints (Primacy)

[Mandatory rules]

## Specific Guidance

[How to do it]
```

### Complex Skill (Over 3000 Characters)

Main file + sub-documents:

```mdx
export default {
  name: 'complex-skill',
  ...
}

## Core Constraints (Primacy)

[Mandatory rules]

## On-Demand Loading

- **Scenario A** [topic-a.md](topic-a.md): brief description
- **Scenario B** [topic-b.md](topic-b.md): brief description

## Validation Checklist (Recency)

[Post-completion checks]
```

Sub-documents **need no Front Matter** — jump straight into content.

---

## Progressive Disclosure Patterns

When splitting sub-documents, choose the appropriate pattern:

**Pattern A — High-level guide + reference docs** (most common):

Lean main file, sub-documents loaded on demand. Suits most complex Skills.

```mdx
## On-Demand Loading

- **Quick start** [quickstart.md](quickstart.md): installation and configuration
- **Advanced usage** [advanced.md](advanced.md): advanced patterns
```

**Pattern B — Domain grouping**:

Split by business domain; AI loads only the relevant domain. Suits multi-domain Skills.

```mdx
## On-Demand Loading

- **Frontend related** [frontend.md](frontend.md): React/Vue component standards
- **Backend related** [backend.md](backend.md): API design + database
```

**Pattern C — Conditional details**:

Inline basic content, link advanced content. Suits Skills with clear basic/advanced tiers.

```mdx
## Basic Usage

[Inline core guidance]

**Need change tracking?** See [audit.md](audit.md)
**Need custom validation?** See [validation.md](validation.md)
```

---

## Anti-Patterns

Avoid when writing Skills:

| Anti-Pattern | Example | Fix |
|:-------------|:--------|:----|
| Too many options without default | "Can use A, B, C, D…" | Give a default recommendation, put alternatives in sub-docs |
| Time-sensitive info | "Use old API before 2025" | Use "Current approach / Legacy approach" sections |
| Mixed terminology | Alternating "directory" and "folder" | Unify to one term throughout |
| Vague naming | `helper`, `utils` | Use verb phrases: `generate-types` |
| Trigger conditions in body | "Use this Skill when you need…" | Trigger info belongs in description only |

---

## QA Document Convention

When a Skill involves tool usage or external dependencies, consider creating a `qa.cn.mdx` to record common issues and solutions.

### Design Philosophy

QA documents are **distilled human experience**, used to:
- Record mistakes AI tends to make
- Provide verified solutions
- Reduce repeated pitfalls

### File Structure

```mdx
# #1 Issue Title

**Error message**:
```
Specific error content
```

**Cause**: Brief explanation of why it occurs.

**Solution**: Specific steps or code.

---

# #2 Another Issue
...
```

### Numbering Rules

- Use `# #1`, `# #2` format (H1 heading + numeric ID)
- Numeric IDs remain unchanged after translation, ensuring stable cross-language links
- Separate issues with `---`

### Reference in Main File

Add warnings and links in the skill.cn.mdx tool table:

```mdx
| Tool | Usage |
|:-----|:------|
| `some_tool` | Functionality description. ⚠️ Caveats, see [qa.md#1](qa.md#1) |
```
