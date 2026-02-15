---
name: commands-builder
description: Teaches how to write src/commands/*.cn.mdx command files. Activate when creating or modifying commands under commands/.
displayName: Commands Builder
keywords:
  - command
  - automation
  - pe_
  - spec_
  - todo_
  - sk_
  - builder
author: TrueNine
version: 2025.02.02
---
## Core Constraints (Primacy)

**MUST follow**:

- **Scope**: Only `src/commands/*.cn.mdx` files
- **No hardcoded .cn.mdx cross-links**: Do not write concrete project paths or links to other .cn.mdx; use generic references
- **Command prefixes**: `pe_` (prompt engineering), `spec_` (spec-driven), `todo_` (task management), `sk_` (skill activation)
- **Native tools preferred**: Prefer Read/Write/List over CLI
- **Single file**: ≤12,000 characters (Chinese ≤6,000)

**Parameter Parsing**: First step MUST parse params from `$ARGUMENTS`; state optionality, default, type, constraints. Single param: `$1 (path): Required, string, file path`; multiple: split by space and supply defaults.

**Writing Principles** (aligned with commands spec): Specific > Generic; Explicit params; Concise steps; No duplication.

---

## On-Demand Loading

- **New command**: Decide type and purpose → Front Matter (argumentHint, allowedTools, description) → Summary → Constraints → Mermaid flowchart (if needed) → Numbered steps → Validation checklist
- **Modify command**: Read existing content → Check format and spec → Refine steps, fill gaps → Prefer native tools

---

## Validation Checklist (Recency)

After writing or modifying a command:

- [ ] Front Matter includes `argumentHint`, `allowedTools`, `description`
- [ ] Command prefix is valid (`pe_`/`spec_`/`todo_`/`sk_`)
- [ ] Steps use numbered format (1. 2. 2.1)
- [ ] First step parses `$ARGUMENTS` and defines param attributes
- [ ] Tools prefer native (Read/Write/List)
- [ ] Token budget ≤12,000 characters (Chinese ≤6,000)