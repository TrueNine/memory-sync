---
name: readme-builder
description: "README writing and review spec: human-focused, minimal, mutually exclusive with agt, defensive programming. Activate when creating or optimising rdm.cn.mdx."
displayName: README Builder
keywords:
  - readme
  - documentation
  - docs
  - project-docs
  - markdown
  - mdx
author: TrueNine
version: 2025.02.02
---
## Core Constraints (Primacy)

**MUST follow**:

- **Only for projects under `app/*/`**
- **No hardcoded project paths**: Use generic refs like “sibling agt”, “root readme”; do not link to concrete paths or other .cn.mdx
- Filename must be `rdm.cn.mdx` (lowercase)
- Single file ≤12,000 characters (Chinese ≤6,000)
- British Chinese; keep English terms
- Clear structure and hierarchy; no redundancy
- Code examples must be runnable; paths must be correct

**Mutually exclusive with agt**: Before writing `rdm.cn.mdx`, MUST read sibling `agt.cn.mdx` (if present). Do not put in readme anything already in agt (type, tech stack, directory, commands, constraints, checklist, business context); readme covers only what humans need and agt does not.

**Human-focused, minimal**: Readme answers “how to use”—environment, install, run (and 1–2 links if needed); no long intro, no full feature/architecture/contributing guide.

**Defensive programming**: Readme uses minimal disclosure; no implementation details, internal architecture, full command list, or tech text duplicated from agt; keep length and structure short.

---

## On-Demand Loading

- **Root README (app/*/rdm.cn.mdx)** [root.md](root.md): Read sibling agt first; title + one line + quick start (env, install, run)
- **Child README (app/*/*/rdm.cn.mdx)** [child.md](child.md): Read sibling agt first; module name + one line + how to run/use in this module

---

## Validation Checklist (Recency)

After README:

- [ ] Sibling agt.cn.mdx read (if present); list topics already in agt
- [ ] No duplicated sections/topics between readme and agt
- [ ] No long open-source-style sections (full API, Contributing, detailed architecture)
- [ ] Project name and summary clear
- [ ] Quick start includes install + runnable example
- [ ] Code examples runnable; paths correct
- [ ] Character count ≤12,000 (Chinese ≤6,000)
- [ ] No redundancy; clear hierarchy
- [ ] British Chinese; English terms kept
- [ ] Filename is `rdm.cn.mdx` (lowercase)