# App Router Routing Guide

## File-System Routing

```
app/
├── page.tsx              # /
├── about/page.tsx        # /about
├── blog/
│   ├── page.tsx          # /blog
│   └── [slug]/page.tsx   # /blog/:slug
├── shop/
│   └── [...slug]/page.tsx # /shop/* (catch-all)
└── (marketing)/          # Route group (no URL impact)
    ├── about/page.tsx    # /about
    └── contact/page.tsx  # /contact
```

## Special Files

| File | Purpose |
|:-----|:--------|
| `page.tsx` | Page component |
| `layout.tsx` | Layout (nested) |
| `loading.tsx` | Loading state |
| `error.tsx` | Error boundary |
| `not-found.tsx` | 404 page |
| `template.tsx` | Template (re-renders on navigation) |
| `default.tsx` | Parallel route default |

## Dynamic Routes

### Single Parameter

```typescript
// app/blog/[slug]/page.tsx
export default function Post({ params }: { params: { slug: string } }) {
  return <h1>Post: {params.slug}</h1>
}
```

### Multiple Parameters

```typescript
// app/shop/[category]/[id]/page.tsx
export default function Product({
  params
}: {
  params: { category: string; id: string }
}) {
  return <h1>{params.category} - {params.id}</h1>
}
```

### Catch-all

```typescript
// app/docs/[...slug]/page.tsx
// /docs/a -> { slug: ['a'] }
// /docs/a/b/c -> { slug: ['a', 'b', 'c'] }
export default function Docs({ params }: { params: { slug: string[] } }) {
  return <h1>Path: {params.slug.join('/')}</h1>
}
```

### Optional Catch-all

```typescript
// app/docs/[[...slug]]/page.tsx
// /docs -> { slug: undefined }
// /docs/a -> { slug: ['a'] }
```

## Route Groups

No URL impact, for code organisation:

```
app/
├── (marketing)/
│   ├── layout.tsx        # Shared layout for marketing pages
│   ├── about/page.tsx    # /about
│   └── contact/page.tsx  # /contact
├── (shop)/
│   ├── layout.tsx        # Shared layout for shop pages
│   ├── cart/page.tsx     # /cart
│   └── checkout/page.tsx # /checkout
└── layout.tsx            # Root layout
```

## Parallel Routes

Render multiple pages simultaneously:

```
app/
├── @modal/
│   ├── default.tsx
│   └── login/page.tsx
├── @sidebar/
│   ├── default.tsx
│   └── page.tsx
├── layout.tsx
└── page.tsx
```

```typescript
// app/layout.tsx
export default function Layout({
  children,
  modal,
  sidebar
}: {
  children: React.ReactNode
  modal: React.ReactNode
  sidebar: React.ReactNode
}) {
  return (
    <div>
      {sidebar}
      {children}
      {modal}
    </div>
  )
}
```

## Intercepting Routes

Display other routes within current layout:

```
app/
├── feed/
│   └── page.tsx
├── photo/[id]/
│   └── page.tsx          # Direct access /photo/1
├── @modal/
│   └── (.)photo/[id]/    # Intercept when clicking from feed
│       └── page.tsx
└── layout.tsx
```

Interception rules:
- `(.)` - Same level
- `(..)` - One level up
- `(..)(..)` - Two levels up
- `(...)` - Root

## Navigation

### Link Component

```typescript
import Link from 'next/link'

// Basic
<Link href="/about">About</Link>

// Dynamic route
<Link href={`/blog/${post.slug}`}>Read More</Link>

// Prefetch (enabled by default)
<Link href="/about" prefetch={false}>About</Link>

// Replace history
<Link href="/about" replace>About</Link>
```

### useRouter

```typescript
'use client'
import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()

  return (
    <button onClick={() => router.push('/dashboard')}>
      Go to Dashboard
    </button>
  )
}

// Methods
router.push('/path')      // Navigate
router.replace('/path')   // Replace
router.refresh()          // Refresh current route
router.back()             // Back
router.forward()          // Forward
```

### redirect

```typescript
import { redirect } from 'next/navigation'

export default async function Page() {
  const user = await getUser()

  if (!user) {
    redirect('/login')
  }

  return <Dashboard user={user} />
}
```

## Static Generation Parameters

```typescript
// app/blog/[slug]/page.tsx
export async function generateStaticParams() {
  const posts = await getPosts()

  return posts.map((post) => ({
    slug: post.slug,
  }))
}
```
