---
name: subagent-builder
description: Teaches how to write src/agents/*.cn.mdx sub-agent configs. Activate when creating or editing sub-agent configs.
displayName: Subagent Builder
keywords:
  - agent
  - subagent
  - config
  - agt
  - builder
author: TrueNine
version: 2025.02.02
---
## Scope

- **Only** `src/agents/*.cn.mdx` (not `skill.cn.mdx`; that is handled by skill-builder)
- Filename and agent name use kebab-case (e.g. `pe_translate`, `todo_code-architect`)

## Core Constraints (Primacy)

- **No hardcoded .cn.mdx cross-links**: Do not write concrete project paths or links to other .cn.mdx; use generic references

**Front Matter** (aligned with existing agents):

- **Required**: `name`, `description`
- **Optional**: `model`, `allowedTools`, `color`

**Structure**: Front Matter first, then body as numbered steps; steps may use `## [STEP-N]` or `## N.`; headings in English.

**Single file**: ≤12,000 characters (Chinese ≤6,000).

---

## Validation Checklist (Recency)

After writing or modifying a sub-agent:

- [ ] Path is under `src/agents/`
- [ ] Front Matter includes `name`, `description`
- [ ] Section headings in English
- [ ] Token budget not exceeded