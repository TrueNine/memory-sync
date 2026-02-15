# Tunnel Intranet Penetration Guide

## Free Quota

| Metric | Free Quota |
|:-------|:-----------|
| Tunnel Count | Unlimited |
| Connections | Unlimited |
| Bandwidth | Unlimited |
| Domain Bindings | Unlimited (requires Cloudflare DNS) |

Cloudflare Tunnel is **completely free**, no paywall—this is the core of free-tier usage.

## Why Choose Tunnel

- **Zero Cost**: Completely free, no hidden fees
- **No Public IP Needed**: Expose intranet services directly to public
- **Auto HTTPS**: Cloudflare auto-issues certificates
- **DDoS Protection**: Built-in Cloudflare full protection suite
- **No Port Opening**: Outbound connections, firewall-friendly

## Install cloudflared

```bash
# Debian/Ubuntu
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# macOS
brew install cloudflared

# Windows (winget)
winget install Cloudflare.cloudflared

# Docker
docker pull cloudflare/cloudflared:latest
```

## Quick Start (Temporary Tunnel)

```bash
# Expose local port 3000, get temporary URL
cloudflared tunnel --url http://localhost:3000
```

Output like: `https://random-words.trycloudflare.com`

Suitable for temporary testing, demos—no login required.

## Persistent Tunnel (Recommended)

### 1. Login Authentication

```bash
cloudflared tunnel login
# Browser opens auth page, select domain
```

### 2. Create Tunnel

```bash
cloudflared tunnel create my-tunnel
# Outputs Tunnel ID, note it down
```

### 3. Configuration File

```yaml
# ~/.cloudflared/config.yml
tunnel: <TUNNEL_ID>
credentials-file: ~/.cloudflared/<TUNNEL_ID>.json

ingress:
  # Main service
  - hostname: app.example.com
    service: http://localhost:3000

  # API service
  - hostname: api.example.com
    service: http://localhost:8080

  # SSH access (optional)
  - hostname: ssh.example.com
    service: ssh://localhost:22

  # Catch-all rule (required)
  - service: http_status:404
```

### 4. Configure DNS

```bash
cloudflared tunnel route dns my-tunnel app.example.com
cloudflared tunnel route dns my-tunnel api.example.com
```

### 5. Run Tunnel

```bash
# Foreground
cloudflared tunnel run my-tunnel

# Background service (Linux systemd)
sudo cloudflared service install
sudo systemctl start cloudflared
```

## Docker Compose Deployment

```yaml
# docker-compose.yml
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel run
    environment:
      - TUNNEL_TOKEN=${TUNNEL_TOKEN}
    # Or use config file
    # volumes:
    #   - ./cloudflared:/etc/cloudflared
```

Token method (obtained when creating tunnel in Dashboard) is simpler—no local config file needed.

## Common Scenarios

### Expose Dev Server

```bash
# Next.js / Vite / any dev server
cloudflared tunnel --url http://localhost:3000
```

### Expose Intranet NAS

```yaml
ingress:
  - hostname: nas.example.com
    service: http://192.168.1.100:5000
  - service: http_status:404
```

### Expose Multiple Services

```yaml
ingress:
  - hostname: web.example.com
    service: http://localhost:3000
  - hostname: api.example.com
    service: http://localhost:8080
  - hostname: grafana.example.com
    service: http://localhost:3001
  - service: http_status:404
```

### SSH Remote Access

Server config:
```yaml
ingress:
  - hostname: ssh.example.com
    service: ssh://localhost:22
  - service: http_status:404
```

Client config (`~/.ssh/config`):
```
Host ssh.example.com
  ProxyCommand cloudflared access ssh --hostname %h
```

## Best Practices

1. **Use Token Over Config File**: Create tunnel in Dashboard, copy Token—easier to manage
2. **systemd Management**: Use `cloudflared service install` for production
3. **Health Checks**: Configure `originRequest.connectTimeout` to avoid timeouts
4. **Multiple Replicas**: Same Tunnel can run multiple cloudflared instances, auto load-balancing

## Notes

- Domain must be hosted on Cloudflare DNS
- Temporary tunnel URL changes on each restart
- SSH access requires cloudflared on client too
- Large file transfers may hit Cloudflare's 100MB request body limit (free tier)
