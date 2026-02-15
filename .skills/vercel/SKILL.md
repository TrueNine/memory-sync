---
name: vercel
description: Vercel free product guide covering Hobby plan deployment, Serverless Functions, Edge Functions. Activate when deploying frontend apps or leveraging Vercel free resources.
displayName: Vercel Free Tier
keywords:
  - vercel
  - deployment
  - serverless
  - edge
  - nextjs
  - react
  - frontend
  - free-tier
  - hobby
  - preview
author: TrueNine
version: 2026.01.01
---
Vercel's Hobby plan is very friendly to individual developers, the preferred platform for deploying Next.js apps.

## Free Products Overview (Hobby Plan)

| Product              | Free Quota        | Use Case        |
| :------------------- | :---------------- | :-------------- |
| Deployments          | Unlimited         | Auto CI/CD      |
| Bandwidth            | 100GB/month       | CDN traffic     |
| Serverless Functions | 100GB-Hrs/month   | API routes      |
| Edge Functions       | 500k/month        | Edge compute    |
| Build Time           | 6000 min/month    | CI/CD builds    |
| Preview Deployments  | Unlimited         | PR preview envs |
| Analytics            | 2500 events/month | Basic analytics |

## Core Constraints (Primacy)

**Free-tier Principles**:

- For non-commercial projects only (Hobby plan restriction)
- Prefer Edge Functions (faster, cheaper)
- Use Preview deployments for testing, reduce production pressure
- Image optimisation has limits; consider external CDN for many images

**Prohibited**:

- Do not use for commercial projects (violates ToS)
- Do not ignore bandwidth limits (100GB seems plenty, video sites exhaust quickly)
- Do not run long tasks in Serverless Functions (10s timeout)

**Hobby vs Pro Key Differences**:

| Limit             | Hobby | Pro       |
| :---------------- | :---- | :-------- |
| Commercial Use    | ❌     | ✅         |
| Team Members      | 1     | Unlimited |
| Concurrent Builds | 1     | Unlimited |
| Function Timeout  | 10s   | 60s       |
| Bandwidth         | 100GB | 1TB       |

## On-Demand Loading

| Document                            | Purpose                                               |
| :---------------------------------- | :---------------------------------------------------- |
| [deployment.md](deployment.md)     | Deployment config, env vars, domain binding           |
| [functions.md](functions.md)       | Serverless and Edge Functions                         |
| [optimization.md](optimization.md) | Performance optimisation, reduce resource consumption |
| [limits.md](limits.md)             | Free quota details and mitigation strategies          |

## Quick Start

```bash
# Install Vercel CLI
pnpm add -g vercel

# Login
vercel login

# Deploy (auto-detects framework)
vercel

# Deploy to production
vercel --prod
```

## Pairing with Cloudflare

Vercel deployment + Cloudflare CDN is a classic free-tier combo:

1. Vercel handles app deployment and Serverless
2. Cloudflare handles CDN and DDoS protection
3. Cloudflare R2 handles static asset storage (no egress fees)

## Verification Checklist (Recency)

**MUST** check before deployment:

1. Project is non-commercial?
2. Within free quota limits?
3. Environment variables configured correctly?
4. Prioritising Edge Functions?
5. Large files using external storage?