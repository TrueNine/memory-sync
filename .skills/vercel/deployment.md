# Deployment Configuration Guide

## Deployment Methods

### 1. Git Integration (Recommended)

1. Visit [vercel.com](https://vercel.com)
2. Import Git Repository
3. Select repo, Vercel auto-detects framework
4. Configure environment variables
5. Deploy

### 2. CLI Deployment

```bash
# Install
pnpm add -g vercel

# Login
vercel login

# Deploy (development)
vercel

# Deploy to production
vercel --prod

# Specify project
vercel --name my-project
```

### 3. GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy to Vercel
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

## vercel.json Configuration

```json
{
  "buildCommand": "pnpm build",
  "outputDirectory": ".next",
  "installCommand": "pnpm install",
  "framework": "nextjs",
  "regions": ["hkg1"],
  "functions": {
    "api/**/*.ts": {
      "memory": 1024,
      "maxDuration": 10
    }
  },
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api/:path*" }
  ],
  "redirects": [
    { "source": "/old", "destination": "/new", "permanent": true }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" }
      ]
    }
  ]
}
```

## Environment Variables

### Dashboard Configuration

1. Project Settings → Environment Variables
2. Add variable, select environment (Production/Preview/Development)

### CLI Configuration

```bash
# Add env var
vercel env add API_KEY

# Pull to local
vercel env pull .env.local

# List env vars
vercel env ls
```

### Environment Distinction

| Environment | Purpose | Trigger |
|:------------|:--------|:--------|
| Production | Production env | main branch deploy |
| Preview | Preview env | PR or other branches |
| Development | Local dev | `vercel dev` |

## Custom Domain

### Add Domain

1. Project Settings → Domains
2. Add domain
3. Configure DNS

### DNS Configuration

```
# A record
@ -> 76.76.21.21

# CNAME record
www -> cname.vercel-dns.com
```

### Pairing with Cloudflare

1. Cloudflare manages DNS
2. Disable Cloudflare proxy (grey cloud)
3. Or use CNAME record pointing to Vercel

## Region Selection

Free plan deploys to all regions by default, but can specify:

```json
{
  "regions": ["hkg1", "sin1"]
}
```

Common regions:
- `hkg1` - Hong Kong
- `sin1` - Singapore
- `nrt1` - Tokyo
- `sfo1` - San Francisco
- `iad1` - Washington DC

## Build Cache

Vercel auto-caches `node_modules` and build artifacts.

Force clear cache:
```bash
vercel --force
```

Or in Dashboard: Project Settings → General → Build Cache → Clear

## Best Practices

1. **Use Preview Deployments**: Each PR auto-generates preview URL
2. **Separate Env Vars**: Use different configs for production and preview
3. **Monitor Build Time**: 6000 min/month, watch for large projects
4. **Leverage Edge Config**: Hot config updates without redeployment
