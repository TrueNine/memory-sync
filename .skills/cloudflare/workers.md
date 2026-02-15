# Workers Development Guide

## Free Quota

| Metric | Free Quota |
|:-------|:-----------|
| Requests | 100k/day |
| CPU Time | 10ms/request |
| Script Size | 1MB (compressed) |
| Env Variables | 64 |
| KV Bindings | Unlimited |

## Project Structure

```
my-worker/
├── src/
│   └── index.ts        # Entry file
├── wrangler.toml       # Config file
├── package.json
└── tsconfig.json
```

## Basic Template

```typescript
// src/index.ts
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // Route handling
    if (url.pathname === '/api/hello') {
      return Response.json({ message: 'Hello, World!' })
    }

    return new Response('Not Found', { status: 404 })
  },
}

interface Env {
  // KV binding
  MY_KV: KVNamespace
  // D1 binding
  DB: D1Database
  // R2 binding
  BUCKET: R2Bucket
  // Env variable
  API_KEY: string
}
```

## wrangler.toml Config

```toml
name = "my-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# KV binding
[[kv_namespaces]]
binding = "MY_KV"
id = "xxx"

# D1 binding
[[d1_databases]]
binding = "DB"
database_name = "my-db"
database_id = "xxx"

# R2 binding
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "my-bucket"

# Env variables (non-sensitive)
[vars]
ENVIRONMENT = "production"

# Sensitive vars use wrangler secret put
```

## Common Commands

```bash
# Local dev
wrangler dev

# Deploy
wrangler deploy

# View logs
wrangler tail

# Set secret
wrangler secret put API_KEY

# Create KV namespace
wrangler kv:namespace create MY_KV

# Create D1 database
wrangler d1 create my-db

# Create R2 bucket
wrangler r2 bucket create my-bucket
```

## Best Practices

1. **Use Hono Framework**: Easier than native API
   ```bash
   pnpm create cloudflare@latest my-api --template=hono
   ```

2. **Caching Strategy**: Use Cache API to reduce redundant computation
   ```typescript
   const cache = caches.default
   const cached = await cache.match(request)
   if (cached) return cached
   ```

3. **Error Handling**: Always return meaningful error responses
   ```typescript
   try {
     // ...
   } catch (e) {
     return Response.json({ error: 'Internal Error' }, { status: 500 })
   }
   ```

4. **CPU Time Optimisation**: Avoid complex computations, 10ms is short
