# Local API

The Local API lets you work with data on the server without going through HTTP, for better performance.

## Get Payload Instance

```ts
import { getPayload } from 'payload'
import config from '@payload-config'

const payload = await getPayload({ config })
```

## CRUD

### Find

```ts
const { docs, totalDocs, limit, page } = await payload.find({
  collection: 'posts',
  where: { status: { equals: 'published' } },
  depth: 2,
  limit: 10,
  page: 1,
  sort: '-createdAt', // desc; use 'createdAt' for asc
})
```

### Find by ID

```ts
const post = await payload.findByID({
  collection: 'posts',
  id: '123',
  depth: 2,
})
```

### Create

```ts
const newPost = await payload.create({
  collection: 'posts',
  data: {
    title: 'New Post',
    status: 'draft',
  },
})
```

### Update

```ts
const updatedPost = await payload.update({
  collection: 'posts',
  id: '123',
  data: {
    status: 'published',
    publishedAt: new Date(),
  },
})
```

### Delete

```ts
await payload.delete({
  collection: 'posts',
  id: '123',
})
```

### Update Many

```ts
await payload.update({
  collection: 'posts',
  where: { status: { equals: 'draft' } },
  data: { status: 'archived' },
})
```

### Delete Many

```ts
await payload.delete({
  collection: 'posts',
  where: { createdAt: { less_than: oldDate } },
})
```

## Query Operators

### Equality

```ts
{ status: { equals: 'published' } }
{ status: { not_equals: 'draft' } }
```

### Comparison

```ts
{ price: { greater_than: 100 } }
{ price: { greater_than_equal: 100 } }
{ price: { less_than: 1000 } }
{ price: { less_than_equal: 1000 } }
```

### Text

```ts
{ title: { like: 'payload' } }   // contains, case-insensitive
{ title: { contains: 'payload' } } // contains, case-sensitive
```

### Arrays

```ts
{ category: { in: ['tech', 'news'] } }
{ category: { not_in: ['spam'] } }
{ tags: { all: ['featured', 'trending'] } }
```

### Existence

```ts
{ image: { exists: true } }
{ deletedAt: { exists: false } }
```

### Logic

```ts
{
  or: [
    { status: { equals: 'published' } },
    { author: { equals: user.id } },
  ],
}

{
  and: [
    { status: { equals: 'published' } },
    { featured: { equals: true } },
  ],
}
```

### Nested

```ts
// Relation
{
  'author.role': { equals: 'admin' },
}

// Array
{
  'tags.value': { in: ['javascript', 'typescript'] },
}
```

## Depth

`depth` controls how many levels of relations are populated:

```ts
// depth: 0 — ID only
{ author: '123' }

// depth: 1 — one level
{ author: { id: '123', name: 'John' } }

// depth: 2 — two levels
{ author: { id: '123', name: 'John', company: { id: '456', name: 'ACME' } } }
```

## Access & overrideAccess

```ts
// System — bypass (default)
await payload.find({
  collection: 'posts',
  overrideAccess: true,
})

// User — enforce access
await payload.find({
  collection: 'posts',
  user: req.user,
  overrideAccess: false,
})
```

## Globals

```ts
const settings = await payload.findGlobal({
  slug: 'settings',
})

await payload.updateGlobal({
  slug: 'settings',
  data: {
    siteName: 'My Site',
    maintenanceMode: false,
  },
})
```

## Transactions

```ts
const session = await payload.db.beginTransaction()

try {
  await payload.create({
    collection: 'posts',
    data: { title: 'Post 1' },
    req: { ...req, transactionID: session },
  })
  
  await payload.create({
    collection: 'posts',
    data: { title: 'Post 2' },
    req: { ...req, transactionID: session },
  })
  
  await payload.db.commitTransaction(session)
} catch (error) {
  await payload.db.rollbackTransaction(session)
  throw error
}
```

## Common Patterns

### Pagination

```ts
async function getPaginatedPosts(page = 1, limit = 10) {
  return await payload.find({
    collection: 'posts',
    where: { status: { equals: 'published' } },
    limit,
    page,
    sort: '-createdAt',
  })
}
```

### Search

```ts
async function searchPosts(query: string) {
  return await payload.find({
    collection: 'posts',
    where: {
      or: [
        { title: { like: query } },
        { content: { like: query } },
      ],
    },
  })
}
```

### User-Scoped Query

```ts
async function getUserPosts(userId: string) {
  return await payload.find({
    collection: 'posts',
    where: {
      or: [
        { author: { equals: userId } },
        { collaborators: { contains: userId } },
      ],
    },
  })
}
```
