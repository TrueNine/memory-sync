This standard is based on [Google API Design Guide](https://cloud.google.com/apis/design).

## Resource-Oriented Design

RESTful API centers on resources. Resources identified by URI, operations expressed via HTTP methods.

### Resource Naming

| Rule | Example |
|------|---------|
| Use plural nouns | `/users`, `/orders` |
| Use kebab-case | `/user-profiles`, `/order-items` |
| Express hierarchy via path | `/users/{userId}/orders` |
| Avoid verbs | ❌ `/getUsers` ✅ `/users` |

### Resource Hierarchy

```
/users                          # User collection
/users/{userId}                 # Single user
/users/{userId}/orders          # User's order collection
/users/{userId}/orders/{orderId} # User's single order
```

**Hierarchy depth**: Recommend max 3 levels. Consider flattening or query params when deeper.

## HTTP Method Semantics

| Method | Semantics | Idempotent | Safe | Request Body | Response Body |
|--------|-----------|:----------:|:----:|:------------:|:-------------:|
| GET | Retrieve resource | ✅ | ✅ | ❌ | ✅ |
| POST | Create resource | ❌ | ❌ | ✅ | ✅ |
| PUT | Full replace | ✅ | ❌ | ✅ | ✅ |
| PATCH | Partial update | ❌ | ❌ | ✅ | ✅ |
| DELETE | Delete resource | ✅ | ❌ | ❌ | ❌/✅ |

### Standard Operation Mapping

| Operation | HTTP Method | URI Pattern | Description |
|-----------|-------------|-------------|-------------|
| List | GET | `/resources` | Get resource list |
| Get | GET | `/resources/{id}` | Get single resource |
| Create | POST | `/resources` | Create new resource |
| Update | PUT | `/resources/{id}` | Full update resource |
| Patch | PATCH | `/resources/{id}` | Partial update resource |
| Delete | DELETE | `/resources/{id}` | Delete resource |

## Custom Methods

When standard methods insufficient, use custom methods:

```
POST /resources/{id}:action
```

**Good examples**:
```
POST /users/{userId}:activate
POST /orders/{orderId}:cancel
POST /documents/{docId}:translate
```

**Bad examples**:
```
POST /activateUser/{userId}
GET /orders/{orderId}/cancel
```

## Status Code Standard

### Success Responses

| Status Code | Scenario |
|-------------|----------|
| 200 OK | GET/PUT/PATCH success |
| 201 Created | POST creation success |
| 204 No Content | DELETE success, no response body |

### Client Errors

| Status Code | Scenario |
|-------------|----------|
| 400 Bad Request | Invalid request format, param validation failed |
| 401 Unauthorized | Unauthenticated |
| 403 Forbidden | Unauthorized |
| 404 Not Found | Resource not found |
| 409 Conflict | Resource conflict (e.g. duplicate creation) |
| 422 Unprocessable Entity | Business logic validation failed |

### Server Errors

| Status Code | Scenario |
|-------------|----------|
| 500 Internal Server Error | Internal server error |
| 502 Bad Gateway | Upstream service error |
| 503 Service Unavailable | Service temporarily unavailable |

## Error Response Format

See [api-error.md](api-error.md) standard.

## Query Parameter Standard

### Filtering

Use `filter` param with simple expressions:

```
GET /users?filter=status="active"
GET /orders?filter=createdAt>1703404800000
```

### Sorting

Use `orderBy` param:

```
GET /users?orderBy=createdAt desc
GET /orders?orderBy=amount asc,createdAt desc
```

### Field Selection

Use `fields` param to reduce response size:

```
GET /users/{id}?fields=id,name,email
```

### Pagination

See [pagination.md](pagination.md) standard.

## Versioning

Recommend URI path versioning:

```
/v1/users
/v2/users
```

**Version strategy**:
- Major version change indicates incompatible API changes
- After new version release, maintain old version for at least 6 months

## Request/Response Conventions

### Request Headers

| Header | Purpose |
|--------|---------|
| Content-Type | Request body format, typically `application/json` |
| Accept | Expected response format |
| Authorization | Auth credentials |
| X-Request-Id | Request trace ID |

### Response Headers

| Header | Purpose |
|--------|---------|
| Content-Type | Response body format |
| X-Request-Id | Request trace ID (echo) |
| X-RateLimit-* | Rate limit info |

## References

- [Google API Design Guide](https://cloud.google.com/apis/design)
- [Google API Improvement Proposals](https://google.aip.dev/)
