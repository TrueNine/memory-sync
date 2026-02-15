# Non-PostgreSQL Adaptation

## SQLite

Use case: embedded, local dev

| Feature | PostgreSQL | SQLite |
|---------|------------|--------|
| UUID | native | text |
| timestamp | native | text (ISO 8601) |

```sql
create table example (
  id text primary key,
  name text not null,
  ldf text,
  crd text not null default (datetime('now')),
  mrd text,
  rlv integer not null default 0
);
```

## ClickHouse

Use case: OLAP, log analysis

- Columnar storage, not for frequent updates
- No FK constraints, `rlv` meaningless, can omit
- Use `DateTime64` for time fields

## TiDB

Use case: distributed OLTP

- MySQL-compatible syntax
- Follow this spec with UUIDv7/ULID, avoid auto-increment
