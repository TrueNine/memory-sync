---
name: rds
description: Relational database design spec with PostgreSQL as de facto standard. Use when designing tables, writing SQL, naming fields, or creating seed data.
displayName: RDS Database
keywords:
  - database
  - postgresql
  - postgres
  - sql
  - schema
  - table
  - primary-key
  - foreign-key
  - audit
  - seed
  - migration
  - rds
author: TrueNine
version: 2025.12.27
---
## Primacy

- **PostgreSQL** as de facto standard, all examples in PostgreSQL syntax
- **MUST** use foreign key constraints for data integrity
- SQL code all **lowercase**, **no comments**
- Primary key: **uuid + UUIDv7** or **char(26) + ULID**, **PROHIBIT** auto-increment and snowflake

## On-Demand

- **Create table, define PK** [primary-key.md](primary-key.md): uuid/char(26), UUIDv7/ULID
- **Business table, track changes** [audit.md](audit.md): crd/mrd/rlv fields
- **Soft delete** [soft-delete.md](soft-delete.md): ldf field, timestamp type
- **Many-to-many** [junction-table.md](junction-table.md): junction table, no PK no audit
- **Tree structure** [tree.md](tree.md): pid links parent
- **Seed data** [seed.md](seed.md): fixed UUID, segment by domain
- **Non-PostgreSQL** [others.md](others.md): SQLite/ClickHouse/TiDB adaptation

## Recency

- [ ] PK uses uuid/char(26), not auto-increment
- [ ] Business tables include crd/mrd/rlv audit fields
- [ ] Foreign key constraints defined
- [ ] SQL all lowercase, no comments