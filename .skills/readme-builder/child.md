# Child Project README

Child README (`app/*/*/rdm.cn.mdx`) is human-focused and minimal: “how to use in this module”; mutually exclusive with sibling `agt.cn.mdx`; do not repeat agt content.

---

## Prerequisites

Before writing child readme:

1. If sibling `agt.cn.mdx` exists, read it first.
2. Do not repeat any of its content (type, tech stack, directory, commands, constraints, checklist, business context).

---

## Suggested structure (minimal)

### 1. Title

Module name (H1).

### 2. One line

Module purpose or role (one sentence). Do not repeat agt’s scope or architecture.

### 3. How to use

How to install/configure/run or call within this module (minimal steps); one link if needed. Enough for a human to run or call.

Other sections (Features, Installation/Configuration details, API Reference, Directory Structure, Development, Troubleshooting) **only if not in agt and needed for human use**; no full API/directory template.

If it depends on the root project, one line is enough.

---

## Writing principles

- **Runnable and callable**: Only what’s needed to use.
- **Zero overlap with agt**: Any topic in agt must not appear in readme.
- **Defensive programming**: Minimal disclosure; no implementation details, full command list, or tech text duplicated from agt.

---

## Minimal example

```md
# Backend API

Backend API service: auth and data management.

## How to use

\`\`\`bash
cd app/fishkit/backend
pnpm install && cp .env.example .env
pnpm dev
\`\`\`

Service at http://localhost:4000
```

If agt already covers directory structure, API Reference, Configuration, Development, Troubleshooting, do not repeat in readme; keep only title + one line + how to use (minimal steps or one link).
