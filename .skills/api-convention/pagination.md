# Pagination Interface Standard

## Pagination Parameter Standard

### Request Parameters

| Param | Full Name | Type | Default | Description |
|-------|-----------|------|---------|-------------|
| `o` | offset | number | 0 | Offset, starting position |
| `s` | size | number | 42 | Page size |

### Response Parameters

| Param | Full Name | Type | Description |
|-------|-----------|------|-------------|
| `d` | data | array | Data list |
| `t` | total | number | Total count |
| `p` | pages | number | Total pages |

## Usage Examples

### Backend Interface

```typescript
interface PageQuery {
  o?: number
  s?: number
}

interface PageResult<T> {
  d: T[]
  t: number
  p: number
}
```

### Frontend Query Params

```
GET /api/users?o=0&s=42
GET /api/users?o=42&s=42
```

### Frontend Pagination Calculation

```typescript
// Page number to offset
const offset = (page - 1) * size

// Offset to page number
const page = Math.floor(offset / size) + 1

// Total pages
const totalPages = Math.ceil(total / size)
```

## Design Philosophy

Single-letter param naming minimizes network transfer. Significantly reduces bandwidth in high-frequency call scenarios.
