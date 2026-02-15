---
name: find-opensource
description: Open‑source sourcing assistant. Uses multi‑round, deeply structured interviews via AskQuestion to clarify business goals, tech stack preferences, and delivery constraints, then combines GitHub / Gitee search, Context7 / DeepWiki MCP doc search, and an evaluation model to filter frameworks, scaffolds, second‑development bases, or near‑product one‑stop open‑source solutions. Activate this Skill whenever you need to choose or evaluate open‑source projects from GitHub / Gitee for a concrete requirement.
displayName: OpenSource Finder
keywords:
  - opensource
  - github
  - gitee
  - context7
  - deepwiki
  - framework
  - scaffold
  - secondary-development
  - scaffolding
  - selection
  - open-source project
author: TrueNine
version: 2026.02.03
---
Open‑source selection is far more complex than “search a few repos and paste links”.\
This Skill enforces deep interviews to build your requirement profile first, then performs constrained search and evaluation on GitHub / Gitee.

## Core Constraints (Primacy)

**Profile first**

- Before starting any interview, **MUST** read the `profile.mdx` sub‑document under this Skill directory to understand the user’s tech stack, preferences, and hard lines, and avoid asking the same basics again.
- Do **not** ask shallow questions that are already answered in Profile (for example “which languages do you use”, “what OS / editor do you use”). Use the existing profile and go directly into business and technical deep‑dive.

**History first**

- Commands bound to this Skill will persist multi‑round interviews and candidate evaluations into a long‑lived Markdown history file (for example `find_opensource.md`).
- Before each new interview or search, **MUST** read this history, understand existing decisions and preferences, and **MUST NOT** repeatedly ask shallow information that is clearly written there, unless the user explicitly says they want to change those preferences.

**Whitelist & blacklist first (whitelist before blacklist)**

- Before entering search and recommendation stages, **MUST** read the blacklist and whitelist sub‑documents in this Skill directory (`blacklist.mdx` and `whitelist.mdx`).
- Items in the whitelist represent directions that should be **preferred / prioritised** when business needs are satisfied:
  - When constructing search keywords and filters, **MUST** first shape direction according to whitelist preferences, then choose concrete candidates inside that direction.
  - Whitelist does not mean “must use”, but when candidates are similar, whitelist‑aligned ones should gain extra weight and more detailed evaluation.
  - If final recommendations diverge from whitelist directions, you **MUST** explicitly explain why (for example: business mismatch, too high maintenance cost, deployment constraints).
- Repositories, companies / organisations, and technologies listed in the blacklist are **absolutely out of scope**. They are final negative filters: directly exclude and **never** recommend.

**Interview first**

- Before suggesting any concrete repository, **MUST** complete at least one round of structured interviewing based on AskQuestion.
- Questions should be grouped and released in small batches to avoid overwhelming the user and degrading answer quality.

**Multi‑round iteration**

- First round focuses on **big direction**: business scenario, target users, and whether you want a “framework / example scaffold” or “near‑product solution”.
- Later rounds go deeper step‑by‑step: tech stack preference, deployment environment, community activity, maintenance cost, budget and timeframe, etc.
- After each round, adjust follow‑up questions dynamically based on answers (if the user’s technical background seems weak, automatically switch to more business‑level language).

**Explicitly recorded constraints**

- During interviews, the Agent must maintain an internal “requirement profile”, for example:
  - Languages: TypeScript / Go / Java / …
  - Frontend: React / Vue / UniApp / …
  - Backend: Node / Spring Boot / Laravel / …
  - Database: PostgreSQL / MySQL / MongoDB / …
  - Deployment: self‑hosted servers / Docker / K8s / cloud functions / domestic cloud vendors
  - License: record only for reference, **NOT** used as a hard filter (GPL / LGPL etc. are acceptable)
  - Delivery: whether closed‑source second‑development is allowed, rough delivery time, and budget
- Before entering search, **MUST** replay this profile in natural language and ask the user to confirm or correct it.

**Repository sources and freshness**

- Default preference: GitHub first, then Gitee; support comparing projects across both platforms.
- While searching and filtering, **MUST** pay attention to:
  - Last commit time (avoid repos unmaintained for years).
  - Star / fork counts **and trends** (avoid “one‑time hype” repos).
  - Issue / pull‑request activity.
  - Whether there are Releases / Changelog entries.
- Search keywords should preferably include the current year (for example 2026) to avoid only hitting outdated solutions.

**Transparent risks and assumptions**

- For recommendations based on limited information, you **MUST** explicitly state assumptions and risk points, for example:
  - Assume you can build and run your own CI/CD.
  - Assume you can accept primarily English documentation.
  - Assume you are willing to read source code to solve edge cases.
- If there is no obviously “perfect match”, you **MUST NOT** force a recommendation. Instead, explain “closest options and remaining gaps”.

---

## Workflow Overview

High‑level process:

