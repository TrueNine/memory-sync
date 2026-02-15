# Rendering Modes Guide

## Rendering Modes Comparison

| Mode | Render Time | Use Case |
|:-----|:------------|:---------|
| SSG | Build time | Static content, blogs |
| SSR | Request time | Personalised content, real-time data |
| ISR | Build + timed update | Frequently updated static content |
| Streaming | Request (streamed) | Complex pages, improve TTFB |

## Static Generation (SSG)

Default behaviour, generates HTML at build time:

```typescript
// Default static
export default async function Page() {
  const posts = await getPosts() // Fetched at build time
  return <PostList posts={posts} />
}

// Force static
export const dynamic = 'force-static'
```

### Dynamic Routes Static Generation

```typescript
// app/blog/[slug]/page.tsx
export async function generateStaticParams() {
  const posts = await getPosts()
  return posts.map(post => ({ slug: post.slug }))
}

export default async function Post({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug)
  return <Article post={post} />
}
```

## Server-Side Rendering (SSR)

Renders on each request:

```typescript
// Method 1: Use dynamic
export const dynamic = 'force-dynamic'

// Method 2: Use no-store
async function getData() {
  const res = await fetch(url, { cache: 'no-store' })
  return res.json()
}

// Method 3: Use dynamic functions
import { cookies, headers } from 'next/headers'

export default async function Page() {
  const cookieStore = cookies() // Triggers dynamic rendering
  // ...
}
```

## Incremental Static Regeneration (ISR)

Static generation + timed updates:

```typescript
// Page level
export const revalidate = 60 // Revalidate after 60 seconds

// fetch level
const data = await fetch(url, { next: { revalidate: 60 } })
```

### On-Demand Revalidation

```typescript
// app/api/revalidate/route.ts
import { revalidatePath, revalidateTag } from 'next/cache'

export async function POST(request: Request) {
  const { secret, path, tag } = await request.json()

  if (secret !== process.env.REVALIDATE_SECRET) {
    return Response.json({ error: 'Invalid secret' }, { status: 401 })
  }

  if (path) revalidatePath(path)
  if (tag) revalidateTag(tag)

  return Response.json({ revalidated: true })
}
```

## Streaming

### Using Suspense

```typescript
import { Suspense } from 'react'

export default function Page() {
  return (
    <div>
      <h1>Dashboard</h1>

      {/* Fast content displays first */}
      <Header />

      {/* Slow content streams in */}
      <Suspense fallback={<ChartSkeleton />}>
        <SlowChart />
      </Suspense>

      <Suspense fallback={<TableSkeleton />}>
        <SlowTable />
      </Suspense>
    </div>
  )
}
```

### loading.tsx

```typescript
// app/dashboard/loading.tsx
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-1/4 mb-4" />
      <div className="h-64 bg-gray-200 rounded" />
    </div>
  )
}
```

## Server Components vs Client Components

### Server Components (Default)

```typescript
// ✅ Can directly await
// ✅ Can access backend resources
// ✅ No client bundle increase
// ❌ Cannot use hooks
// ❌ Cannot add event listeners

async function ProductList() {
  const products = await db.product.findMany()
  return (
    <ul>
      {products.map(p => <li key={p.id}>{p.name}</li>)}
    </ul>
  )
}
```

### Client Components

```typescript
'use client'

// ✅ Can use hooks
// ✅ Can add interaction
// ❌ Cannot directly access backend
// ❌ Increases client bundle

import { useState } from 'react'

function Counter() {
  const [count, setCount] = useState(0)
  return (
    <button onClick={() => setCount(c => c + 1)}>
      Count: {count}
    </button>
  )
}
```

### Composition Pattern

```typescript
// Server Component
async function ProductPage({ id }: { id: string }) {
  const product = await getProduct(id)

  return (
    <div>
      <h1>{product.name}</h1>
      <p>{product.description}</p>
      {/* Client Component handles interaction */}
      <AddToCartButton productId={id} />
    </div>
  )
}

// Client Component
'use client'
function AddToCartButton({ productId }: { productId: string }) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    await addToCart(productId)
    setLoading(false)
  }

  return (
    <button onClick={handleClick} disabled={loading}>
      {loading ? 'Adding...' : 'Add to Cart'}
    </button>
  )
}
```

## Selection Guide

| Scenario | Recommended Mode |
|:---------|:-----------------|
| Blog, docs | SSG |
| E-commerce product pages | ISR |
| User dashboard | SSR + Streaming |
| Real-time data | SSR |
| Static marketing pages | SSG |
