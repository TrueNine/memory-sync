## 05_API_Spec.md

API spec is the project's "contract", defining interface standards and data formats.

### Applicable Scenarios

- Backend API services
- Full-stack project backend
- Microservices architecture
- BFF layer

### Required Sections

```md
# API Specification

## Base Info
Base URL, version, authentication method.

## Common Conventions
Common conventions: response format, error codes, pagination.

## Endpoints
Endpoint list and detailed definitions.
```

### Optional Sections

```md
## Rate Limiting
Rate limiting strategy.

## Versioning Strategy
Version management strategy.

## WebSocket / SSE
Real-time communication interfaces.
```

### Maintenance Rules

- **Create timing**: After Architecture confirmed
- **Update timing**: When interfaces change
- **Prohibited**: Out of sync with actual code

### Example

```md
# API Specification

## Base Info
- Base URL: `/api/v1`
- Auth: Bearer Token (JWT)
- Content-Type: application/json

## Common Conventions

### Response Format
\`\`\`json
{
  "code": 0,
  "message": "success",
  "data": {}
}
\`\`\`

### Error Codes
| Code | Description |
|------|-------------|
| 0 | Success |
| 1001 | Unauthorized |
| 1002 | Forbidden |
| 2001 | Resource not found |
| 3001 | Validation error |

### Pagination
\`\`\`json
{
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100
  }
}
\`\`\`

## Endpoints

### Products

#### GET /products
Get product list.

**Query Parameters**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| page | int | No | Page number, default 1 |
| pageSize | int | No | Items per page, default 20 |
| keyword | string | No | Search keyword |

**Response**
\`\`\`json
{
  "code": 0,
  "data": [
    { "id": "uuid", "name": "Product A", "sku": "SKU001", "quantity": 100 }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 50 }
}
\`\`\`

#### POST /products
Create product.

**Request Body**
\`\`\`json
{
  "name": "Product name",
  "sku": "SKU001",
  "categoryId": "uuid"
}
\`\`\`
```
