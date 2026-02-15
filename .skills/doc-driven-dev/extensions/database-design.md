## 06_Database_Design.md

Database design is the project's "foundation", recording data storage decisions and structure for this project.

### Positioning

**What it is**: Project-level database decisions and entity structure records.

**What it's not**: Does not include general design principles, naming conventions, timestamp formats, etc. (delegate to dedicated convention skill).

### Applicable Scenarios

- Backend API services
- Full-stack apps
- Microservices
- Data-intensive projects

### Required Sections

```md
# Database Design

## Tech Choice
Database selection and rationale.

## Entity Overview
Entity list and brief descriptions.

## ER Diagram
Entity relationship diagram.

## Table Definitions
Table structure definitions.

## Index Strategy
Index design overview.

## Migration Tool
Migration tool selection.
```

### Maintenance Rules

- **Create timing**: After Architecture confirmed
- **Update timing**: When adding entities, table structure changes
- **Prohibited**: Recording general design specs (should be in convention skill)

### Example

```md
# Database Design

## Tech Choice

| Type | Choice | Reason |
|------|--------|--------|
| Primary | PostgreSQL 16 | ACID, JSON support, mature and stable |
| Cache | Redis 7 | Session, hot data caching |

## Entity Overview

| Entity | Description |
|--------|-------------|
| Product | Product main table |
| Category | Product category, supports multi-level |
| StockRecord | Inventory change records |
| User | User accounts |

## ER Diagram

\`\`\`
Category 1──n Product 1──n StockRecord
                │
User ───────────┘ (operator)
\`\`\`

## Table Definitions

### Product

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| name | VARCHAR(200) | NOT NULL | Product name |
| sku | VARCHAR(50) | UNIQUE, NOT NULL | Stock keeping unit |
| category_id | UUID | FK -> Category | Category |
| quantity | INT | NOT NULL, >= 0 | Current stock |
| created_at | TIMESTAMPTZ | NOT NULL | Created time |
| updated_at | TIMESTAMPTZ | NOT NULL | Updated time |

### Category

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| name | VARCHAR(100) | NOT NULL | Category name |
| parent_id | UUID | FK -> Category, NULL | Parent category |

### StockRecord

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| product_id | UUID | FK -> Product | Related product |
| type | VARCHAR(20) | NOT NULL | IN/OUT/ADJUST |
| quantity | INT | NOT NULL | Change quantity |
| operator_id | UUID | FK -> User | Operator |
| created_at | TIMESTAMPTZ | NOT NULL | Created time |

## Index Strategy

| Table | Columns | Type | Purpose |
|-------|---------|------|---------|
| Product | sku | UNIQUE | SKU lookup |
| Product | category_id | BTREE | Category filter |
| StockRecord | product_id, created_at | BTREE | Product stock history |

## Migration Tool

Prisma Migrate / Drizzle Kit / SQLx Migrate (choose based on tech stack)
```