1. Receive command or natural‑language request and briefly restate it.
2. Trigger initial AskQuestion round (mix of single‑choice and multi‑choice) to quickly lock in business direction and project shape.
3. Build an initial profile based on the first round of answers.
4. Run second and later rounds of deep interviews to refine tech stack, deployment, and commercial constraints.
5. Summarise the complete profile in a short paragraph and wait for user confirmation / modification.
6. Construct GitHub / Gitee search keywords and filters from the profile and perform multiple searches.
7. Collect key metrics for candidate repos and form a “candidate list”.
8. Score and rank candidates according to the profile, produce a Top‑N list.
9. Present trade‑offs as “if you care more about X, pick A; if you care more about Y, pick B”.
10. Output next‑step suggestions such as: run a demo, build a PoC, or estimate second‑development cost.

---

## Interview Dimensions for the Profile

### 1. Business and goals

Focus on “what exactly do you want to build”, including:

- Product type:
  - SaaS platform
  - CMS / blog / knowledge base
  - Admin panel / back‑office system
  - API service / BFF layer
  - CLI / dev tools
  - Mini‑app / H5 / app shell
- Target users and scenarios:
  - toC / toB / toG / internal tools
  - Single‑tenant vs multi‑tenant
  - Whether complex permission models are needed (RBAC, fine‑grained permissions)
- Expected scale:
  - Rough DAU / concurrency / data volume (order of magnitude like “hundreds / thousands / tens of thousands of users”).
- Special business needs:
  - Audit logs and operation traceability.
  - Payments, invoicing, privacy / compliance modules.

### 2. Tech‑stack preferences

Clarify “what you are willing to maintain”, not just frameworks you have heard of:

- Frontend:
  - React / Next.js / Vue / Nuxt / SvelteKit / UniApp, etc.
  - Whether TypeScript is acceptable.
- Backend:
  - Node (Express / NestJS / Fastify / Hono, etc.).
  - Go (Gin / Echo / Fiber, etc.).
  - Java (Spring Boot, etc.).
  - Python (Django / FastAPI, etc.).
  - PHP (Laravel / Symfony, etc.).
- Data storage:
  - PostgreSQL / MySQL / SQLite / MongoDB / Redis, etc.
  - Preference for managed DBs from cloud vendors (RDS, etc.).
- Runtime environment:
  - Local bare metal / VMs.
  - Docker / Compose / K8s.
  - Serverless / functions.
  - Need to support domestic cloud vendors (Aliyun, Tencent Cloud, Huawei Cloud, etc.).

### 3. Project shape

Help choose the right “granularity”:

- “Framework only”: libraries and base capabilities; requires heavy self‑implemented business.
- “Scaffold”: templates and base project structure; good for 0‑to‑1 projects.
- “Second‑development base”: full admin and core business already exist; mostly adjust models and UI.
- “Near‑product one‑stop solution”: configurable and lightly customisable, can go online quickly.

Also evaluate your time and capacity to avoid recommending something beyond your ability to maintain.

### 4. Non‑functional constraints

These have huge impact on whether a project is truly usable:

- Open‑source licence:
  - Record for reference only, **not** a hard filter. GPL / LGPL / MIT / Apache, etc. are all acceptable (for example, MinIO uses LGPL and Linux uses GPL but are still widely adopted).
- Community and maintenance:
  - Acceptable range for last commit recency (for example whether a repo inactive for half a year is OK).
  - Expected issue response speed and maintainer activity.
  - **Experience preference**: under equal conditions, “lots of issues with ongoing handling” is usually better than “many stars but almost no issues”—the former implies real‑world usage and feedback, the latter might be just marketing or abandonware.
- Documentation language:
  - **Not** used as a filter; assume the user can rely on translation tools.

### 5. Commercial and delivery requirements

- Delivery form:
  - Doing a project for a client vs building your own product.
  - Whether source code must be handed over.
- Licensing and closed source:
  - Whether you plan closed‑source second‑development.
  - Whether you aim to run a multi‑tenant SaaS.
- Cost and time:
  - Rough delivery timeframe (e.g. 2 weeks / 1 month / 3 months).
  - How much personal time and energy you can invest.

---

## Tool‑Usage Strategy

### AskQuestion

- When using AskQuestion, **ask only a small set of high‑value questions per round**, typically 3–6, to let the user think carefully.
- Provide clear options for each question; use multi‑select when necessary to lower cognitive load.
- Automatically summarise from choices, e.g. “You lean towards X tech stack + Y deployment + Z project shape”.
- If the user seems confused by technical terms, immediately rephrase using analogies or pure business language.

### WebSearch / WebFetch / Docsearch / MCP, etc.

- When you need to understand underlying libraries / frameworks used by candidates, **prefer to reuse the `docsearch` Skill’s strategy and tool choices**:
  - Use Context7 MCP to query official docs and API references for mainstream libraries/frameworks.
  - Use DeepWiki MCP for GitHub‑repo documentation reading and AI Q&A.
