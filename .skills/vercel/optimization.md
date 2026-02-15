# Performance Optimisation Guide

## Reduce Bandwidth Consumption

### 1. Externalise Static Assets

```typescript
// Redirect large files to R2
// middleware.ts
import { NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Videos, large images via R2
  if (pathname.match(/\.(mp4|webm|mov|png|jpg|gif)$/i)) {
    return NextResponse.redirect(
      `https://cdn.your-domain.com${pathname}`
    )
  }
}
```

### 2. Image Optimisation

```typescript
// Use external image service
// next.config.js
module.exports = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.your-domain.com' }
    ],
    // Or completely disable Vercel image optimisation
    unoptimized: true
  }
}
```

### 3. Compress Responses

```typescript
// API response compression
export async function GET() {
  const data = await fetchLargeData()

  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip' // Vercel handles automatically
    }
  })
}
```

## Reduce Function Execution Time

### 1. Use Edge Functions

```typescript
// Simple APIs use Edge
export const runtime = 'edge'

export async function GET() {
  return Response.json({ time: Date.now() })
}
```

### 2. Caching Strategy

```typescript
// ISR caching
export const revalidate = 60 // 60s revalidation

// API caching
return Response.json(data, {
  headers: {
    'Cache-Control': 's-maxage=60, stale-while-revalidate=300'
  }
})
```

### 3. Reduce Cold Starts

```typescript
// Reduce dependencies
// Import only needed modules
import { specific } from 'large-library/specific'

// Instead of
import { specific } from 'large-library'
```

## Reduce Build Time

### 1. Turborepo Incremental Builds

```json
// turbo.json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    }
  }
}
```

### 2. Cache Dependencies

```yaml
# vercel.json
{
  "installCommand": "pnpm install --frozen-lockfile"
}
```

### 3. Skip Unnecessary Builds

```bash
# vercel.json - ignore certain file changes
{
  "ignoreCommand": "git diff --quiet HEAD^ HEAD -- ./src"
}
```

## Caching Strategies

### Page Caching

```typescript
// app/page.tsx
export const revalidate = 3600 // 1 hour

// Or dynamic control
export const dynamic = 'force-static'
```

### API Caching

```typescript
// Use unstable_cache
import { unstable_cache } from 'next/cache'

const getCachedData = unstable_cache(
  async () => {
    return await fetchData()
  },
  ['data-key'],
  { revalidate: 3600 }
)
```

### Edge Config (Hot Config)

```typescript
// Update config without redeployment
import { get } from '@vercel/edge-config'

export const runtime = 'edge'

export async function GET() {
  const feature = await get('feature_flag')
  return Response.json({ feature })
}
```

## Monitoring and Debugging

### View Function Logs

```bash
vercel logs --follow
```

### Analyse Build

```bash
# View build details
vercel inspect <deployment-url>
```

### Performance Analysis

Dashboard → Project → Analytics:
- Core Web Vitals
- Function execution time
- Error rate

## Best Practices Checklist

1. ✅ Store large files in external storage
2. ✅ Use Edge Functions for simple APIs
3. ✅ Set reasonable caching strategies
4. ✅ Use incremental builds
5. ✅ Monitor usage, optimise promptly
6. ✅ Use external image optimisation services
7. ✅ Reduce function dependency size
