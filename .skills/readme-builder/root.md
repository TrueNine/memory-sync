# Root Project README

Root README (`app/*/rdm.cn.mdx`) is human-focused and minimal: “how to use”; mutually exclusive with sibling `agt.cn.mdx`; do not repeat agt content.

---

## Prerequisites

Before writing root readme:

1. If `app/<project>/agt.cn.mdx` exists, read it first.
2. List topics already in agt (type, tech stack, directory, commands, constraints, checklist, business context); avoid them in readme.

---

## Suggested structure (minimal)

### 1. Title

Project name (H1).

### 2. One line

Project purpose or role (one sentence). No tech stack dump; do not repeat agt’s type/architecture.

### 3. Quick start

Enough for a human to run and use:

- **Prerequisites** (one line if needed): e.g. Node.js >= 18, pnpm >= 8.
- **Installation**: clone + install (copy-paste commands).
- **Run**: start command + URL or how to verify.

Other sections (Features, Project Structure, Documentation links, Development, License/Acknowledgments) **only if not in agt and needed for humans**; no long template; keep short or omit.

---

## Writing principles

- **Runnable and usable**: No extra prose beyond high-level overview.
- **Zero overlap with agt**: Any topic in agt must not appear in readme.
- **Defensive programming**: Minimal disclosure; no implementation details, full command list, or tech text duplicated from agt.

---

## Minimal example

```md
# FishKit

Next.js full-stack template with auth, DB, and deployment config.

## Quick Start

### Prerequisites

Node.js >= 18, Docker & Docker Compose

### Installation

\`\`\`bash
git clone https://github.com/username/fishkit.git
cd fishkit
pnpm install
\`\`\`

### Run

\`\`\`bash
docker-compose up -d
pnpm dev
\`\`\`

Visit http://localhost:3000
```

If agt already covers project structure, Features, Development, omit those sections in readme; keep only title + one line + quick start.
