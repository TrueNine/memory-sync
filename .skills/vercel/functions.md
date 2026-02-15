# Serverless and Edge Functions

## Two Functions Comparison

| Feature | Serverless Functions | Edge Functions |
|:--------|:---------------------|:---------------|
| Runtime | Node.js | V8 Isolates |
| Cold Start | Slower (~250ms) | Very fast (~0ms) |
| Timeout | 10s (Hobby) / 60s (Pro) | 30s |
| Memory | 1024MB | 128MB |
| Region | Single region | Global edge |
| API | Full Node.js | Web APIs |
| Free Quota | 100GB-Hrs/month | 500k/month |

## Serverless Functions

### Basic Usage

```typescript
// app/api/hello/route.ts (App Router)
export async function GET(request: Request) {
  return Response.json({ message: 'Hello' })
}

export async function POST(request: Request) {
  const body = await request.json()
  return Response.json({ received: body })
}
```

### Configuration

```typescript
// Configure runtime
export const runtime = 'nodejs' // default
export const maxDuration = 10 // seconds
export const dynamic = 'force-dynamic' // disable cache
```

### Access Environment Variables

```typescript
export async function GET() {
  const apiKey = process.env.API_KEY
  // ...
}
```

## Edge Functions

### Basic Usage

```typescript
// app/api/edge/route.ts
export const runtime = 'edge'

export async function GET(request: Request) {
  return Response.json({
    message: 'Hello from Edge',
    region: process.env.VERCEL_REGION
  })
}
```

### Middleware (Runs on Edge)

```typescript
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Redirect
  if (request.nextUrl.pathname === '/old') {
    return NextResponse.redirect(new URL('/new', request.url))
  }

  // Rewrite
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.rewrite(new URL('/api/proxy', request.url))
  }

  // Add header
  const response = NextResponse.next()
  response.headers.set('x-custom-header', 'value')
  return response
}

export const config = {
  matcher: ['/old', '/api/:path*']
}
```

### Edge Limitations

Unsupported Node.js APIs:
- `fs` filesystem
- `child_process` subprocesses
- Native modules

Supported APIs:
- `fetch`
- `crypto`
- `TextEncoder/TextDecoder`
- `URL/URLSearchParams`
- `Headers/Request/Response`

## Selection Guide

| Scenario | Recommended |
|:---------|:------------|
| Simple API | Edge Functions |
| Need Node.js libs | Serverless Functions |
| Global low latency | Edge Functions |
| Complex computation | Serverless Functions |
| Auth/redirects | Middleware (Edge) |

## Free Quota Optimisation

### Serverless Functions

100GB-Hrs/month calculation:
- 1GB memory running 1 hour = 1GB-Hr
- 512MB memory running 2 hours = 1GB-Hr

Optimisation strategies:
1. Reduce memory config (default 1024MB)
2. Reduce execution time
3. Use caching to reduce calls

### Edge Functions

500k/month, optimisation strategies:
1. Use `stale-while-revalidate` caching
2. Merge requests
3. Static content via CDN

## Example: API Proxy

```typescript
// app/api/proxy/route.ts
export const runtime = 'edge'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const target = searchParams.get('url')

  if (!target) {
    return Response.json({ error: 'Missing url' }, { status: 400 })
  }

  const response = await fetch(target)
  const data = await response.json()

  return Response.json(data, {
    headers: {
      'Cache-Control': 's-maxage=60, stale-while-revalidate=300'
    }
  })
}
```
