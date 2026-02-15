# Seed Data

Init data (roles, permissions, configs) use fixed IDs, not database-generated.

## ID Format

```
00000000-0000-0000-0000-{12-digit sequence}
```

| Domain | Range | Example |
|--------|-------|---------|
| Role | 000000000001 - 099 | `00000000-0000-0000-0000-000000000001` |
| Permission | 000000000100 - 199 | `00000000-0000-0000-0000-000000000100` |
| System config | 000000000200 - 299 | `00000000-0000-0000-0000-000000000200` |
| Dict type | 000000000300 - 399 | `00000000-0000-0000-0000-000000000300` |

## Code Constants

```typescript
export const SEED_ID = {
  ROLE_ADMIN: '00000000-0000-0000-0000-000000000001',
  ROLE_USER: '00000000-0000-0000-0000-000000000002',
  PERM_READ: '00000000-0000-0000-0000-000000000100',
} as const
```

```sql
insert into role (id, name, crd, rlv) values
  ('00000000-0000-0000-0000-000000000001', 'admin', current_timestamp, 0),
  ('00000000-0000-0000-0000-000000000002', 'user', current_timestamp, 0);
```
