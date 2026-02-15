## Guard Clause

Use guard clause and early return to reduce nesting.

```rust
// ✓ Early return, clear structure
fn process_user(user: Option<&User>) -> Option<ProcessedUser> {
  let user = user?;
  if !user.is_active { return None; }
  if user.age < 18 { return None; }
  handle_adult_user(user)
}

// ✗ Deep nesting destroys readability
fn process_user(user: Option<&User>) -> Option<ProcessedUser> {
  if let Some(user) = user {
    if user.is_active {
      if user.age >= 18 {
        return handle_adult_user(user);
      }
    }
  }
  None
}
```

## Multi-Condition Branching

When branches ≥3, use match or lookup table instead of if-else chains.

```rust
// ✓ Match expression, clear and maintainable
let message = match status_code {
  403 => "Permission denied",
  404 => "Not found",
  500 => "Server error",
  _ => "Unknown",
};

// ✗ If-else chain hard to maintain as conditions grow
let message = if status_code == 403 {
  "Permission denied"
} else if status_code == 404 {
  "Not found"
} else if status_code == 500 {
  "Server error"
} else {
  "Unknown"
};
```
