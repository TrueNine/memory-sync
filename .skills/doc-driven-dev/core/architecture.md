## 01_System_Architecture.md

System architecture is the project's "skeleton", defining tech choices and structural design.

### Required Sections

```md
# System Architecture

## Tech Stack
| Layer | Technology |
|-------|------------|
| Frontend | ... |
| Backend | ... |
| Database | ... |

## Data Models
Core entities and relationships.

## API Design
API spec overview.

## File Structure
Project directory tree.

## Dependencies
External dependencies and versions.
```

### Maintenance Rules

- **Create timing**: After Product Context confirmed
- **Update timing**: When tech stack changes, refactoring
- **Prohibited**: Including business logic descriptions

### Example

```md
# System Architecture

## Tech Stack
| Layer | Technology |
|-------|------------|
| Frontend | React 18 + TypeScript |
| Backend | Rust + Axum |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |

## Data Models
\`\`\`
Product
├── id: UUID
├── name: String
├── sku: String (unique)
├── category_id: FK -> Category
└── quantity: i32

Category
├── id: UUID
├── name: String
└── parent_id: FK -> Category (nullable)
\`\`\`

## File Structure
\`\`\`
src/
├── api/          # HTTP handlers
├── domain/       # Business logic
├── infra/        # Database, cache
└── main.rs
\`\`\`

## Dependencies
- axum: 0.7
- sqlx: 0.7
- tokio: 1.35
```
