# Free Quota Details and Mitigation Strategies

## Hobby Plan Complete Quota

### Deployment and Build

| Metric | Free Quota |
|:-------|:-----------|
| Deployments | Unlimited |
| Build Time | 6000 min/month |
| Concurrent Builds | 1 |
| Build Timeout | 45 min |

### Bandwidth and Requests

| Metric | Free Quota |
|:-------|:-----------|
| Bandwidth | 100GB/month |
| Requests | Unlimited |
| Image Optimisation | 1000 images/month |

### Functions

| Metric | Serverless | Edge |
|:-------|:-----------|:-----|
| Execution Time | 100GB-Hrs/month | - |
| Invocations | - | 500k/month |
| Timeout | 10s | 30s |
| Memory | 1024MB | 128MB |

### Other

| Metric | Free Quota |
|:-------|:-----------|
| Analytics | 2500 events/month |
| Edge Config | 1 |
| Cron Jobs | 2 |
| Team Members | 1 |

## Mitigation Strategies

### 1. Bandwidth Limit (100GB/month)

**Problem**: Videos, large images exhaust quickly

**Strategies**:
- Store large files in Cloudflare R2 (no egress fees)
- Use external CDN for images (Cloudflare Images, imgix)
- Use professional services for video (Cloudflare Stream, Mux)

```typescript
// Redirect large files to R2
// middleware.ts
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/files/')) {
    return NextResponse.redirect(
      `https://your-bucket.r2.cloudflarestorage.com${request.nextUrl.pathname}`
    )
  }
}
```

### 2. Build Time Limit (6000 min/month)

**Problem**: Large projects build slowly, frequent deploys exhaust quota

**Strategies**:
- Use Turborepo incremental builds
- Merge PRs before deploying
- Build locally then upload

```bash
# Local build
pnpm build

# Deploy build artifacts directly
vercel --prebuilt
```

### 3. Serverless Execution Time (100GB-Hrs/month)

**Problem**: Complex APIs consume quickly

**Strategies**:
- Reduce memory config
- Use Edge Functions for simple APIs
- Cache responses

```typescript
// Reduce memory
export const config = {
  memory: 512 // default 1024
}

// Cache response
return Response.json(data, {
  headers: {
    'Cache-Control': 's-maxage=60, stale-while-revalidate=300'
  }
})
```

### 4. Image Optimisation Limit (1000/month)

**Problem**: Image-heavy sites exhaust quickly

**Strategies**:
- Use external image optimisation services
- Pre-process images before upload
- Use Cloudflare Images

```typescript
// next.config.js
module.exports = {
  images: {
    loader: 'custom',
    loaderFile: './image-loader.js',
  }
}

// image-loader.js
export default function cloudflareLoader({ src, width, quality }) {
  return `https://your-cf-images.com/cdn-cgi/image/width=${width},quality=${quality || 75}/${src}`
}
```

### 5. Function Timeout (10s)

**Problem**: Complex operations timeout

**Strategies**:
- Split into smaller tasks
- Use queues (Vercel Queues or external)
- Background tasks via Cloudflare Workers

## Monitor Usage

Dashboard → Project → Usage to view:
- Bandwidth usage
- Function execution time
- Build time
- Image optimisation count

## When to Upgrade to Pro

| Scenario | Recommendation |
|:---------|:---------------|
| Commercial project | **Must** Pro (ToS requirement) |
| Team collaboration | Pro (multi-member) |
| Bandwidth > 100GB | Pro (1TB) |
| Function timeout > 10s | Pro (60s) |
| Need concurrent builds | Pro (unlimited) |

Pro plan $20/month/member includes:
- Commercial use licence
- 1TB bandwidth
- 60s function timeout
- Unlimited concurrent builds
- Advanced analytics
