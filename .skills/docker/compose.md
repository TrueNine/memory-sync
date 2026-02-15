# Compose file spec

Based on Compose Specification; compatible with Docker Compose and Podman Compose.

## File naming

Priority (high to low):
1. `compose.yaml` / `compose.yml` (Compose Spec)
2. `docker-compose.yml` (legacy, Podman-compatible)

## Base structure

```yaml
# Do not set version; deprecated in Compose Spec
services:
  app:
    # Service config

volumes:
  # Named volumes

networks:
  # Custom networks
```

## Volume mapping

Two approaches; choose by scenario.

### 1. Bind mount (development)

Use `./.volumes/` so data lives with the project:

```yaml
services:
  db:
    image: postgres:16-alpine
    volumes:
      - ./.volumes/postgres:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - ./.volumes/redis:/data
```

**When to use**:
- Local dev
- Need to inspect/edit data files
- Data moves with the project

**Note**: Add `.volumes/` to `.gitignore`.

### 2. Named volumes (production/shared)

Docker-managed volumes; easier to clean:

```yaml
services:
  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
```

**When to use**:
- Production
- Shared data
- Centralised cleanup

**Cleanup**:
```bash
docker compose down -v   # Remove services and volumes
docker volume prune     # Remove unused volumes
```

### Mixed example

```yaml
services:
  app:
    volumes:
      - .:/app                           # Source bind mount
      - node_modules:/app/node_modules  # Named volume for deps (performance)

  db:
    volumes:
      - ./.volumes/postgres:/var/lib/postgresql/data  # Dev bind mount

volumes:
  node_modules:
```

## Service options

```yaml
services:
  app:
    # Image (one of)
    image: node:20-alpine
    # Or build
    build:
      context: .
      dockerfile: Dockerfile
      args:
        - NODE_ENV=production

    ports:
      - "3000:3000"           # host:container
      - "127.0.0.1:3000:3000" # Local only

    # Env: .env* follows dotenv root-only rule
    environment:
      - NODE_ENV=production
      - DATABASE_URL          # From root .env
    env_file:
      - .env                  # Or ../.env if compose in subdir

    volumes:
      - .:/app                          # Bind
      - node_modules:/app/node_modules  # Named
      - /app/dist                       # Anonymous

    working_dir: /app

    command: ["node", "server.js"]
    # Or override entrypoint
    entrypoint: ["/bin/sh", "-c"]

    user: "1000:1000"

    depends_on:
      db:
        condition: service_healthy

    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

    restart: unless-stopped

    networks:
      - frontend
      - backend

    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 512M
        reservations:
          memory: 256M
```

## Full example: Web + DB + Cache

Development (bind mounts):

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/app
      - REDIS_URL=redis://cache:6379
    volumes:
      - .:/app
      - node_modules:/app/node_modules
    user: "1000:1000"
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_started
    restart: unless-stopped
    networks:
      - backend

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=app
    volumes:
      - ./.volumes/postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - backend

  cache:
    image: redis:7-alpine
    volumes:
      - ./.volumes/redis:/data
    restart: unless-stopped
    networks:
      - backend

volumes:
  node_modules:

networks:
  backend:
```

Production (named volumes):

```yaml
services:
  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data

  cache:
    image: redis:7-alpine
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
```

## OCI compatibility

### Forbidden

```yaml
# ❌ Deprecated
version: "3.8"
links:
  - db
container_name: my-fixed-name

# ❌ Docker-only
platform: linux/amd64  # Not supported by Podman
```

### Recommended

```yaml
# ✅ Correct
services:
  app:
    # No version
    # Use networks instead of links
    networks:
      - backend
    # No hardcoded container_name
```

## Multi-environment

```yaml
# compose.yaml (base)
services:
  app:
    image: myapp:latest

# compose.override.yaml (dev, auto-loaded)
services:
  app:
    build: .
    volumes:
      - .:/app

# compose.prod.yaml (production)
services:
  app:
    image: registry.example.com/myapp:1.0.0
    restart: always
```

Commands:
```bash
# Dev (override loaded automatically)
docker compose up

# Production
docker compose -f compose.yaml -f compose.prod.yaml up -d
```

## .env files

**Location**: Dotenv skill root-only; `.env*` only at project root.

```bash
# Project root /.env
POSTGRES_PASSWORD=secret
APP_PORT=3000
```

```yaml
# compose.yaml (at root)
services:
  app:
    env_file:
      - .env
    ports:
      - "${APP_PORT}:3000"  # No default; fail if missing
  db:
    environment:
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
```

If compose is in a subdir, reference root `.env`:

```yaml
env_file:
  - ../.env
```

Or at runtime: `docker compose --env-file .env -f deploy/docker-compose.yml up` (from root).

**No default values**:

```yaml
# ❌ Wrong - defaults hide config issues
ports:
  - "${APP_PORT:-3000}:3000"
environment:
  - POSTGRES_USER=${POSTGRES_USER:-postgres}

# ✅ Right - fail when missing, easier to debug
ports:
  - "${APP_PORT}:3000"
environment:
  - POSTGRES_USER=${POSTGRES_USER}
```
