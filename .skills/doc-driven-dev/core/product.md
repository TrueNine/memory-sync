## 00_Product_Context.md

Product context is the project's "brain", defining core value and boundaries.

### Required Sections

```md
# Product Context

## Vision
One sentence describing product vision.

## Target Users
- Primary user groups
- User pain points and needs

## Core Features
- [ ] Feature A: brief description
- [ ] Feature B: brief description

## Business Rules
- Rule 1: description
- Rule 2: description

## Out of Scope
Clarify what NOT to do, avoid scope creep.
```

### Maintenance Rules

- **Create timing**: First thing when project starts
- **Update timing**: When requirements change, features added/removed
- **Prohibited**: Including technical implementation details

### Example

```md
# Product Context

## Vision
Provide simple and easy-to-use inventory management system for SMEs.

## Target Users
- Warehouse managers: daily stock in/out operations
- Shop owners: inventory queries and reports

## Core Features
- [ ] Product management: CRUD, categories, SKU
- [ ] Stock in/out: scanning, batch, approval workflow
- [ ] Reports: inventory alerts, turnover rate

## Business Rules
- Inventory cannot be negative
- Stock out requires approval (amount > 1000)

## Out of Scope
- Financial reconciliation
- Supplier management
```
