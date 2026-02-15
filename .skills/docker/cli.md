# Docker/Podman CLI commands

Commands are the same for Docker and Podman; replace `docker` with `podman` as needed.

## Images

```bash
# Pull image
docker pull nginx:1.25-alpine

# Build image
docker build -t myapp:1.0.0 .
docker build -t myapp:1.0.0 -f Dockerfile.prod .

# List local images
docker images

# Remove image
docker rmi myapp:1.0.0
docker image prune -a  # Remove all unused images

# Export/import image
docker save myapp:1.0.0 -o myapp.tar
docker load -i myapp.tar

# Push image
docker tag myapp:1.0.0 registry.example.com/myapp:1.0.0
docker push registry.example.com/myapp:1.0.0
```

## Containers

```bash
# Run container
docker run -d --name myapp -p 3000:3000 myapp:1.0.0
docker run -it --rm alpine sh  # Interactive, remove on exit

# List containers
docker ps        # Running
docker ps -a     # All

# Stop/start/restart
docker stop myapp
docker start myapp
docker restart myapp

# Remove container
docker rm myapp
docker rm -f myapp  # Force remove running container
docker container prune  # Remove all stopped containers

# Shell into container
docker exec -it myapp sh
docker exec -it myapp /bin/bash

# Logs
docker logs myapp
docker logs -f myapp        # Follow
docker logs --tail 100 myapp  # Last 100 lines

# Resource usage
docker stats
docker stats myapp
```

## Volumes

```bash
# Create volume
docker volume create mydata

# List/inspect volume
docker volume ls
docker volume inspect mydata

# Remove volume
docker volume rm mydata
docker volume prune  # Remove all unused volumes

# Mount types
docker run -v mydata:/app/data myapp:1.0.0      # Named volume
docker run -v $(pwd)/data:/app/data myapp:1.0.0  # Bind mount
docker run -v /app/node_modules myapp:1.0.0      # Anonymous volume
```

## Networks

```bash
# Create network
docker network create mynet
docker network create --driver bridge mynet

# List/inspect network
docker network ls
docker network inspect mynet

# Connect/disconnect container
docker network connect mynet myapp
docker network disconnect mynet myapp

# Remove network
docker network rm mynet
docker network prune
```

## Compose

```bash
# Start services
docker compose up
docker compose up -d          # Detached
docker compose up --build     # Rebuild images
docker compose up app db      # Only specified services

# Stop services
docker compose down
docker compose down -v        # Also remove volumes
docker compose down --rmi all # Also remove images

# Status
docker compose ps
docker compose logs
docker compose logs -f app

# Run command
docker compose exec app sh
docker compose run --rm app npm test

# Rebuild one service
docker compose up -d --build app
```

## Cleanup

```bash
# Full cleanup (destructive)
docker system prune -a --volumes

# Step by step
docker container prune  # Stopped containers
docker image prune -a   # Unused images
docker volume prune     # Unused volumes
docker network prune    # Unused networks

# Disk usage
docker system df
```

## Podman-specific

```bash
# Generate systemd unit
podman generate systemd --name myapp --files

# Rootless (default)
podman run --userns=keep-id -v $(pwd):/app myapp:1.0.0

# Pod (similar to K8s Pod)
podman pod create --name mypod -p 8080:80
podman run -d --pod mypod nginx:1.25-alpine
```
