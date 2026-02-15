## 07_Data_Dictionary.md

Data dictionary is the project's "glossary", defining data standards and business terminology.

### Applicable Scenarios

- Multi-system integration
- Teams needing unified terminology
- Data-intensive projects
- Cross-department collaboration

### Required Sections

```md
# Data Dictionary

## Business Glossary
Business term definitions.

## Data Standards
Data format standards.

## Enumerations
Enumeration value definitions.
```

### Optional Sections

```md
## Field Naming Conventions
Field naming conventions.

## Data Validation Rules
Data validation rules.
```

### Maintenance Rules

- **Create timing**: After Product Context confirmed
- **Update timing**: When adding business concepts, data format changes
- **Prohibited**: Vague or conflicting term definitions

### Example

```md
# Data Dictionary

## Business Glossary

| Term | Definition |
|------|------------|
| SKU | Stock Keeping Unit, unique product identifier |
| Safety Stock | Minimum inventory level triggering reorder alert |
| Turnover Rate | Inventory turnover = Cost of Sales / Average Inventory |
| Stock In | Product enters warehouse, increases inventory |
| Stock Out | Product leaves warehouse, decreases inventory |
| Stocktake | Reconcile actual inventory with system inventory |

## Data Standards

### ID Format
- Primary key: UUID v4
- Business number: prefix + date + sequence (e.g. IN20240115001)

### Datetime
- Storage: UTC timestamp with timezone
- Transmission: ISO 8601 (2024-01-15T08:00:00Z)
- Display: Local timezone formatted

### Money
- Storage: Smallest unit integer (cents)
- Transmission: String, avoid precision loss
- Display: Formatted (¥1,234.56)

### Phone
- Storage: E.164 format (+8613800138000)
- Display: Local format (138-0013-8000)

## Enumerations

### StockRecordType
Inventory change type.

| Value | Label | Description |
|-------|-------|-------------|
| IN | Stock In | Purchase in, return in |
| OUT | Stock Out | Sales out, transfer out |
| ADJUST | Adjustment | Stocktake adjustment, loss |

### OrderStatus
Order status.

| Value | Label | Next States |
|-------|-------|-------------|
| PENDING | Pending | CONFIRMED, CANCELLED |
| CONFIRMED | Confirmed | PROCESSING, CANCELLED |
| PROCESSING | Processing | COMPLETED, CANCELLED |
| COMPLETED | Completed | - |
| CANCELLED | Cancelled | - |

### UserRole
User role.

| Value | Label | Permissions |
|-------|-------|-------------|
| ADMIN | Admin | All permissions |
| MANAGER | Warehouse Manager | Approval, reports, management |
| OPERATOR | Operator | Stock in/out operations |
| VIEWER | Viewer | Read-only |
```
