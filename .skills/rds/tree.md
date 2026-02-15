# Tree Structure

Hierarchical data (address, org structure) use `pid` to link parent:

| Field | Type | Description |
|-------|------|-------------|
| `pid` | uuid / char(26) | Parent PK, null = root node |

```sql
create table address (
  id uuid primary key,
  pid uuid references address(id),
  name varchar(255) not null,
  crd timestamp not null default current_timestamp,
  mrd timestamp,
  rlv integer not null default 0
);
```
