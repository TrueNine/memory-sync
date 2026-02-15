# Self-Hosted Relay Setup

Use Cloudflare Workers or your own VPS to build an API relay service.

## Cloudflare Workers (Recommended)

**Pros:**

- Generous free quota
- Global CDN acceleration
- No server maintenance

**Deployment Steps:**

1. Create the Worker script

```javascript
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetHost = 'api.openai.com';

    const targetUrl = `https://${targetHost}${url.pathname}${url.search}`;

    const modifiedRequest = new Request(targetUrl, {
      method: request.method,
      headers: {
        ...Object.fromEntries(request.headers),
        host: targetHost,
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: request.body,
    });

    return await fetch(modifiedRequest);
  },
};
```

2. Configure environment variables

```bash
wrangler secret put OPENAI_API_KEY
```

3. Bind a custom domain (optional but recommended)

## VPS-Based Setup (Nginx Reverse Proxy)

```nginx
server {
    listen 443 ssl;
    server_name api.example.com;

    location / {
        proxy_pass https://api.openai.com/;
        proxy_set_header Host api.openai.com;
        proxy_set_header Authorization $http_authorization;
        proxy_buffering off;
        proxy_cache off;
    }
}
```

## Advanced: Multi-Key Rotation

```javascript
const KEYS = [env.KEY1, env.KEY2, env.KEY3];
let currentIndex = 0;

function getNextKey() {
  const key = KEYS[currentIndex];
  currentIndex = (currentIndex + 1) % KEYS.length;
  return key;
}
```

## Monitoring and Alerts

It is recommended to use UptimeRobot or a self-hosted health-check system. Monitor at least:

- Response time > 5s → alert
- Error rate > 5% → alert
- Switch to a backup channel after 3 consecutive failures

