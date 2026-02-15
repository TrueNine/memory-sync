---
name: skill-builder
description: AI Agent Skill authoring guide. Based on Progressive Disclosure, teaches you to write well-structured .cn.mdx meta-prompts. Activate when creating, modifying, or reviewing Skill files.
displayName: Skill Builder
keywords:
  - skill
  - prompt
  - mdx
  - agent
  - builder
  - progressive-disclosure
author: TrueNine
version: 2025.12.27
---
# Skill Builder

## Core Constraints (Primacy)

**MUST follow**:

- Single file ≤12,000 chars (Chinese ≤6,000); main file (skill.cn.mdx) recommended ≤500 lines
- `.cn.mdx` written in Chinese, compiled to `.md` English for deployment
- **One-level subdirectories allowed**, nested directories prohibited
- Front Matter must include `name`, `version`, `displayName`, `description`, `keywords`, `author`
- `name` must match directory name, kebab-case
- `description` must contain **WHAT (functionality) + WHEN (trigger timing)**, ≤100 chars, third person
- `keywords` keep 5–7, specific not broad, avoid conflicts with other Skills
- **No hardcoded .cn.mdx cross-links**: do not write specific project paths or links to other .cn.mdx files; use generic references
- Core constraints at file top (Primacy), validation checklist at file end (Recency)
- Split into main file + sub-documents when content exceeds 3000 chars; sub-documents need no Front Matter
- **Context Budget awareness**: AI is already smart — only supplement what it doesn't know; concise examples beat verbose explanations
- **Consistent terminology**: use the same term for the same concept throughout; mixing prohibited (e.g. never alternate "directory" and "folder")

**Degrees of Freedom** (choose guidance granularity by task fragility):

| Level                        | When to Use                                    | Example                  |
| :--------------------------- | :--------------------------------------------- | :----------------------- |
| High (text guidance)         | Multiple approaches valid, context-dependent   | Code style suggestions   |
| Medium (template/pseudocode) | Recommended pattern, variants allowed          | File structure template  |
| Low (specific script)        | Fragile operation, strict consistency required | Database migration steps |

**Anti-Patterns** (prohibited):

- ❌ Too many options without a default recommendation
- ❌ Time-sensitive information (specific version numbers, date-bound conditions)
- ❌ Vague Skill naming (`helper`, `utils`, `tools`)
- ❌ Writing "When to Use" in skill.cn.mdx body (trigger info belongs in description only)

---

## On-Demand Loading

- **Create Skill** [create.md](create.md): Core philosophy, writing principles, file structure, Front Matter, QA document conventions
- **Modify Skill** [modify.md](modify.md): Modification principles, common scenarios, validation checklist
- **Optimize skill-builder itself** [self-optimize.md](self-optimize.md): Self-optimization directions and principles based on external platform examples

---

## Example Reference

Study writing highlights, not copy content:

| Example                                                                          | Highlights                                                 |
| :------------------------------------------------------------------------------- | :--------------------------------------------------------- |
| [example_figma.md](examples/example_figma.md)                                   | MCP integration + Hook configuration                       |
| [example_postman.md](examples/example_postman.md)                               | API test automation workflow                               |
| [example_power-builder.md](examples/example_power-builder.md)                   | Interactive creation flow                                  |
| [example_supabase-local.md](examples/example_supabase-local.md)                 | Steering file layering                                     |
| [example_codex_skill_creator.md](examples/example_codex_skill_creator.md)       | Context Budget awareness + Progressive Disclosure patterns |
| [example_cursor_create_skill.md](examples/example_cursor_create_skill.md)       | Requirements gathering + context inference + Anti-Patterns |
| [example_cursor_create_subagent.md](examples/example_cursor_create_subagent.md) | Isolated context + layered priorities                      |

---

## Validation Checklist (Recency)

Check after writing or modifying a Skill:

- [ ] Front Matter includes `name`, `version`, `displayName`, `description`, `keywords`, `author`
- [ ] `description` contains WHAT + WHEN, third person, ≤100 chars
- [ ] `name` matches directory name, kebab-case
- [ ] `keywords` 5–7, specific and precise
- [ ] Char count ≤12,000 (Chinese ≤6,000); main file ≤500 lines
- [ ] Core constraints at top (Primacy)
- [ ] Sub-document links use `.md` suffix
- [ ] No nested directories (one-level allowed)
- [ ] Consistent terminology throughout, no mixing
- [ ] No Anti-Patterns (too many options, time-sensitive info, vague naming, trigger conditions in body)
- [ ] New content does not conflict with existing content