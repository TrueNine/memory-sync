# Email Routing Service

## Overview

Email Routing is Cloudflare's **completely free** email forwarding service. Create custom email addresses without managing mail servers.

**Key Features**:
- Free, privacy-first (Cloudflare doesn't store email content)
- Unlimited custom email addresses
- Complex logic via Email Workers
- Send emails from Workers

**Limits**:
- **Receive/forward only**, no SMTP sending
- Max email size: 25 MiB
- Max 200 rules, 200 addresses

## Free Quota

| Metric | Free Quota |
|:-------|:-----------|
| Custom addresses | 200 |
| Forwarding rules | 200 |
| Email size | 25 MiB |
| Email Workers | Subject to Workers free quota |

## Setup Steps

1. Domain must use Cloudflare as authoritative DNS
2. Go to Dashboard > Email > Email Routing
3. Add and verify destination mailbox
4. Create custom address rules

## Email Workers

Email Workers let you process emails with Workers for complex logic.

### Basic Template

```typescript
// src/index.ts
export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
    // Get email info
    const from = message.from
    const to = message.to
    const subject = message.headers.get('subject')

    // Allowlist forwarding
    const allowlist = ['friend@example.com', 'work@company.com']
    if (allowlist.includes(from)) {
      await message.forward('my-real@email.com')
      return
    }

    // Reject others
    message.setReject('Address not allowed')
  },
}

interface Env {
  // Environment variables
}
```

### ForwardableEmailMessage API

```typescript
interface ForwardableEmailMessage {
  readonly from: string           // Sender
  readonly to: string             // Recipient (your custom address)
  readonly headers: Headers       // Email headers
  readonly raw: ReadableStream    // Raw email stream
  readonly rawSize: number        // Email size

  // Reject email (returns SMTP error)
  setReject(reason: string): void

  // Forward to verified address (can add X-* headers)
  forward(rcptTo: string, headers?: Headers): Promise<void>

  // Reply to sender
  reply(message: EmailMessage): Promise<void>
}
```

### wrangler.toml Config

```toml
name = "email-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# Bind to Email Routing (receive emails)
# Bind address to this Worker in Dashboard
```

## Send Emails from Workers

Send emails from any Worker to verified addresses.

### Configure Bindings

```toml
# wrangler.toml

# Unrestricted binding (send to any verified address)
[[send_email]]
name = "SEND_EMAIL"

# Targeted address
[[send_email]]
name = "ALERT_EMAIL"
destination_address = "alerts@example.com"

# Allowlist
[[send_email]]
name = "TEAM_EMAIL"
allowed_destination_addresses = ["dev@example.com", "ops@example.com"]
```

### Send Email Example

```typescript
import { createMimeMessage } from 'mimetext'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const msg = createMimeMessage()
    msg.setSender({ name: 'Worker', addr: 'worker@yourdomain.com' })
    msg.setRecipient('recipient@example.com')
    msg.setSubject('Alert from Worker')
    msg.addMessage({
      contentType: 'text/plain',
      data: 'Something happened!',
    })

    const message = new EmailMessage(
      'worker@yourdomain.com',
      'recipient@example.com',
      msg.asRaw()
    )

    await env.SEND_EMAIL.send(message)
    return new Response('Email sent')
  },
}

interface Env {
  SEND_EMAIL: SendEmail
}
```

## Common Use Cases

### 1. Spam Filtering

```typescript
async email(message: ForwardableEmailMessage, env: Env) {
  const blocklist = ['spam@', 'marketing@']
  if (blocklist.some(b => message.from.includes(b))) {
    message.setReject('Blocked')
    return
  }
  await message.forward('inbox@example.com')
}
```

### 2. Subject-Based Routing

```typescript
async email(message: ForwardableEmailMessage, env: Env) {
  const subject = message.headers.get('subject') || ''

  if (subject.includes('[URGENT]')) {
    await message.forward('urgent@example.com')
  } else if (subject.includes('[SUPPORT]')) {
    await message.forward('support@example.com')
  } else {
    await message.forward('general@example.com')
  }
}
```

### 3. Webhook Notification

```typescript
async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
  // Forward email
  await message.forward('inbox@example.com')

  // Send webhook notification
  ctx.waitUntil(
    fetch('https://hooks.slack.com/xxx', {
      method: 'POST',
      body: JSON.stringify({
        text: `New email from ${message.from}`,
      }),
    })
  )
}
```

## Notes

1. **Destination must be verified**: Both forwarding and sending targets need Dashboard verification
2. **CPU limits**: Complex processing may hit Workers free tier CPU limits
3. **No SMTP**: Cannot use traditional SMTP clients, only Workers API
4. **Stats display issue**: Emails sent via Workers may show as "dropped" in stats but are actually delivered
