# Junction Table

Many-to-many junction tables:

- **No primary key**, **no audit fields**
- Only two foreign keys

```sql
create table user_role (
  user_id uuid not null references "user"(id),
  role_id uuid not null references role(id)
);
```
