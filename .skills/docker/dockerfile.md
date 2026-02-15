# Dockerfile best practices

## Principles

1. **Multi-stage builds**: Smaller final image
2. **Non-root user**: Security first
3. **Explicit versions**: No `:latest`
4. **Layer cache**: Put rarely changing instructions first
5. **No extra scripts**: Start app directly with `CMD`; avoid entrypoint wrappers

## Standard templates

### Node.js app

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /app

# Dependencies (cache-friendly)
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

# Build stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# Runtime stage
FROM base AS runner
ENV NODE_ENV=production

RUN addgroup -g 1001 appgroup && \
    adduser -u 1001 -G appgroup -s /bin/sh -D appuser

COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package.json ./

USER appuser
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### Python app

```dockerfile
# syntax=docker/dockerfile:1
FROM python:3.12-slim AS base
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

FROM base AS deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM base AS runner
RUN useradd -m -u 1001 appuser
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --chown=appuser:appuser . .

USER appuser
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Go app

```dockerfile
# syntax=docker/dockerfile:1
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o server .

FROM scratch AS runner
COPY --from=builder /app/server /server
USER 1001:1001
EXPOSE 8080
ENTRYPOINT ["/server"]
```

### Java (Gradle) app

```dockerfile
# syntax=docker/dockerfile:1
FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /app
COPY gradle gradle
COPY gradlew build.gradle.kts settings.gradle.kts ./
RUN ./gradlew dependencies --no-daemon
COPY src src
RUN ./gradlew bootJar --no-daemon

FROM eclipse-temurin:21-jre-alpine AS runner
WORKDIR /app
RUN addgroup -g 1001 appgroup && \
    adduser -u 1001 -G appgroup -s /bin/sh -D appuser
COPY --from=builder --chown=appuser:appgroup /app/build/libs/*.jar app.jar

USER appuser
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

## Instruction reference

### FROM

```dockerfile
# ✅ Explicit version + small base
FROM node:20-alpine
FROM python:3.12-slim
FROM eclipse-temurin:21-jre-alpine

# ❌ Forbidden
FROM node:latest
FROM ubuntu  # Too large
```

### COPY vs ADD

```dockerfile
# ✅ Prefer COPY
COPY package.json ./
COPY src/ ./src/

# ⚠️ ADD only for unpacking
ADD archive.tar.gz /app/

# ❌ Do not use ADD for plain files
ADD package.json ./
```

### RUN layer optimisation

```dockerfile
# ✅ Combine to reduce layers
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# ❌ Multiple RUN = more layers
RUN apt-get update
RUN apt-get install -y curl
```

### User and permissions

```dockerfile
# Alpine
RUN addgroup -g 1001 appgroup && \
    adduser -u 1001 -G appgroup -s /bin/sh -D appuser

# Debian/Ubuntu
RUN useradd -m -u 1001 -g 1001 appuser

# Switch user (at the end)
USER appuser
```

### Health check

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
```

## .dockerignore

```
# .dockerignore
node_modules
dist
.git
.env
*.log
Dockerfile*
docker-compose*
.dockerignore
README.md
```

## Build commands

```bash
# Basic build
docker build -t myapp:1.0.0 .

# Custom Dockerfile
docker build -t myapp:1.0.0 -f Dockerfile.prod .

# Build args
docker build --build-arg NODE_ENV=production -t myapp:1.0.0 .

# Multi-platform (requires buildx)
docker buildx build --platform linux/amd64,linux/arm64 -t myapp:1.0.0 .

# No cache
docker build --no-cache -t myapp:1.0.0 .
```
