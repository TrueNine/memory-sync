---
name: nextjs
description: Next.js app development guide covering App Router, Server Components, data fetching, deployment. Activate when developing Next.js apps.
displayName: Next.js Development
keywords:
  - nextjs
  - react
  - app-router
  - server-components
  - ssr
  - ssg
  - isr
  - api-routes
  - middleware
  - deployment
author: TrueNine
version: 2026.01.01
---
Next.js is the de facto standard for React full-stack frameworks. App Router is the current recommended architecture.

## Core Concepts

| Concept           | Description                                    |
| :---------------- | :--------------------------------------------- |
| App Router        | File-system based routing (`app/` directory)   |
| Server Components | Render on server by default, reduces client JS |
| Client Components | Use `'use client'` when interaction needed     |
| Server Actions    | Server functions, replaces API Routes          |
| Middleware        | Request interceptor running at edge            |

## Core Constraints (Primacy)

**Architecture Principles**:

- Default to Server Components, use Client Components only when interaction needed
- Prefer Server Actions over API Routes
- Data fetching directly `await` in Server Components
- Use `loading.tsx` and `error.tsx` for loading and error states

**Prohibited Behaviours**:

- Do NOT use `useState`, `useEffect` in Server Components
- Do NOT abuse `'use client'`, it increases client bundle
- Do NOT fetch data directly in Client Components (use Server Actions)
- Do NOT ignore `metadata` export (critical for SEO)

## On-Demand Loading

| Document                                | Purpose                                  |
| :-------------------------------------- | :--------------------------------------- |
| [routing.md](routing.md)               | App Router, dynamic routes, route groups |
| [data-fetching.md](data-fetching.md)   | Data fetching, caching, revalidation     |
| [rendering.md](rendering.md)           | SSR, SSG, ISR, Streaming                 |
| [server-actions.md](server-actions.md) | Form handling, data mutations            |
| [optimization.md](optimization.md)     | Image, font, script optimisation         |
| [deployment.md](deployment.md)         | Vercel, Cloudflare, self-hosting         |

## Project Structure

```
app/
├── layout.tsx          # Root layout
├── page.tsx            # Home page
├── loading.tsx         # Loading state
├── error.tsx           # Error boundary
├── not-found.tsx       # 404 page
├── (auth)/             # Route group (no URL impact)
│   ├── login/page.tsx
│   └── register/page.tsx
├── dashboard/
│   ├── layout.tsx      # Nested layout
│   └── page.tsx
└── api/                # API Routes (optional)
    └── webhook/route.ts
```

## Quick Start

```bash
# Create project (pnpm recommended)
pnpm create next-app@latest my-app

# Recommended options
# ✅ TypeScript
# ✅ ESLint
# ✅ Tailwind CSS
# ✅ App Router
# ❌ src/ directory (keep it simple)
# ✅ Import alias (@/*)

# Development
pnpm dev

# Build
pnpm build

# Production
pnpm start
```

## Server Components vs Client Components

```tsx
// Server Component (default)
// ✅ Can directly await data
// ✅ Can access backend resources
// ❌ Cannot use hooks
async function ProductList() {
  const products = await db.product.findMany()
  return <ul>{products.map(p => <li key={p.id}>{p.name}</li>)}</ul>
}

// Client Component
// ✅ Can use hooks
// ✅ Can add interaction
// ❌ Cannot directly access backend
'use client'
function Counter() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>
}
```

## Server Actions

```tsx
// app/actions.ts
'use server'

export async function createPost(formData: FormData) {
  const title = formData.get('title') as string
  await db.post.create({ data: { title } })
  revalidatePath('/posts')
}

// app/posts/new/page.tsx
import { createPost } from '@/app/actions'

export default function NewPost() {
  return (
    <form action={createPost}>
      <input name="title" required />
      <button type="submit">Create</button>
    </form>
  )
}
```

## Validation Checklist (Recency)

**MUST** check during development:

1. Default to Server Components
2. `'use client'` only for interactive components
3. Data fetching on server side
4. Export `metadata` for SEO
5. Use `loading.tsx` and `error.tsx`
6. Images use `next/image`
7. Links use `next/link`