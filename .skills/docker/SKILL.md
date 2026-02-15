---
name: docker
description: "Containerisation guide: OCI-compliant, Docker/Podman dual support; CLI, Compose, Dockerfile best practices. Activate when writing Dockerfile, docker-compose.yml or operating local containers."
displayName: Docker & Compose
keywords:
  - docker
  - compose
  - dockerfile
  - container
  - podman
  - oci
  - container
  - image
  - volume
  - network
author: TrueNine
version: 2026.01.01
---
Containerisation is core infrastructure for modern development. This Skill centres on the OCI standard and ensures Docker and Podman compatibility.

## Core Constraints (Primacy)

**OCI compatibility first**:

- All config must work with both Docker and Podman
- Use `docker-compose.yml` not `docker-compose.yaml` (Podman recognises the former)
- Do not use Docker-only features (e.g. `docker-compose` v1 syntax)

**MUST follow**:

- Compose files must have `version` empty or omitted (Compose Spec)
- Use `docker compose` (space) not `docker-compose` (hyphen)
- Image tags must be explicit; no `:latest`
- Sensitive data via `.env` or secrets; no hardcoding
- `.env*` follows dotenv skill root-only rule (no subdirs)
- No default values in env interpolation (e.g. `${PORT:-3000}`); fail when missing

**Forbidden**:

- `links` (deprecated; use networks)
- Hardcoded `container_name` (hurts scalability)
- `ADD` in Dockerfile except for unpacking tar (use `COPY`)
- Running app process as root
- Env default values (`${VAR:-default}` hides config errors)
- Extra scripts; keep deployment files minimal

## On-demand loading

| Doc                             | Purpose                                          |
| :------------------------------ | :----------------------------------------------- |
| [cli.md](cli.md)               | Docker/Podman CLI commands                       |
| [compose.md](compose.md)       | Compose file spec and templates                  |
| [dockerfile.md](dockerfile.md) | Dockerfile best practices and multi-stage builds |

## Quick reference

### Compose base template

```yaml
# docker-compose.yml
services:
  app:
    image: node:20-alpine
    working_dir: /app
    volumes:
      - .:/app
      - node_modules:/app/node_modules
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
    user: "1000:1000"
    restart: unless-stopped

volumes:
  node_modules:
```

### Dockerfile base template

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

FROM base AS runner
RUN addgroup -g 1001 appgroup && adduser -u 1001 -G appgroup -s /bin/sh -D appuser
COPY --from=deps /app/node_modules ./node_modules
COPY . .
USER appuser
EXPOSE 3000
CMD ["node", "server.js"]
```

## Checklist (Recency)

After writing, **MUST** verify:

1. `podman compose up` starts correctly
2. App runs as non-root
3. Image tags are explicit
4. Secrets come from env, not hardcoded
5. `.env*` respects dotenv root-only rule
6. All forbidden patterns (including extra scripts) are avoided