# TrueNine Technical Profile (Shared Across Skills)

> This file is the “long‑term stable persona” for the user. All Skills should read it to understand the user’s background and **avoid repeatedly asking the same basic technical questions**. Update this file only when there are major changes.

## Basic Profile

- **Identity**: 赵日天 / TrueNine, male, 1997‑11‑04.
- **Region & environment**: Mainland China, where in practice:
  - Access to GitHub and other foreign sites depends on proxies, but is overall possible.
  - You should always consider GFW‑related issues with docs access and mirrors.
- **Overall experience**: Roughly “mid‑level developer”. Has delivered and maintained several projects end‑to‑end, and has grown in multiple technical directions in a distributed way—strong in some areas, weaker in others.

## Primary Languages & Backend Stack

> Order reflects familiarity, from strongest to weakest.

- **Primary languages**:
  1. Kotlin
  2. Java
  3. TypeScript + Node.js
  4. .NET Core (C#)
  5. Go
  6. Rust (long‑term investment / exploration)

- **Backend / API stack**:
  - **Kotlin + Spring Boot 3**: One of the preferred main combinations, suitable for serious business backends.
  - **Kotlin + Ktor**: Also usable, good for lightweight APIs / services.
  - **Java + Spring Boot**: Traditional Java experience is present.
  - **TypeScript + Node.js**:
    - Familiar with Next.js full‑stack (both frontend and API Routes).
    - Can write general Node services (Express / NestJS / Fastify / Hono, etc.).
  - **.NET Core**: Can write ASP.NET Core backends; usable but not top priority.
  - **Go**: Competent enough to build backend services with Gin / Echo, etc.
  - **Rust**: Currently more for learning and experiments; can be introduced gradually but not for short‑term income‑critical work.

> Conclusion: **For serious backends / BFF, prefer Kotlin + Spring Boot 3 or TypeScript + Node.js, then Go / .NET Core. Rust is mainly a long‑term bet.**

## Frontend & Client Stack

- **Frontend frameworks familiarity**:
  - Vue 3 and its ecosystem (including Nuxt 3).
  - React and its ecosystem (including Next.js).
  - UniApp 3 (for multi‑platform mini‑apps / H5).
- **Frontend capability**:
  - Can implement complete business frontends, not just HTML slicing.
  - Comfortable with modern component‑based frameworks (Vue/React) and TS‑friendly setups.
  - Prefers “full‑stack” ownership (frontend + backend) over pure frontend outsource work.

> Conclusion: **Frontend choices should favour Vue3/Nuxt or React/Next.js, paired with Kotlin / Node backends to build full‑stack systems.**

## Infrastructure & Ops Skills

- **OS & tools**:
  - Uses **Windows** and **Linux** (including WSL) in development.
  - Editors / IDEs: mainly **IntelliJ / IDEA family** and **VSCode / Cursor**.
- **Ops / infrastructure**:
  - Comfortable with **Docker / Compose**, can write Dockerfiles and compose configs.
  - Has decent understanding of **Kubernetes**, including core resources and deployment flows (roughly “k8s_ok” level).
  - Able to deploy on cloud platforms, but does not want to be locked into pure ops work.

> Conclusion: **Best suited for Docker/K8s‑friendly backend / full‑stack projects, not for pure ops roles.**

## Project & Work Preferences

### Preferred tech combinations

- **First‑choice combos**:
  - Kotlin + Spring Boot 3 + frontend (Vue3 / React / Next.js).
  - TypeScript + Node.js + Next.js (full‑stack).
- **Acceptable combos**:
  - Go backend + Vue3 frontend.
  - .NET Core full stack when appropriate, but not top priority.
- **Long‑term bets**:
  - Rust as a future direction, gradually applied to tools, libraries, and performance‑sensitive modules, but not as the current main money‑making stack.

### Clearly avoided / undesirable directions

- Legacy PHP projects / systems, especially ones with chaotic structure.
- JSP / old‑school Java EE tech stacks.
- Pure ops roles or work dominated by manual ops.
- One‑off WeChat mini‑programme lightweight gigs, especially low‑paid mixed bags.
- Pure slicing / no‑tech‑content frontend work (e.g. PSD‑to‑HTML grunt work).

> Conclusion: **Prefers full‑stack / backend projects with some technical challenge and potential for accumulation, and avoids pure labour or legacy mud.**

## Financial Pressure & Cooperation Baselines

- **Current reality**:
  - Financial pressure is real; needs to improve income via projects / tech relatively quickly.
- **Priorities & balance**:
  - In the short term, money matters, but tech stack should not be trash; avoid being trapped by bad choices.
  - Also cares about technical growth and architecture ability; does not want to sacrifice all long‑term value for small short‑term gains.
- **Hard baselines**:
  - Rejects “equity / future profit” style unpaid labour.
  - Does not want to be drained again by relatives / friends / “student” clients who aim to free‑ride.

> Conclusion: **Can compromise pragmatically for income, but not at the cost of future growth; rejects unpaid or heavily one‑sided deals.**

## Focus for the Next 6–12 Months

- **Goal priorities (unordered)**:
  - Improve the ability to **quickly earn from gigs**: leverage existing open‑source bases + familiar stacks to rapidly assemble deliverable products.
  - Strengthen **full‑stack skills**: frontend + backend + deployment as a closed loop.
  - Improve **architecture and large‑project organisation**: more confident module splitting and debt control.
  - Explore and deepen **AI / Agents / automation development**, turning AI into real productivity rather than a toy.

> This implies: when recommending tech stacks / project shapes, prioritise the balance of **monetisation potential + accumulation + extensibility**, instead of extreme optimisation on any single axis.

---

## Instructions for All Skills

- **What you should NOT ask again**:
  - “Can you program / which languages have you used” – this is already in the Profile.
  - “Which OS / editor do you use” – also fully covered here.
  - “Are you willing to take PHP legacy / pure mini‑app outsourcing / pure ops” – treat these as default **no** or red‑flag risk based on this file.
- **How to optimise using this Profile**:
  - When recommending tech stacks, open‑source projects, scaffolds, or second‑development bases:
    - Prefer Kotlin + Spring Boot 3 or TypeScript + Node.js + Next.js.
    - Avoid proactively recommending PHP legacy, JSP, or pure mini‑app outsourcing.
  - When designing learning paths:
    - Treat Rust, AI, and architecture as mid‑/long‑term investment directions.
    - Treat “full‑stack solutions usable for paid gigs” as short‑term priorities.

If your background or preferences change significantly in future, you can revise this file once in a focused pass. Until then, all Skills should treat this file as canonical and avoid re‑interrogating the same basics.**

