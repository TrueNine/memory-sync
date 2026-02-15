# Soft Delete

| Field | Full Name | Type | Default | Description |
|-------|-----------|------|---------|-------------|
| `ldf` | logic delete field | timestamp | null | null = not deleted |

**Design points**:
- timestamp not boolean, records deletion time
- Query needs `where ldf is null`

```sql
create table example (
  id uuid primary key,
  name varchar(255) not null,
  ldf timestamp,
  crd timestamp not null default current_timestamp,
  mrd timestamp,
  rlv integer not null default 0
);

-- soft delete
update example set ldf = current_timestamp where id = '...';

-- query active data
select * from example where ldf is null;
```
