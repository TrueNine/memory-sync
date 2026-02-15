# Provider Evaluation Matrix

Evaluation criteria and scoring framework for channels.

## Scoring Dimensions

| Dimension | Weight | Description |
|----------|--------|-------------|
| **Stability** | 30% | Service uptime and failure frequency |
| **Speed** | 20% | Time to first byte and overall latency |
| **Price** | 20% | Discount level versus official pricing |
| **Security** | 20% | Data privacy and account risk |
| **Support** | 10% | Customer support responsiveness and problem resolution |

## Scoring Standards

### Stability

| Grade | Description | Score |
|-------|-------------|-------|
| A | Monthly availability > 99%, no unplanned outages | 90–100 |
| B | Monthly availability > 95%, occasional short outages | 70–89 |
| C | Monthly availability > 90%, noticeable disconnections | 50–69 |
| D | Frequently unavailable, hard to rely on | < 50 |

### Speed

| Grade | Time to First Byte | Total Time | Score |
|-------|--------------------|-----------|-------|
| A | < 1s | < 3s | 90–100 |
| B | 1–2s | 3–5s | 70–89 |
| C | 2–4s | 5–10s | 50–69 |
| D | > 4s | > 10s | < 50 |

### Price

| Grade | Versus Official Price | Score |
|-------|-----------------------|-------|
| A | < 50% | 90–100 |
| B | 50–70% | 70–89 |
| C | 70–85% | 50–69 |
| D | > 85% | < 50 |

### Security

| Check Item | Points |
|-----------|--------|
| No sensitive identity information required | +20 |
| Supports HTTPS/TLS 1.3 | +20 |
| No request-content logging/inspection statement | +20 |
| API keys can be rotated by the user | +20 |
| Transparent usage statistics and billing | +20 |

## Evaluation Template

```markdown
### Channel Name: [Name]

**Basic Information:**
- Type: [Second-hand / Relay / Account Pool]
- Discovery Date: [YYYY-MM-DD]
- Last Verified: [YYYY-MM-DD]

**Scores:**
| Dimension | Raw Score | Weighted |
|----------|-----------|----------|
| Stability | 85 | 25.5 |
| Speed | 75 | 15.0 |
| Price | 90 | 18.0 |
| Security | 60 | 12.0 |
| Support | 70 | 7.0 |
| **Total** | - | **77.5** |

**Notes:**
- [Key observations]
- [Known limitations]
```

## Minimum Acceptable Thresholds

- Total score < 60: Not recommended
- Total score 60–75: Can be used as a backup
- Total score > 75: Can be used as a primary channel

Single-dimension hard limits:

- Stability < 50: Reject regardless of total score
- Security < 40: Only use for non-sensitive testing

