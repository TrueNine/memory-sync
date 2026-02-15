---
name: ai-resource-channels
description: Get AI model access cheaply via Xianyu, relay services, account pools, and API marketplaces. Official too expensive or geo-blocked? Practical tips and pitfalls.
displayName: AI Resource Channels Guide
keywords:
  - ai
  - api
  - free
  - cheap
  - relay
  - xianyu
  - proxy
  - account-pool
author: TrueNine
version: 2026.02.14
---
# AI Resource Channels

## Core Principles

- **Save money but don’t get scammed**: Test with a small amount first; only top up after confirming it works.
- **Never expose API keys**: Do not hardcode keys in client code.
- **Have multiple channels**: Keep 2–3 providers so you have a fallback if one fails.
- **Stay under rate limits**: Exceeding limits can get the key banned and waste your spend.

---

## Quick Start

**First time? Follow this order:**

1. **Try a small purchase on Xianyu (e.g. ~¥10)** — Fast and direct; usable same day.
2. **Verify it works** — Send a few requests and check responses.
3. **Top up only after it works** — Confirm stability before larger top-ups.
4. **Self-host a relay if you can** — Cheaper long-term; see [Self-Hosted Relay](references/self-hosted-relay.md).

**No time to tinker?** Use a reliable relay service with pay-as-you-go; spend only what you use.

---

## Channel Categories

### 1. Second-Hand Platforms (Xianyu, etc.)

**Price**: Often 30–70% of official; sometimes lower.
**Risk**: Medium–high; platform escrow is relatively safe.
**Best for**: Beginners, one-off needs, tight budgets.

**Search terms:**

- `OpenAI API` / `GPT-4 account`
- `Claude API` / `Claude relay`
- `AI API` / `ChatGPT shared`
- `Gemini API` / `Tongyi Qianwen API`

**Red-flag guide:**

| Red Flag                                       | What to do                           |
| ---------------------------------------------- | ------------------------------------ |
| Unrealistically low price (e.g. 10% of normal) | Skip; ~99% scam                      |
| Seller asks for off-platform payment           | Refuse; use platform escrow only     |
| No history or low seller rating                | Prefer sellers with >90% rating      |
| No test allowed, full payment upfront          | Insist on smallest test amount first |

**Practical tips:**

- Buy ¥10–20 worth to test; top up only if it works.
- Screenshot all chat and transaction records.
- Test API availability before confirming receipt.
- Escalate to platform if there are issues.

---

### 2. Relay Services

**What they are**: Third-party proxy services you use as-is.

| Type              | Traits                      | Price                   | Stability   |
| ----------------- | --------------------------- | ----------------------- | ----------- |
| **Public relay**  | Ready to use, pay-as-you-go | Slightly above official | Variable    |
| **Private relay** | Small circle, invite-only   | Near official           | More stable |
| **Self-hosted**   | You run on VPS              | VPS cost only           | Most stable |

**Selection criteria:**

- Latency < 2s (acceptable)
- Uptime > 95% (baseline)
- Clear rate-limit rules (required)
- Model availability list (required)

**How to test:**

1. Top up minimum (e.g. ¥10).
2. Send 20–30 requests in a row to check stability.
3. Use for 3–7 days; watch for sudden outages.
4. Confirm billing is accurate and not inflated.

**Self-hosted relay**: For long-term use, run your own; see [Self-Hosted Relay](references/self-hosted-relay.md).

---

### 3. Account Pool Services

**Idea**: Rotate across multiple accounts to spread rate-limit pressure.

| Pros                                 | Cons                              |
| ------------------------------------ | --------------------------------- |
| Higher concurrency, fewer limit hits | Possible data cross-contamination |
| Lower per-request cost               | Depends on provider stability     |
| Auto rotation, less hassle           | Shared context may leak info      |

**Use when**: High concurrency, bulk requests.
**Avoid when**: You need strict data isolation.

---

### 4. API Marketplaces

