# Free Quota Details and Mitigation Strategies

## Complete Free Quota Table

### Workers

| Metric | Free Quota | Overage Price |
|:-------|:-----------|:--------------|
| Requests | 100k/day | $0.30/million |
| CPU Time | 10ms/request | - |
| Script Size | 1MB | - |
| Subrequests | 50/request | - |
| Script Count | 100 | - |

### Pages

| Metric | Free Quota | Overage Price |
|:-------|:-----------|:--------------|
| Sites | Unlimited | - |
| Builds | 500/month | $0.005/build |
| Concurrent Builds | 1 | - |
| Bandwidth | Unlimited | - |
| Functions | Same as Workers | - |

### R2

| Metric | Free Quota | Overage Price |
|:-------|:-----------|:--------------|
| Storage | 10GB | $0.015/GB/month |
| Class A Ops | 1M/month | $4.50/million |
| Class B Ops | 10M/month | $0.36/million |
| Egress | **Unlimited** | **Free** |

### D1

| Metric | Free Quota | Overage Price |
|:-------|:-----------|:--------------|
| Storage | 5GB | $0.75/GB/month |
| Row Reads | 5M/day | $0.001/million |
| Row Writes | 100k/day | $1.00/million |

### KV

| Metric | Free Quota | Overage Price |
|:-------|:-----------|:--------------|
| Storage | 1GB | $0.50/GB/month |
| Reads | 100k/day | $0.50/million |
| Writes | 1k/day | $5.00/million |

## Mitigation Strategies

### 1. Workers Request Limit

**Problem**: 100k/day may not suffice

**Strategies**:
- Use Cache API to cache responses
- Serve static assets via Pages or R2
- Merge API requests to reduce calls

```typescript
// Caching strategy
const cache = caches.default
const cacheKey = new Request(request.url, { method: 'GET' })

const cached = await cache.match(cacheKey)
if (cached) return cached

const response = await handleRequest(request)
ctx.waitUntil(cache.put(cacheKey, response.clone()))
return response
```

### 2. KV Write Limit

**Problem**: 1k writes/day is too few

**Strategies**:
- Batch writes: merge multiple writes into one
- Use D1 for frequent write scenarios
- Check if update is truly needed before writing

### 3. D1 Row Read Limit

**Problem**: 5M/day seems plenty, but complex queries consume fast

**Strategies**:
- Use indexes to optimise queries
- Avoid `SELECT *`, query only needed columns
- Use KV to cache hot data

### 4. Pages Build Limit

**Problem**: 500/month, frequent commits will exhaust it

**Strategies**:
- Merge PRs before deploying
- Use `wrangler pages deploy` to build locally then upload
- Use `wrangler dev` for development

### 5. CPU Time Limit

**Problem**: 10ms/request is short

**Strategies**:
- Avoid complex computations
- Use `ctx.waitUntil()` to defer non-critical tasks
- Pre-compute and cache results

```typescript
// waitUntil doesn't block response
ctx.waitUntil(logToAnalytics(request))
return response
```

## Monitor Usage

```bash
# View Workers usage
wrangler metrics

# Dashboard for detailed usage
# https://dash.cloudflare.com → Workers & Pages → Project → Metrics
```

## When to Pay

| Scenario | Recommendation |
|:---------|:---------------|
| Daily requests > 100k | Consider Workers Paid ($5/month) |
| Storage > 10GB | R2 paid is cheap |
| Need longer CPU time | Workers Paid (50ms) |
| Team collaboration | Pages Pro |

Workers Paid plan $5/month includes:
- 10M requests/month
- 50ms CPU time
- No daily limits
