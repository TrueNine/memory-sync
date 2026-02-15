# Pages Deployment Guide

## Free Quota

| Metric | Free Quota |
|:-------|:-----------|
| Sites | Unlimited |
| Builds | 500/month |
| Concurrent Builds | 1 |
| Bandwidth | Unlimited |
| Requests | Unlimited |
| Functions | 100k/day (same as Workers) |

## Why Choose Pages

- **Easier than Workers**: Auto-handles static assets
- **Built-in CI/CD**: Git push auto-deploys
- **Preview Deployments**: Each PR gets a preview URL
- **Functions Integration**: `functions/` directory auto-becomes API

## Project Structure

```
my-site/
├── public/             # Static assets
├── src/                # Source code
├── functions/          # Serverless Functions
│   └── api/
│       └── hello.ts    # -> /api/hello
├── _headers            # Custom response headers
├── _redirects          # Redirect rules
└── wrangler.toml       # Optional config
```

## Functions Example

```typescript
// functions/api/hello.ts
export const onRequest: PagesFunction<Env> = async (context) => {
  return Response.json({ message: 'Hello from Pages Functions!' })
}

// HTTP method support
export const onRequestGet: PagesFunction = async (context) => {
  return Response.json({ method: 'GET' })
}

export const onRequestPost: PagesFunction = async (context) => {
  const body = await context.request.json()
  return Response.json({ received: body })
}
```

## Deployment Methods

### 1. Git Integration (Recommended)

1. Connect GitHub/GitLab in Cloudflare Dashboard
2. Select repository and branch
3. Configure build command and output directory
4. Auto-deploy

### 2. CLI Deployment

```bash
# Deploy static directory directly
wrangler pages deploy ./dist

# Create project
wrangler pages project create my-site
```

## Framework Support

| Framework | Build Command | Output Directory |
|:----------|:--------------|:-----------------|
| Next.js | `next build` | `.next` |
| Nuxt | `nuxt build` | `.output/public` |
| Astro | `astro build` | `dist` |
| Vite | `vite build` | `dist` |
| SvelteKit | `vite build` | `build` |

## Next.js on Pages

```bash
# Create Next.js + Cloudflare project
pnpm create cloudflare@latest my-next --framework=next
```

Requires `@cloudflare/next-on-pages` adapter:

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

## Environment Variables

```bash
# Set production env var
wrangler pages secret put API_KEY

# Set preview env var
wrangler pages secret put API_KEY --env preview
```

## Custom Domain

1. Dashboard → Pages → Project → Custom domains
2. Add domain
3. Configure DNS (auto-configured for Cloudflare DNS)

## Best Practices

1. **Leverage Preview Deployments**: Each PR gets a preview URL for testing
2. **Cache Static Assets**: Configure long-term caching in `_headers`
3. **Use Functions Instead of Standalone Workers**: Simpler project structure
4. **Monitor Build Count**: 500/month may not suffice for large teams
