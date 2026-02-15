## Comment Standards

Comments placed above statements, end-of-line comments prohibited.

```rust
// ✓ Comment independent above statement
// Calculate total with discount applied
let total = price * quantity * discount;

// ✗ End-of-line comments hard to read, easily missed
let total = price * quantity * discount; // with discount
```

## Brace Standards

Conditionals and loops must use braces, even for single lines.

```rust
// ✓ Mandatory braces
if is_valid {
  process();
}

// ✗ Omitting braces error-prone during iteration
if is_valid
  process();
```

## Format Configuration

Follow `.editorconfig` configuration file.
