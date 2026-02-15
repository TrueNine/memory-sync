# Timestamp Standard

## Instant (Point in Time)

| Type | Format | Description |
|------|--------|-------------|
| Instant | number | Millisecond timestamp, UTC-based, timezone-independent |

**Core principles**:
- All instants use **millisecond timestamp** (Unix Epoch Milliseconds)
- Timestamp is timezone-independent, frontend converts for display per user timezone
- Database storage, API transmission, frontend-backend exchange all use number type

## Duration

| Type | Format | Example | Description |
|------|--------|---------|-------------|
| Duration | string | `PT1H30M` | ISO 8601 duration format |

**Duration format**: `PT[n]H[n]M[n]S`
- `PT1H` - 1 hour
- `PT30M` - 30 minutes
- `PT1H30M` - 1 hour 30 minutes
- `PT45S` - 45 seconds

## Period

| Type | Format | Example | Description |
|------|--------|---------|-------------|
| Period | string | `P1Y2M3D` | ISO 8601 date period format |

**Period format**: `P[n]Y[n]M[n]D`
- `P1Y` - 1 year
- `P2M` - 2 months
- `P1Y2M3D` - 1 year 2 months 3 days

## Usage Examples

### Interface Definition

```typescript
interface Event {
  createdAt: number
  updatedAt: number
  duration: string
  validPeriod: string
}
```

### Frontend Conversion

```typescript
// Timestamp to local display
const display = new Date(timestamp).toLocaleString()

// Local time to timestamp
const timestamp = new Date().getTime()
```

### Backend Processing (Kotlin/Java)

```kotlin
// Instant and timestamp conversion
val instant = Instant.ofEpochMilli(timestamp)
val timestamp = instant.toEpochMilli()

// Duration parsing
val duration = Duration.parse("PT1H30M")

// Period parsing
val period = Period.parse("P1Y2M")
```

## Design Philosophy

- **Timestamp**: Number type is efficient, no timezone ambiguity, cross-language compatible
- **Duration/Period**: ISO 8601 standard format, clear semantics, native parsing support
