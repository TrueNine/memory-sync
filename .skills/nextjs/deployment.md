# Deployment Guide

## Platform Comparison

| Platform | Advantages | Free Tier |
|:---------|:-----------|:----------|
| Vercel | Native support, zero config | 100GB bandwidth/month |
| Cloudflare Pages | Unlimited bandwidth, edge runtime | Unlimited bandwidth |
| Self-hosted | Full control | Depends on server |

## Vercel Deployment

### Auto Deployment

1. Connect GitHub repository
2. Vercel auto-detects Next.js
3. Auto-deploys on each push

### CLI Deployment

```bash
# Install
pnpm add -g vercel

# Deploy
vercel

# Production deployment
vercel --prod
```

### Environment Variables

```bash
# Add env variable
vercel env add DATABASE_URL

# Pull to local
vercel env pull .env.local
```

## Cloudflare Pages Deployment

### Install Adapter

```bash
pnpm add @cloudflare/next-on-pages
```

### Configuration

```typescript
// next.config.js
const { setupDevPlatform } = require('@cloudflare/next-on-pages/next-dev')

if (process.env.NODE_ENV === 'development') {
  setupDevPlatform()
}

module.exports = {
  // ...
}
```

### Deploy

```bash
# Build
pnpm dlx @cloudflare/next-on-pages

# Deploy
wrangler pages deploy .vercel/output/static
```

### Limitations

- Some `middleware` features not supported
- `next/image` optimisation not supported (requires external service)
- Edge Runtime limitations

## Self-Hosting

### Node.js Server

```bash
# Build
pnpm build

# Start
pnpm start
```

### Docker

```dockerfile
# Dockerfile
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable pnpm && pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
```

### Standalone Output

```typescript
// next.config.js
module.exports = {
  output: 'standalone',
}
```

## Environment Variables

### Build-time vs Runtime

```typescript
// Build-time (NEXT_PUBLIC_ prefix)
// Inlined into client code
NEXT_PUBLIC_API_URL=https://api.example.com

// Runtime (server-side)
DATABASE_URL=postgres://...
API_SECRET=...
```

### .env Files

```
.env                # All environments
.env.local          # Local override (gitignore)
.env.development    # Development
.env.production     # Production
```

## Domain Configuration

### Vercel

1. Project Settings → Domains
2. Add domain
3. Configure DNS

### Cloudflare

1. Pages → Custom domains
2. Add domain
3. Auto-configure DNS

## Monitoring

### Vercel Analytics

```typescript
// app/layout.tsx
import { Analytics } from '@vercel/analytics/react'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

### Speed Insights

```typescript
import { SpeedInsights } from '@vercel/speed-insights/next'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  )
}
```

## Best Practices

1. **Use Preview deployments**: Auto-generate preview for each PR
2. **Separate env variables**: Different configs for dev, preview, production
3. **Monitor performance**: Use Analytics and Speed Insights
4. **CDN caching**: Set appropriate cache strategies
5. **Error tracking**: Integrate Sentry or similar services
