# Access Control

Payload provides fine-grained access control at Collection and Field level.

## Collection Access

Collection access may return **boolean** or **query constraint**:

```ts
export const Posts: CollectionConfig = {
  slug: 'posts',
  access: {
    read: ({ req: { user } }) => {
      // Logged-in see all; anonymous see published only
      return user ? true : { _status: { equals: 'published' } }
    },
    create: ({ req: { user } }) => {
      // Only logged-in can create
      return Boolean(user)
    },
    update: ({ req: { user } }) => {
      // Admin or author can update
      if (user?.roles?.includes('admin')) return true
      return { author: { equals: user?.id } }
    },
    delete: ({ req: { user } }) => {
      // Only admin can delete
      return user?.roles?.includes('admin')
    },
  },
}
```

## Field Access

Field access **supports boolean only**, not query constraints:

```ts
{
  name: 'salary',
  type: 'number',
  access: {
    read: ({ req: { user }, doc }) => {
      // Owner or admin only
      return user?.id === doc?.id || user?.roles?.includes('admin')
    },
    update: ({ req: { user } }) => {
      // Admin only
      return user?.roles?.includes('admin')
    },
  },
}
```

## Access Types

### read — Read Access

- **Collection**: boolean or query constraint
- **Field**: boolean
- **Effect**: API queries, Admin Panel visibility

```ts
read: ({ req: { user } }) => {
  if (!user) return { _status: { equals: 'published' } }
  if (user.roles.includes('admin')) return true
  return { author: { equals: user.id } }
}
```

### create — Create Access

- **Collection**: boolean
- **Field**: boolean
- **Effect**: Can create docs, can set field value

```ts
create: ({ req: { user } }) => {
  return user?.roles?.includes('editor') || user?.roles?.includes('admin')
}
```

### update — Update Access

- **Collection**: boolean or query constraint
- **Field**: boolean
- **Effect**: Can update docs, can change field value

```ts
update: ({ req: { user } }) => {
  if (user?.roles?.includes('admin')) return true
  return { author: { equals: user.id } }
}
```

### delete — Delete Access

- **Collection**: boolean or query constraint
- **Field**: N/A
- **Effect**: Can delete docs

```ts
delete: ({ req: { user } }) => {
  return user?.roles?.includes('admin')
}
```

## overrideAccess Scenarios

### User Operations — overrideAccess: false

API routes, Webhooks, user-initiated operations:

```ts
// API Route
export async function GET(req: NextRequest) {
  const user = await getUser(req)
  
  const posts = await payload.find({
    collection: 'posts',
    user,
    overrideAccess: false, // enforce access
  })
  
  return Response.json(posts)
}
```

### System Operations — overrideAccess: true

Cron jobs, system scripts, admin operations:

```ts
// Cron Job
export async function cleanupOldDrafts() {
  await payload.delete({
    collection: 'posts',
    where: {
      _status: { equals: 'draft' },
      createdAt: { less_than: thirtyDaysAgo },
    },
    overrideAccess: true, // bypass access (default)
  })
}
```

## Common Patterns

### Role-Based

```ts
access: {
  read: ({ req: { user } }) => {
    if (!user) return false
    if (user.roles.includes('admin')) return true
    if (user.roles.includes('editor')) return { status: { not_equals: 'archived' } }
    return { author: { equals: user.id } }
  },
}
```

### Ownership-Based

```ts
access: {
  update: ({ req: { user } }) => {
    if (user?.roles?.includes('admin')) return true
    return { author: { equals: user?.id } }
  },
  delete: ({ req: { user } }) => {
    // Admin only
    return user?.roles?.includes('admin')
  },
}
```

### Status-Based

```ts
access: {
  read: ({ req: { user } }) => {
    // Anonymous: published only
    if (!user) return { _status: { equals: 'published' } }
    // Logged-in: all
    return true
  },
}
```

### Combined Conditions

```ts
access: {
  read: ({ req: { user } }) => {
    if (!user) {
      return {
        and: [
          { _status: { equals: 'published' } },
          { visibility: { equals: 'public' } },
        ],
      }
    }
    return true
  },
}
```

## Admin Panel Access

Control Admin Panel visibility:

```ts
admin: {
  hidden: ({ user }) => !user?.roles?.includes('admin'), // hide collection
}

{
  name: 'internalNotes',
  type: 'textarea',
  admin: {
    hidden: ({ user }) => !user?.roles?.includes('admin'), // hide field
  },
}
```

## Custom Access Functions

Extract complex logic:

```ts
// access/isAdminOrAuthor.ts
export const isAdminOrAuthor = ({ req: { user } }) => {
  if (user?.roles?.includes('admin')) return true
  return { author: { equals: user?.id } }
}

// collections/Posts.ts
import { isAdminOrAuthor } from '../access/isAdminOrAuthor'

export const Posts: CollectionConfig = {
  slug: 'posts',
  access: {
    update: isAdminOrAuthor,
    delete: isAdminOrAuthor,
  },
}
```

## Globals Access

Globals support access too:

```ts
export const Settings: GlobalConfig = {
  slug: 'settings',
  access: {
    read: () => true, // everyone can read
    update: ({ req: { user } }) => user?.roles?.includes('admin'), // admin only
  },
}
```

## Debugging Access

Temporarily bypass in development:

```ts
// ⚠️ Debug only; disable in production
access: {
  read: () => true,
  create: () => true,
  update: () => true,
  delete: () => true,
}
```

## Best Practices

1. **Default deny** — Undefined access defaults to deny
2. **Least privilege** — Grant only what’s needed
3. **Separate concerns** — Extract complex logic to functions
4. **Test access** — Cover access scenarios in tests
5. **Use saveToJWT** — Store roles in JWT for quick checks
6. **Field access = boolean** — Never return query constraints from Field access

## Common Mistakes

| Mistake | Cause | Fix |
|:-----|:-----|:---------|
| Access bypassed | Passing `user` without `overrideAccess: false` | Set `overrideAccess: false` |
| Field access ignored | Field access returned query constraint | Field access must return boolean |
| No data access | Access returns false | Check logic and user roles |
| Wrong Admin visibility | `admin.hidden` logic wrong | Verify hidden conditions |
