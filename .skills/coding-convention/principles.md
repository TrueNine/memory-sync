## No Reinventing the Wheel

Investigate existing code before development, enforce component reuse, prefer extending over rewriting.

```rust
// ✓ Search existing implementations first, extend on existing service
impl AuthService {
  // Add new capability
  pub async fn enable_two_factor(&self, user_id: &str) -> Result<TwoFactorSetup, AuthError> {
    self.setup_two_factor(&user).await
  }
}

// ✗ Skip investigation and rewrite directly
struct NewAuthSystem;  // Rewriting without investigation violates reuse principle
```

## File Management

- Prefer editing existing files, avoid creating new ones
- New files must satisfy: independent functionality (≥100 lines), independent responsibility, architecture compliance

```rust
// ✓ Extend functions in existing utility file
// src/utils/helpers.rs
pub fn format_date(date: DateTime<Local>, format: &str) -> String {
  date.format(format).to_string()
}

// ✗ Create separate file for single function
// src/utils/date_utils.rs  <- Violates organization principle
```

## Format and Naming

- Follow `.editorconfig` configuration
- File naming prefers `PascalCase`/`camelCase`, optional `snake_case`, avoid `kebab-case`

| Language | Type Files | Utility Files |
|----------|------------|---------------|
| TypeScript | `UserAccount.ts` | `userUtils.ts` |
| Rust | `user_account.rs` | `user_utils.rs` |

## Toolchain

| Type | Preferred | Prohibited |
|------|-----------|------------|
| Node.js package manager | `pnpm` | `npm` |
| JVM/Android build | `gradle` | `maven` |

## Version Strategy

Don't solve problems by downgrading, prefer upgrading for better support and performance.

```rust
// ✓ When dependency issues occur, prioritize finding upgrade solutions
// Cargo.toml
[dependencies]
tokio = "1.35"  // Upgrade to latest stable

// ✗ Immediately downgrade on compatibility issues
// tokio = "1.20"  // May miss performance optimizations and security fixes
```
