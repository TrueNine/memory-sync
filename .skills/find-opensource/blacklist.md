# Open‑Source Selection Blacklist (Negative Filter)

> This file lists repositories, companies, and projects that the user **strongly rejects**. They are **absolutely out of scope**. During search and recommendation you **MUST** read this file and treat its entries as **negative filters**: directly exclude them and never recommend.

## Usage

- When searching on GitHub / Gitee and evaluating candidates, **MUST** check against this blacklist and remove matches.
- If a candidate repo belongs to a blacklisted company / organisation, or is based on / derived from a blacklisted project, you **MUST NOT** recommend it.
- Blacklist priority is higher than all other filters.

---

## Repositories

- Mall4j (`https://www.mall4j.com/`)
  - Scope: All Mall4j open‑source / commercial editions are excluded from the candidate set.
  - Reasons:
    - Publicly marketed as an “open‑source e‑commerce system”, but the real core “commercial” editions (such as the so‑called “Universe Edition”) are very expensive (around 60,000 CNY per set), which severely contradicts the “open‑source” narrative.
    - Tech stack and architecture show clear technical debt and outdated design, not suitable as a long‑term base for evolution and maintenance.
    - Very unfriendly to clients, easily becoming an “onboard once, locked‑in forever” e‑commerce scaffold with risk far outweighing benefit.

- NiuCloud (`https://www.niucloud.com/app/`)
  - Scope: All NiuCloud‑related open‑source repos, scaffolds, templates, and solutions tightly bound to its plugin marketplace are excluded.
  - Reasons:
    - Tightly couples tech stack selection with its own plugin marketplace, easily forcing later evolution into vendor lock‑in and traffic redirection.
    - Code contains large amounts of “defensive / protective” logic, increasing understanding and second‑development cost; bad for long‑term maintenance and ownership.

---

## Companies / Organisations

- Midea Group
  - Scope: Open‑source projects, scaffolds, and technical solutions led or strongly controlled by Midea are not included in the preferred / recommended set.
  - Reasons: Internally promotes “wolf‑culture” and highly exploitative performance / burnout, which conflicts with personal values and collaboration baseline.

- Huawei
  - Scope: Open‑source projects and technical solutions led by Huawei or tightly bound to Huawei’s ecosystem strategy are by default neither recommended nor prioritised.
  - Reasons: Relies heavily on nationalist narratives in brand and tech marketing, tying technical choices to politics / emotion, which is misaligned with rational technical selection and personal values.

- Oracle
  - Scope: Open‑source projects and solutions led by Oracle or heavily binding to its commercial databases, middleware, and cloud are not prioritised.
  - Reasons: Heavy legacy from proprietary history, complex licensing, strong lock‑in; conflicts with a preference for lightweight, self‑controlled open‑source usage.

- IBM
  - Scope: Open‑source projects and solutions led by IBM or strongly tied to IBM Cloud / middleware / enterprise suites are excluded by default.
  - Reasons: Traditional big‑vendor route with heavy legacy and commercial bundling; ecosystem tends towards heavy enterprise solutions, mismatching needs of individuals / small teams using open source.

---

## Open‑Source Projects / Technologies

- Next.js 15
  - Scope: All new projects, scaffolds, and examples based on Next.js 15 are out of scope.
  - Reasons: As a transitional version it carries obvious instability and change risk; unsuitable as a long‑term base for second‑development and maintenance.

- Sa‑Token (`https://sa-token.cc/index.html`)
  - Scope: Generally **not recommended** for regular open‑source selection and self‑hosted projects.
  - Reasons: Community currently lacks a systematic and rigorous automated testing / verification system, making it hard to rely on as a long‑term core dependency.
  - Exception: For **one‑shot, high‑risk outsourcing projects** (“all‑in external gig” scenarios), it may be considered as a backup option after careful risk evaluation.

- Vue 2.x
  - Scope: New projects **MUST NOT** be built on Vue 2.x; only acceptable as passive compatibility for existing legacy projects.
  - Reasons: Officially in long‑term maintenance / legacy mode; ecosystem is moving towards Vue 3. Choosing Vue 2 for new projects amplifies technical debt and migration cost.

- uni‑app 2.x
  - Scope: New projects **MUST NOT** use uni‑app 2.x as a primary framework; for new multi‑platform mini‑app / H5 scenarios, default to more modern stacks.
  - Reasons: Old architecture and ecosystem have clear historical baggage; weak TypeScript and modern tooling support; easily locks projects into an outdated stack.

- HBuilder / stacks strongly tied to HBuilder
  - Scope: Any project or framework that **requires** “HBuilder for development / debug / build” is excluded.
  - Reasons: Development experience and tooling are locked to a single‑vendor IDE, unable to integrate smoothly with general editors and modern pipelines; severely violates the principle of “portable, self‑hostable, sustainable to maintain” technical selection.

