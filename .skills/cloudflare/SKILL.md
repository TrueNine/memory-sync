---
name: cloudflare
description: Cloudflare free tier guide covering Workers, Pages, R2, D1, KV, Email Routing quotas and best practices. Activate when deploying edge services or leveraging Cloudflare free resources.
displayName: Cloudflare Free Tier
keywords:
  - cloudflare
  - workers
  - pages
  - r2
  - d1
  - kv
  - edge
  - serverless
  - cdn
  - free-tier
  - deployment
  - tunnel
  - cloudflared
  - intranet-penetration
  - ngrok
  - email
  - email-routing
  - email-workers
author: TrueNine
version: 2026.01.01
---
Cloudflare offers the most generous free tier in the industry, ideal for indie devs and small projects.

## Free Products Overview

| Product         | Free Quota                             | Use Case                                |
| :-------------- | :------------------------------------- | :-------------------------------------- |
| Workers         | 100k req/day                           | Edge compute, API, middleware           |
| Pages           | Unlimited sites, 500 builds/mo         | Static sites, full-stack apps           |
| R2              | 10GB storage, 1M Class A/mo            | Object storage (no egress fee)          |
| D1              | 5GB storage, 5M row reads/day          | SQLite database                         |
| KV              | 1GB storage, 100k reads/day            | Key-value store                         |
| Queues          | 1M messages/mo                         | Message queue                           |
| Durable Objects | 1GB storage                            | Stateful edge compute                   |
| Tunnel          | Unlimited tunnels, unlimited bandwidth | Intranet penetration, zero-trust access |
| Email Routing   | 200 addresses, 200 rules               | Email forwarding, Email Workers         |

## Core Constraints (Primacy)

**Free Tier Principles**:

- Always use free tier unless user explicitly requests paid features
- Prefer Pages over Workers (Pages includes Workers functionality and is easier)
- R2 is the preferred storage solution (no egress fees, this is key)
- D1 suits small apps; consider external DB for large apps

**Prohibited**:

- Do not recommend paid features
- Do not ignore free quota limits
- Do not hardcode API Tokens in code

## On-Demand Loading

| Document                  | Purpose                                            |
| :------------------------ | :------------------------------------------------- |
| [workers.md](workers.md) | Workers development, deployment, best practices    |
| [pages.md](pages.md)     | Pages static sites and full-stack apps             |
| [storage.md](storage.md) | R2, D1, KV storage selection and usage             |
| [limits.md](limits.md)   | Free quota details and workarounds                 |
| [tunnel.md](tunnel.md)   | Tunnel intranet penetration, expose local services |
| [email.md](email.md)     | Email Routing forwarding, Email Workers            |

## Quick Start

```bash
# Install Wrangler CLI
pnpm add -g wrangler

# Login (browser auth)
wrangler login

# Create Workers project
pnpm create cloudflare@latest my-worker

# Create Pages project (recommended)
pnpm create cloudflare@latest my-site --framework=next
```

## Verification Checklist (Recency)

**MUST** check before deployment:

1. Using free tier?
2. Within free quota limits?
3. API Token injected via env vars?
4. Chosen the right product (Pages vs Workers)?
5. Storage solution considers egress fees?