# Primary Key

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid / char(26) | PK, required for all business tables |

## Generation Strategy

| Strategy | Status | Description |
|----------|--------|-------------|
| UUIDv7 | **Recommended** | Time-ordered, PostgreSQL native uuid type |
| ULID | Alternative | String form, cross-database compatible |
| Snowflake | **PROHIBIT** | Requires centralised generator |
| Auto-increment | **PROHIBIT** | Distributed-unfriendly, exposes volume |

## Type Selection

- **uuid + UUIDv7**: PostgreSQL native, 16 bytes, efficient indexing
- **char(26) + ULID**: String readable, cross-database compatible

```sql
-- uuid type (recommended)
create table example (
  id uuid primary key,
  name varchar(255) not null
);

-- char(26) type (alternative)
create table example (
  id char(26) primary key,
  name varchar(255) not null
);
```
