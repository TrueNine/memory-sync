# API Verification Scripts

Quick test scripts for verifying channel availability.

## Bash Quick Test

```bash
#!/bin/bash
API_URL="https://your-relay.com/v1/chat/completions"
API_KEY="sk-xxx"

curl -s -X POST "$API_URL" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Say \"OK\" only"}],
    "max_tokens": 5
  }' | jq -r '.choices[0].message.content'
```

## Python Full Verification

```python
import requests
import time
import statistics


class APIChannelTester:
    def __init__(self, base_url, api_key, model="gpt-3.5-turbo"):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.model = model

    def test_single(self):
        start = time.time()
        try:
            resp = requests.post(
                f"{self.base_url}/v1/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "messages": [{"role": "user", "content": "Hi"}],
                    "max_tokens": 10,
                },
                timeout=30,
            )
            latency = time.time() - start
            return {
                "ok": resp.status_code == 200,
                "status": resp.status_code,
                "latency": round(latency, 2),
                "content": resp.json()
                .get("choices", [{}])[0]
                .get("message", {})
                .get("content", ""),
            }
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def test_batch(self, n=10):
        results = [self.test_single() for _ in range(n)]
        latencies = [r["latency"] for r in results if r.get("ok")]

        return {
            "total": n,
            "success": sum(1 for r in results if r.get("ok")),
            "avg_latency": round(statistics.mean(latencies), 2) if latencies else None,
            "max_latency": round(max(latencies), 2) if latencies else None,
        }


# Usage
if __name__ == "__main__":
    tester = APIChannelTester("https://relay.example.com", "sk-xxxx")
    print(tester.test_batch(5))
```

## Node.js Simple Test

```javascript
const fetch = require('node-fetch');

async function testChannel(url, key) {
  const start = Date.now();
  const resp = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Test' }],
      max_tokens: 5,
    }),
  });
  const latency = Date.now() - start;

  return {
    ok: resp.ok,
    status: resp.status,
    latency,
    data: await resp.json(),
  };
}
```

