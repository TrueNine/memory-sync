This standard defines unified API error response format.

## Core Principles

1. **Status code is semantic** - Error type fully expressed in HTTP status code
2. **JSON format** - Response body uses `application/json`
3. **Minimal structure** - Minimize fields, avoid redundant nesting

## Error Response Format

```typescript
interface ErrorResponse {
  code: number       // HTTP status code (required)
  msg?: string       // Error description (optional)
  data?: unknown     // Additional data (optional)
}
```

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| code | number | ✅ | HTTP status code, matches response header |
| msg | string | ❌ | Human-readable error description |
| data | unknown | ❌ | Additional info, e.g. field validation details |

## Status Code Mapping

### Client Errors (4xx)

| code | Scenario | msg Example |
|------|----------|-------------|
| 400 | Invalid request format, param validation failed | `"Invalid request body"` |
| 401 | Unauthenticated | `"Authentication required"` |
| 403 | Unauthorized | `"Permission denied"` |
| 404 | Resource not found | `"Resource not found"` |
| 409 | Resource conflict | `"Resource already exists"` |
| 422 | Business logic validation failed | `"Validation failed"` |
| 429 | Too many requests | `"Too many requests"` |

### Server Errors (5xx)

| code | Scenario | msg Example |
|------|----------|-------------|
| 500 | Internal server error | `"Internal server error"` |
| 502 | Upstream service error | `"Bad gateway"` |
| 503 | Service unavailable | `"Service unavailable"` |

## Response Examples

### Basic Error

```json
{
  "code": 404,
  "msg": "User not found"
}
```

### With Additional Data

```json
{
  "code": 422,
  "msg": "Validation failed",
  "data": {
    "fields": [
      { "field": "email", "error": "Invalid email format" },
      { "field": "age", "error": "Must be positive integer" }
    ]
  }
}
```

### Minimal Form

```json
{
  "code": 401
}
```

## Implementation Notes

1. **Status code consistency** - `code` field must match HTTP response status code
2. **msg i18n** - Recommend English, frontend translates as needed
3. **data structure freedom** - Define per business needs, no enforced format
4. **Production env** - 5xx error msg should not expose internal implementation details
