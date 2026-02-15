# Hooks

Hooks run at specific points in the data lifecycle for validation, transformation, and side effects.

## Hook Types

### Collection Hooks

```ts
export const Posts: CollectionConfig = {
  slug: 'posts',
  hooks: {
    beforeValidate: [],
    beforeChange: [],
    afterChange: [],
    beforeRead: [],
    afterRead: [],
    beforeDelete: [],
    afterDelete: [],
  },
}
```

### Field Hooks

```ts
{
  name: 'slug',
  type: 'text',
  hooks: {
    beforeValidate: [],
    beforeChange: [],
    afterRead: [],
  },
}
```

## Lifecycle Order

**Create/Update**:
1. `beforeValidate` — before validation, can modify data
2. Validation
3. `beforeChange` — before save, can modify data
4. Save to DB
5. `afterChange` — after save, for side effects

**Read**:
1. Read from DB
2. `beforeRead` — before return, can modify doc
3. `afterRead` — after return, can modify doc

**Delete**:
1. `beforeDelete` — before delete, can block
2. Delete from DB
3. `afterDelete` — after delete, e.g. cleanup

## Common Scenarios

### beforeValidate — Preprocess Data

```ts
hooks: {
  beforeValidate: [async ({ data, operation }) => {
    // Auto slug
    if (operation === 'create' && !data.slug) {
      data.slug = slugify(data.title)
    }
    return data
  }],
}
```

### beforeChange — Modify Before Save

```ts
hooks: {
  beforeChange: [async ({ data, operation, req }) => {
    // Set publish time
    if (operation === 'update' && data.status === 'published' && !data.publishedAt) {
      data.publishedAt = new Date()
    }
    
    if (operation === 'create') {
      data.author = req.user.id
    }
    
    return data
  }],
}
```

### afterChange — Side Effects

```ts
hooks: {
  afterChange: [async ({ doc, previousDoc, operation, req }) => {
    // Audit log
    await req.payload.create({
      collection: 'audit-log',
      data: {
        collection: 'posts',
        docId: doc.id,
        operation,
        userId: req.user?.id,
      },
      req, // pass req so it runs in same transaction
    })
    
    return doc
  }],
}
```

### beforeDelete — Block Delete

```ts
hooks: {
  beforeDelete: [async ({ req, id }) => {
    const relatedDocs = await req.payload.find({
      collection: 'comments',
      where: { post: { equals: id } },
      limit: 1,
    })
    
    if (relatedDocs.totalDocs > 0) {
      throw new Error('Cannot delete post with comments')
    }
  }],
}
```

### afterDelete — Cleanup Related Data

```ts
hooks: {
  afterDelete: [async ({ doc, req }) => {
    await req.payload.delete({
      collection: 'comments',
      where: { post: { equals: doc.id } },
      req,
    })
  }],
}
```

## Transaction Safety (Critical)

**Nested operations must pass `req`** or they are not in the same transaction:

```ts
// ❌ Wrong — not in same transaction
hooks: {
  afterChange: [async ({ doc }) => {
    await payload.create({
      collection: 'audit-log',
      data: { docId: doc.id },
    })
  }],
}

// ✅ Correct — same transaction
hooks: {
  afterChange: [async ({ doc, req }) => {
    await req.payload.create({
      collection: 'audit-log',
      data: { docId: doc.id },
      req, // required
    })
  }],
}
```

## Prevent Infinite Loops (Critical)

When a Hook triggers the same collection, use `context`:

```ts
hooks: {
  afterChange: [async ({ doc, req, context }) => {
    if (context.skipHooks) return
    
    await req.payload.update({
      collection: 'posts',
      id: doc.id,
      data: { views: doc.views + 1 },
      context: { skipHooks: true },
      req,
    })
  }],
}
```

## Field Hooks

Field Hooks apply to a single field:

```ts
{
  name: 'fullName',
  type: 'text',
  hooks: {
    beforeChange: [async ({ value, siblingData }) => {
      return `${siblingData.firstName} ${siblingData.lastName}`
    }],
    afterRead: [async ({ value }) => {
      return value?.toUpperCase()
    }],
  },
}
```

## Hook Context

Hooks receive rich context:

```ts
hooks: {
  afterChange: [async ({
    data,           // new data (beforeChange can modify)
    doc,            // saved doc (afterChange)
    previousDoc,    // previous doc (afterChange)
    operation,      // 'create' | 'update'
    req,
    context,
  }) => {
    // ...
  }],
}
```

## Global Hooks

Define in `payload.config.ts`:

```ts
export default buildConfig({
  hooks: {
    afterChange: [async ({ doc, req, collection }) => {
      console.log(`${collection.slug} changed:`, doc.id)
    }],
  },
})
```

## Best Practices

1. **Keep Hooks simple** — Extract complex logic
2. **Avoid blocking work** — Use queues for heavy tasks
3. **Pass `req`** — So nested ops share the transaction
4. **Use `context`** — Avoid loops and pass custom data
5. **Error handling** — Throwing in a Hook stops the operation
6. **Don’t overuse** — Prefer validation and defaults where possible

## Common Mistakes

| Mistake | Cause | Fix |
|:-----|:-----|:---------|
| Nested op not in transaction | Not passing `req` | Pass `req` |
| Hook loop | Same-collection op | Use `context.skipHooks` |
| Operation blocked | Hook throws | Check Hook logic |
| Data not updated | beforeChange didn’t return data | Return modified data |
