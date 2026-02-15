---
name: opensource
description: Open-source project practice guide covering licence selection, platform publishing, community operations and contributor management. Activate when creating open-source projects, choosing licences, publishing to platforms, or managing communities.
displayName: Open Source Guide
keywords:
  - opensource
  - license
  - github
  - contributing
  - community
  - repository
  - publish
author: TrueNine
version: 2026.02.10
---
## Core Constraints (Primacy)

1. **Licence first**: Every open-source project must decide its licence before publishing code; no licence = all rights reserved
2. **SPDX identifiers**: Always reference licences via [SPDX](https://spdx.org/licenses/) standard identifiers (e.g. `MIT`, `Apache-2.0`, `AGPL-3.0-only`)
3. **LICENSE file**: Project root must contain `LICENSE` or `LICENSE.txt` with the full licence text
4. **Copyright notice**: Each LICENSE file must begin with `Copyright (c) <year> <holder>`
5. **package.json alignment**: The `license` field must match the LICENSE file, using SPDX identifiers
6. **No mixing**: A single project may have only one primary licence; for multi-licence scenarios use SPDX expressions (e.g. `MIT OR Apache-2.0`)

---

## License Selection

Choose a licence by goal; ★ marks the default recommendation:

| Goal              | License         | Copyleft    | Commercial Use | Key Trait                              |
| :---------------- | :-------------- | :---------- | :------------- | :------------------------------------- |
| Maximum freedom   | MIT ★           | ❌           | ✅              | Nearly unrestricted, most popular      |
| Patent protection | Apache-2.0      | ❌           | ✅              | Explicit patent grant                  |
| Strong copyleft   | GPL-3.0-only    | ✅ Strong    | ✅              | Derivatives must be open-sourced       |
| Library isolation | LGPL-2.1-only   | ✅ Weak      | ✅              | Dynamic linking may remain closed      |
| SaaS copyleft     | AGPL-3.0-only ★ | ✅ Strongest | ✅              | Network services must also open-source |
| Waive everything  | Unlicense       | ❌           | ✅              | Public domain, no restrictions         |

**Indie dev anti-freeloading recommendation**: AGPL-3.0 + CLA dual-licence model

- AGPL-3.0 as default: community uses free; commercial closed-source requires a paid licence
- CLA (Contributor License Agreement): contributors assign copyright to you, preserving dual-licence rights
- Reference cases: MongoDB (SSPL), Grafana (AGPL), Nextcloud (AGPL)

---

## Repository Setup

Essential files in an open-source project root:

| File                 | Required    | Description                              |
| :------------------- | :---------- | :--------------------------------------- |
| `LICENSE`            | ✅           | Full licence text                        |
| `README.md`          | ✅           | Project intro, installation, usage       |
| `CONTRIBUTING.md`    | Recommended | Contribution guide                       |
| `CODE_OF_CONDUCT.md` | Recommended | Code of conduct                          |
| `CHANGELOG.md`       | Recommended | Change log                               |
| `.gitignore`         | ✅           | Git ignore rules                         |
| `SECURITY.md`        | Recommended | Security vulnerability reporting process |

---

## Platform Publishing

| Platform | Audience           | Recommendation                            |
| :------- | :----------------- | :---------------------------------------- |
| GitHub   | Global developers  | ★ First choice, richest ecosystem         |
| GitLab   | Self-hosted needs  | Built-in CI/CD, suits private deployments |
| Gitee    | Chinese developers | Fast domestic access, strict review       |
| Codeberg | Privacy-first      | Non-profit, no tracking                   |

**GitHub publish checklist**:

1. Create repository — fill in Description and Topics
2. Add LICENSE, README, CONTRIBUTING
3. Configure Issues / Discussions templates
4. Set Branch Protection Rules
5. Create first Release (semantic versioning)

---

## Community Management

**Issue management**:

- Label categories: `bug`, `feature`, `question`, `good first issue`
- Separate templates for Bug Report and Feature Request
- Respond promptly, even if only to acknowledge receipt

**Pull Request workflow**:

- PR template includes: change description, linked Issue, test notes
- Require CI pass before merge
- Squash Merge to keep commit history clean

**Contributor incentives**:

- Display Contributors list in README
- Follow the [All Contributors](https://allcontributors.org/) spec
- Welcome first-time contributors warmly

---

## On-Demand Loading

After choosing a licence, copy the corresponding file content to the project root `LICENSE`:

| License          | File                                              |
| :--------------- | :------------------------------------------------ |
| MIT              | [mit.txt](licenses/mit.txt)                       |
| Apache-2.0       | [apache-2.0.txt](licenses/apache-2.0.txt)         |
| GPL-3.0          | [gpl-3.0.txt](licenses/gpl-3.0.txt)               |
| LGPL-2.1         | [lgpl-2.1.txt](licenses/lgpl-2.1.txt)             |
| AGPL-3.0         | [agpl-3.0.txt](licenses/agpl-3.0.txt)             |
| Unlicense        | [unlicense.txt](licenses/unlicense.txt)           |
| CLA (Individual) | [cla-individual.txt](licenses/cla-individual.txt) |

---

## Validation Checklist (Recency)

- [ ] Project root contains a LICENSE file
- [ ] LICENSE content matches the package.json `license` field
- [ ] Uses SPDX standard identifiers
- [ ] README includes a License section with the licence name
- [ ] Copyright notice includes year and holder
- [ ] No incompatible licences mixed