**Traits**: Platforms focused on selling APIs; often better prices than official or ad-hoc channels; good for comparison and procurement.

| Site           | Notes                                                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **bobdong.cn** | <https://bobdong.cn/> — Buy relatively cheap APIs; use as an extra channel alongside Xianyu and relays. Test with a small amount before larger spend. |

**Advice**: Same as Xianyu and relays — test availability and billing with a small amount first; increase spend only after confirming stability.

---

## Pro Tips

### Money-Saving Tactics

1. **Compare across channels**: Check Xianyu, [bobdong.cn](https://bobdong.cn/), Telegram groups, Discord; prices can differ a lot.
2. **Share costs**: Split an account-pool subscription with friends.
3. **Use promos**: Watch for new-user offers and first-top-up deals.
4. **Self-host relay**: For long-term use, a cheap VPS and your own relay is lowest cost.

### Safety Measures

**Technical:**

- **Key rotation**: Use multiple keys in turn to reduce load per key.
- **Load balancing**: Auto-failover to another channel when one fails.
- **Rate-limit buffer**: Never use 100% of limit; keep ~20% headroom.

**Operational:**

- Keep 2–3 active channels to avoid single point of failure.
- Log usage and spend; reconcile regularly.
- Auto-switch when latency spikes (circuit breaker).

Details: [Self-Hosted Relay](references/self-hosted-relay.md).

### Useful Tools

**CC-Switch** — Multi-channel manager

- **Repo**: <https://github.com/farion1231/cc-switch>
- **Features**: Centralised API config for Claude Code, Codex, Gemini CLI, etc.
- **Value**: One-click switch between official/relay; built-in speed test; multiple provider presets; MCP and skills management.
- **When to use**: Multiple relay services, frequent switching, or avoiding manual config edits.
- **Install**: Download from GitHub Releases for your OS (Windows/macOS/Linux).

---

## Quick Verification

**When you get a new channel, test like this:**

1. **Basic test** (5 min): Send 5–10 simple requests; check responses and format.
2. **Load test** (10 min): Send 30–50 requests; note errors and latency (investigate if >3s).
3. **Short-term watch** (1–3 days): Use normally; check stability and billing accuracy.
4. **Cost check**: Compare actual charges with stated pricing; stop if they don’t match.

---

## Troubleshooting

| Issue               | Likely cause          | Action                                    |
| ------------------- | --------------------- | ----------------------------------------- |
| Slow (>3s)          | Relay overloaded      | Try another time or switch channel        |
| 401                 | Key invalid or banned | Contact seller for new key or refund      |
| Incomplete response | Rate limit            | Lower frequency, add delay                |
| Model unavailable   | Provider block        | Try different model ID or channel         |
| Billing odd         | Inflated/fake billing | Screenshot evidence, escalate to platform |

**When something goes wrong:**

1. Screenshot all evidence (chat, receipts, errors).
2. Contact seller/provider first; allow ~24h response.
3. If unresolved, escalate to platform or switch channel.
4. For large amounts, consider legal options.

---

## On-Demand Loading

| Doc                                                           | Load when                                              |
| ------------------------------------------------------------- | ------------------------------------------------------ |
| [self-hosted-relay.md](references/self-hosted-relay.md)       | User needs to self-host relay or configure Workers/VPS |
| [verification-scripts.md](references/verification-scripts.md) | Verifying channel availability or running load tests   |
| [provider-matrix.md](references/provider-matrix.md)           | Systematically evaluating or comparing providers       |

---

## Validation Checklist (Recency)

After editing or reviewing this skill:

- [ ] Tone is practical and experience-based; not overly formal
- [ ] Core principles stress “save money but don’t get scammed”
- [ ] Quick start is clear with concrete steps
- [ ] Red-flag guide is actionable with clear signals
- [ ] Technical details reference sub-docs; no duplicated code blocks
- [ ] On-Demand Loading lists when each doc is used
- [ ] Headings and structure follow AGENTS.md format