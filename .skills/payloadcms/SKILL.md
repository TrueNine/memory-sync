---
name: payloadcms
description: "Payload CMS 3.x development guide: config, collections, Local API, Hooks, access control, security. Activate when building Payload features, editing Schema, writing Hooks, or when the user mentions Payload, Headless CMS, or collections."
displayName: Payload CMS
keywords:
  - payload
  - payloadcms
  - cms
  - headless
  - collections
  - local-api
  - hooks
  - access-control
  - nextjs
author: TrueNine
version: 2026.02.02
---
Payload is a Next.js full-stack framework and code-first CMS with built-in Admin Panel, REST API, and Local API.

**Requirements**: Node 20.9+, Next.js 15+, pnpm recommended, ESM only.

## Core Constraints (Primacy)

### 1. Local API Access Control

**When passing `user`, set `overrideAccess: false`** — otherwise access checks are bypassed.

```ts
// ❌ Wrong: passing user but bypassing access
await payload.find({ collection: 'posts', user: req.user })

// ✅ Correct: enforce access checks
await payload.find({
  collection: 'posts',
  user: req.user,
  overrideAccess: false,
})
```

**When to use**:

- `overrideAccess: false` — API routes, Webhooks, user-initiated operations
- `overrideAccess: true` (default) — Cron jobs, system tasks, admin scripts

### 2. Hooks Transaction Safety

**Nested operations must pass `req`** — otherwise they run outside the same transaction.

```ts
hooks: {
  afterChange: [async ({ doc, req }) => {
    await req.payload.create({
      collection: 'audit-log',
      data: { docId: doc.id },
      req, // required so it runs in the same transaction
    })
  }],
}
```

### 3. Prevent Hooks Infinite Loops

When a Hook triggers the same collection operation, use `context` to flag:

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

## Project Structure

```
src/
├── app/(frontend)/   # Frontend routes
├── app/(payload)/    # Admin routes
├── collections/      # Collection definitions
├── globals/          # Globals config
├── components/       # Admin custom components
├── hooks/            # Hooks
├── access/           # Access control
└── payload.config.ts # Payload config
```

## Config & Quick Reference

### Basic Config

```ts
// payload.config.ts
import { buildConfig } from 'payload'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { fileURLToPath } from 'url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default buildConfig({
  collections: [Users, Media, Posts],
  secret: process.env.PAYLOAD_SECRET,
  db: mongooseAdapter({ url: process.env.DATABASE_URL }),
  editor: lexicalEditor(),
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
```

### Common Commands

```bash
pnpm generate:types     # Generate types after schema changes
pnpm generate:importmap # Update import map after Admin component changes
pnpm payload            # Payload CLI
```

## On-Demand Docs

| Doc                               | Purpose                                              |
| :-------------------------------- | :--------------------------------------------------- |
| [collections.md](collections.md) | Collections, field types, Auth, Media, Drafts        |
| [local-api.md](local-api.md)     | Local API usage, query operators                     |
| [hooks.md](hooks.md)             | Hook types, lifecycle, best practices                |
| [access.md](access.md)           | Collection/Field access, overrideAccess scenarios    |
| [reference.md](reference.md)     | Official docs links, package versions, project rules |

## Verification Checklist (Recency)

After changing Payload code **MUST** check:

1. Local API with `user` has `overrideAccess: false`
2. Hooks nested operations pass `req`
3. Same-collection Hooks use `context` to avoid loops
4. Field access returns boolean only (no query constraints)
5. After schema changes run `generate:types`
6. Draft queries use `draft: true` or `_status` field