## Transparent Exposure

Errors must be transparently propagated, preserving context, no suppression.

```rust
// ✓ Error propagation with context preserved
fn process_file(path: &str) -> Result<Data, ProcessError> {
  let file = File::open(path)
    .map_err(|e| ProcessError::FileOpen { path: path.into(), source: e })?;
  parse_content(&file)
    .map_err(|e| ProcessError::Parse { path: path.into(), source: e })
}

// ✗ Suppressing errors, losing diagnostic info
fn process_file(path: &str) -> Option<Data> {
  let file = File::open(path).ok()?;
  parse_content(&file).ok()
}
```

## No unwrap

Production code prohibits unwrap/expect, must handle explicitly.

```rust
// ✓ Explicit error handling
let config = load_config()
  .map_err(|e| AppError::ConfigLoad(e))?;

// ✗ Direct unwrap risks panic
let config = load_config().unwrap();
```
