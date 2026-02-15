# Data Fetching Guide

## Server Components Data Fetching

Directly `await` in components:

```typescript
// app/posts/page.tsx
async function getPosts() {
  const res = await fetch('https://api.example.com/posts')
  return res.json()
}

export default async function PostsPage() {
  const posts = await getPosts()

  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

## Caching Strategies

### fetch Caching

```typescript
// Default: cached (equivalent to SSG)
fetch('https://api.example.com/data')

// No cache (equivalent to SSR)
fetch('https://api.example.com/data', { cache: 'no-store' })

// Timed revalidation (ISR)
fetch('https://api.example.com/data', { next: { revalidate: 60 } })

// Tag-based revalidation
fetch('https://api.example.com/data', { next: { tags: ['posts'] } })
```

### Page-Level Caching

```typescript
// Static generation (default)
export const dynamic = 'auto'

// Force static
export const dynamic = 'force-static'

// Force dynamic
export const dynamic = 'force-dynamic'

// ISR
export const revalidate = 60 // seconds
```

## Revalidation

### Time-Based

```typescript
// Page level
export const revalidate = 60

// fetch level
fetch(url, { next: { revalidate: 60 } })
```

### On-Demand

```typescript
// app/api/revalidate/route.ts
import { revalidatePath, revalidateTag } from 'next/cache'

export async function POST(request: Request) {
  const { path, tag } = await request.json()

  if (path) {
    revalidatePath(path)
  }

  if (tag) {
    revalidateTag(tag)
  }

  return Response.json({ revalidated: true })
}
```

## Parallel Data Fetching

```typescript
export default async function Page() {
  // Parallel fetching
  const [posts, users] = await Promise.all([
    getPosts(),
    getUsers()
  ])

  return (
    <>
      <PostList posts={posts} />
      <UserList users={users} />
    </>
  )
}
```

## Streaming

### Suspense

```typescript
import { Suspense } from 'react'

export default function Page() {
  return (
    <div>
      <h1>Dashboard</h1>
      <Suspense fallback={<Loading />}>
        <SlowComponent />
      </Suspense>
    </div>
  )
}
```

### loading.tsx

```typescript
// app/dashboard/loading.tsx
export default function Loading() {
  return <div>Loading...</div>
}
```

## unstable_cache

Cache non-fetch data:

```typescript
import { unstable_cache } from 'next/cache'

const getCachedUser = unstable_cache(
  async (id: string) => {
    return await db.user.findUnique({ where: { id } })
  },
  ['user'],
  { revalidate: 3600, tags: ['user'] }
)

export default async function Page({ params }: { params: { id: string } }) {
  const user = await getCachedUser(params.id)
  return <Profile user={user} />
}
```

## Client Components Data Fetching

Use SWR or React Query:

```typescript
'use client'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function Profile() {
  const { data, error, isLoading } = useSWR('/api/user', fetcher)

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error</div>

  return <div>Hello {data.name}</div>
}
```

## Best Practices

1. **Prefer Server Components**: Reduces client JS
2. **Parallel fetching**: Use `Promise.all`
3. **Streaming**: Use `Suspense` for better UX
4. **Smart caching**: Choose strategy based on data characteristics
5. **On-demand revalidation**: Proactively refresh on data changes
