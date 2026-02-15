# Audit Fields

All business tables MUST include (except junction tables):

| Field | Full Name | Type | Default | Description |
|-------|-----------|------|---------|-------------|
| `crd` | create row datetime | timestamp | current_timestamp | Creation time |
| `mrd` | modify row datetime | timestamp | null | Last modified time |
| `rlv` | row lock version | integer | 0 | Optimistic lock version |

```sql
create table example (
  id uuid primary key,
  name varchar(255) not null,
  crd timestamp not null default current_timestamp,
  mrd timestamp,
  rlv integer not null default 0
);
```
