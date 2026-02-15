# Storage Solutions Guide

## Solution Comparison

| Solution | Type | Free Quota | Use Case |
|:---------|:-----|:-----------|:---------|
| R2 | Object Storage | 10GB storage | Files, images, backups |
| D1 | SQLite | 5GB storage | Structured data |
| KV | Key-Value Store | 1GB storage | Config, cache, sessions |
| Durable Objects | Stateful Compute | 1GB storage | Real-time collaboration, WebSocket |

## R2 Object Storage

**Core Advantage**: No egress fees (this is key!)

### Free Quota

| Metric | Free Quota |
|:-------|:-----------|
| Storage | 10GB |
| Class A Ops (write) | 1M/month |
| Class B Ops (read) | 10M/month |
| Egress | **Unlimited free** |

### Usage Example

```typescript
// Using R2 in Workers
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const key = url.pathname.slice(1)

    // Upload
    if (request.method === 'PUT') {
      await env.BUCKET.put(key, request.body)
      return new Response('Uploaded')
    }

    // Download
    const object = await env.BUCKET.get(key)
    if (!object) return new Response('Not Found', { status: 404 })

    return new Response(object.body, {
      headers: { 'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream' }
    })
  }
}
```

### Public Access

```bash
# Enable public access
wrangler r2 bucket update my-bucket --public-access allow
```

## D1 SQLite Database

### Free Quota

| Metric | Free Quota |
|:-------|:-----------|
| Storage | 5GB |
| Row Reads | 5M/day |
| Row Writes | 100k/day |

### Usage Example

```typescript
// Create table
await env.DB.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE
  )
`)

// Query
const { results } = await env.DB.prepare(
  'SELECT * FROM users WHERE id = ?'
).bind(1).all()

// Insert
await env.DB.prepare(
  'INSERT INTO users (name, email) VALUES (?, ?)'
).bind('Alice', 'alice@example.com').run()

// Batch operations
const batch = [
  env.DB.prepare('INSERT INTO users (name) VALUES (?)').bind('Bob'),
  env.DB.prepare('INSERT INTO users (name) VALUES (?)').bind('Charlie'),
]
await env.DB.batch(batch)
```

### Migration Management

```bash
# Create migration
wrangler d1 migrations create my-db add_users_table

# Apply migration
wrangler d1 migrations apply my-db
```

## KV Key-Value Store

### Free Quota

| Metric | Free Quota |
|:-------|:-----------|
| Storage | 1GB |
| Reads | 100k/day |
| Writes | 1k/day |
| Deletes | 1k/day |
| Lists | 1k/day |

### Usage Example

```typescript
// Write
await env.MY_KV.put('key', 'value')
await env.MY_KV.put('user:1', JSON.stringify({ name: 'Alice' }))

// With expiration
await env.MY_KV.put('session:abc', 'data', { expirationTtl: 3600 })

// Read
const value = await env.MY_KV.get('key')
const user = await env.MY_KV.get('user:1', 'json')

// Delete
await env.MY_KV.delete('key')

// List
const { keys } = await env.MY_KV.list({ prefix: 'user:' })
```

### Notes

- **Eventual Consistency**: Writes may take 60s to sync globally
- **Strict Write Limit**: 1k/day, unsuitable for frequent writes
- **Read-heavy Workloads**: Ideal for config, cache, static data

## Selection Guide

| Scenario | Recommended |
|:---------|:------------|
| User file uploads | R2 |
| User data | D1 |
| Session management | KV (with TTL) |
| Config management | KV |
| Caching | KV or Cache API |
| Real-time collaboration | Durable Objects |
