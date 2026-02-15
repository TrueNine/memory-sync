---
name: doc-driven-dev
description: Development spec with .docs/ as single source of truth. Activate when creating projects, developing features, or handling requirement changes.
displayName: Doc-Driven Development
keywords:
  - docs
  - documentation
  - product
  - architecture
  - plan
  - status
  - context
author: TrueNine
version: 2025.12.27
---
## Core Constraints (Primacy)

Doc-driven development uses `.docs/` directory as single source of truth.

**Three Iron Rules**:

1. Docs before code, docs are design
2. Four core docs cover complete lifecycle
3. Code changes must sync docs

**MUST NOT**:

- Skip product context and modify code directly
- Change code without updating docs
- Blindly execute requirements deviating from product positioning

## Directory Structure

```
.docs/
├── 00_Product_Context.md     # Required: what to build, for whom
├── 01_System_Architecture.md # Required: how to build
├── 02_Implementation_Plan.md # Required: how to implement step by step
├── 03_Current_Status.md      # Required: where we are now
├── 04_UI_Design.md           # Optional: design system variables
├── 05_API_Spec.md            # Optional: API contract
├── 06_Database_Design.md     # Optional: data foundation
├── 07_Data_Dictionary.md     # Optional: data glossary
└── 08_Page_Design.md         # Optional: page blueprint
```

## On-Demand Loading

### Core Docs (Required)

- **Writing Product Context** [product.md](core/product.md): product positioning, target users, core features
- **Writing System Architecture** [architecture.md](core/architecture.md): tech stack, module division, dependencies
- **Writing Implementation Plan** [plan.md](core/plan.md): task breakdown, priorities, milestones
- **Writing Current Status** [status.md](core/status.md): progress tracking, blockers, next steps

### Extension Docs (Optional)

- **Choosing Extension Type** [extensions.md](extensions/extensions.md): select UI/API/database docs by project type
- **Writing UI Design** [ui-design.md](extensions/ui-design.md): design system variable spec
- **Writing Page Design** [page-design.md](extensions/page-design.md): page routing and skeleton spec
- **Writing API Spec** [api-spec.md](extensions/api-spec.md): API contract spec
- **Writing Database Design** [database-design.md](extensions/database-design.md): database design spec
- **Writing Data Dictionary** [data-dictionary.md](extensions/data-dictionary.md): data dictionary spec

## Workflow

1. **Start** → Create `00_Product_Context.md`, clarify what to build and for whom
2. **Design** → Write `01_System_Architecture.md`, determine tech stack
3. **Extend** → Add extension docs by project type (refer to extensions.md)
4. **Plan** → Break down `02_Implementation_Plan.md`, step-by-step tasks
5. **Iterate** → Continuously update `03_Current_Status.md` during development
6. **Sync** → Update all related docs after feature completion

## Requirement Change Handling

When user expresses requirement changes ("xxx not needed", "add xxx", "xxx changed"):

1. **Read product positioning first** → Read `00_Product_Context.md`, understand Vision and Core Features
2. **Assess impact** → Judge if change aligns with product positioning
   - Aligned → Continue
   - Conflicting → Inform user, explain reason
   - Uncertain → Ask for confirmation
3. **Update docs** → Sync by impact scope: feature add/remove updates Product → Plan → Status

## Validation Checklist (Recency)

Before and after development **MUST** check:

- [ ] `.docs/` contains four core docs
- [ ] New features update Product Context first
- [ ] Architecture changes sync System Architecture
- [ ] Tasks marked in Plan, progress recorded in Status