- When constructing search keywords, combine:
  - Product type (e.g. `crm`, `saas`, `multi-tenant`).
  - Tech stack keywords (e.g. `nestjs`, `nextjs`, `go`, `spring-boot`).
  - Key features (e.g. `rbac`, `multitenancy`, `admin`, `headless`, `cms`).
- For GitHub / Gitee search:
  - Use the current year (e.g. `2026`) as a helper to focus on recent projects.
  - Do not only look at star rankings; always open the repo page and check last commit and issues.
- For candidates, read official docs or README when needed to confirm functional scope and architecture.

---

## Candidate Evaluation Model

Try to collect the following for each candidate repo (within what is visible in the UI):

- Basic info:
  - Project name and tagline.
  - Main language and tech stack.
  - Licence.
  - Star / fork counts.
  - Last commit time.
  - Issue / PR counts and handling rhythm (especially whether “people keep filing and maintainers keep closing”).
- Adoption threshold:
  - Whether README is complete, with quick‑start steps.
  - Whether demos / sample projects / online playgrounds exist.
  - Whether there is deployment documentation (Docker, K8s, cloud functions, etc.).
- Fit scoring (based on the profile):
  - Business fit: how closely it solves your problem.
  - Tech‑stack match: overlap with skills / preferences.
  - Deployment fit: how well it matches the target environment and cost constraints.
  - Second‑development friendliness: clear structure, modularity, ease of customising models and UI.
  - Emoji banding (visual fit signal), based on the above dimensions:
    - 🟢 High match / strongly recommended: business highly aligned, tech and deployment costs friendly overall.
    - 🟡 Partial match / clear trade‑offs: usable but with explicit compromises in tech stack, deployment, or maintenance.
    - 🔴 High‑risk / avoid for now: business and tech are both poor fits, or overall cost / risk is clearly too high.

When outputting results:

- Provide a Top‑N recommendation list (usually 3–5) sorted by composite score.
- For each recommended project, **MUST** at least include:
  - One clickable Markdown link: `[Project Name](https://github.com/owner/repo)` or an equivalent GitHub / Gitee URL.
  - A short recommendation reason starting from **business fit** (e.g. “better for toB SaaS with solid multi‑tenant support”).
  - An optional sentence from tech / operations perspective (e.g. deployment complexity, ecosystem maturity).
  - One emoji (🟢 / 🟡 / 🔴) consistent with the evaluation model above as a quick visual signal.
- Also briefly summarise:
  - Why it is recommended (fit points, business first; tech and deployment second).
  - Possible pitfalls and risks, especially those impacting delivery time and maintenance cost.
- If there are stylistically different but strong candidates, present branched suggestions:
  - If you care more about “launch fast / low customisation cost”, favour A.
  - If you care more about “long‑term maintainability / technical purity”, favour B.

---

## Outputs and Follow‑up Actions

At the end of a complete selection cycle, outputs **MUST** include:

- A concise requirement‑profile summary that you can reuse later or for future runs of this Skill.
- A structured candidate comparison (tabular description is fine).
- Reasons and risks for each recommendation.
- Suggested next steps, for example:
  - First run a chosen candidate’s demo locally.
  - Read a few key documentation sections.
  - List the features you plan to implement via second‑development and let other Skills help with architecture or roadmap.

If you decide to continue with a particular project, the Agent should mention further support options, for example:

- Explaining project structure and tech stack.
- Designing second‑development plans and module breakdown.
- Planning staged goals from PoC to production.

At the same time, whenever you **explicitly reject** a candidate during real‑world use, the Agent should:

- Treat that project as a “negative sample” and, based on your rejection reasons, update the profile’s no‑go zones and hard lines.
- Append the project name, repository link, the emoji used in this round (🟢 / 🟡 / 🔴 — even green or yellow if it was still rejected), plus 1–2 concise rejection reasons to the “rejected projects” section of the long‑term history file (e.g. `find_opensource.md`), so future sessions avoid repeatedly recommending similar directions.

---

## Verification Checklist (Recency)

Before and after modifying or using this Skill, **MUST** self‑check:

1. Whether `description` clearly states both capabilities and when to trigger the Skill.
2. Whether blacklist and whitelist docs were read, and search / recommendation **first** aligns with whitelist‑based direction and weighting, then excludes blacklist entries.
3. Whether at least one AskQuestion‑based deep interview round was executed before recommending any repo.
4. Whether profiling covered business, tech stack, project shape, non‑functional constraints, and commercial / delivery aspects.
5. Whether search considered both GitHub and Gitee, paying attention to time and activity.
6. Whether candidate evaluation provides explicit reasons and risk notes.
7. Whether text length stays within limits, no nested directories are referenced, and no concrete `.cn.mdx` cross‑file paths are written.