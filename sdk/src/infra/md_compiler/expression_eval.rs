//! Expression evaluation for MDX `{expression}` syntax.
//!
//! Supports:
//! - Simple variable references: `{os.platform}`, `{profile.name}`
//! - String literals: `"hello"`, `'world'`
//! - Ternary expressions: `{condition ? "a" : "b"}`
//! - Equality comparisons: `{os.platform === "win32"}`
//! - Boolean literals: `{true}`, `{false}`

use serde_json::Value;
use std::collections::HashMap;

/// Evaluation scope — a map of variable names to their values.
pub type EvaluationScope = HashMap<String, Value>;

/// Evaluate an expression string within a scope.
///
/// The expression is the content inside `{...}` braces (without the braces).
pub fn evaluate_expression(expression: &str, scope: &EvaluationScope) -> Result<String, String> {
  let trimmed = expression.trim();

  if trimmed.is_empty() {
    return Ok(String::new());
  }

  // Check for string literal first
  if let Some(s) = try_parse_string_literal(trimmed) {
    return Ok(s);
  }

  // Check for boolean/number/null/undefined literal before variable references
  if let Some(s) = try_parse_literal(trimmed) {
    return Ok(s);
  }

  // Check for simple variable reference: identifier.property.nested
  if is_simple_reference(trimmed) {
    return evaluate_simple_reference(trimmed, scope);
  }

  // Check for ternary expression: condition ? consequent : alternate
  if let Some(result) = try_evaluate_ternary(trimmed, scope) {
    return result;
  }

  // Check for equality comparison: a === b, a !== b, a == b, a != b
  if let Some(result) = try_evaluate_comparison(trimmed, scope) {
    return result;
  }

  // Check for logical NOT: !expr
  if let Some(rest) = trimmed.strip_prefix('!') {
    let inner = evaluate_expression(rest.trim(), scope)?;
    let is_truthy = is_truthy_str(&inner);
    return Ok((!is_truthy).to_string());
  }

  // Fallback: try as a simple reference anyway
  evaluate_simple_reference(trimmed, scope)
}

/// Check if a string is a simple variable reference (e.g., `os.platform`).
fn is_simple_reference(s: &str) -> bool {
  // Match: identifier(.property)*
  let mut chars = s.chars().peekable();

  // First char must be letter, underscore, or $
  match chars.peek() {
    Some(c) if c.is_ascii_alphabetic() || *c == '_' || *c == '$' => {
      chars.next();
    }
    _ => return false,
  }

  for c in chars {
    if c.is_ascii_alphanumeric() || c == '_' || c == '$' || c == '.' {
      continue;
    }
    return false;
  }

  true
}

/// Evaluate a simple variable reference like `os.platform` or `profile.name`.
fn evaluate_simple_reference(reference: &str, scope: &EvaluationScope) -> Result<String, String> {
  let parts: Vec<&str> = reference.split('.').collect();
  let root_var = parts[0];

  let root_value = scope.get(root_var).ok_or_else(|| {
    format!(
      "Undefined namespace: \"{}\" in expression \"{}\"",
      root_var, reference
    )
  })?;

  let mut value = root_value.clone();
  for &prop in &parts[1..] {
    match &value {
      Value::Object(map) => {
        value = map.get(prop).cloned().ok_or_else(|| {
          format!(
            "Undefined variable: \"{}\" in expression \"{}\"",
            prop, reference
          )
        })?;
      }
      Value::Null => {
        return Err(format!(
          "Cannot read property \"{}\" of null in expression \"{}\"",
          prop, reference
        ));
      }
      _ => {
        return Err(format!(
          "Cannot read property \"{}\" of {} in expression \"{}\"",
          prop,
          value_type_name(&value),
          reference
        ));
      }
    }
  }

  Ok(convert_to_string(&value))
}

/// Try to parse a string literal ("..." or '...').
fn try_parse_string_literal(s: &str) -> Option<String> {
  if ((s.starts_with('"') && s.ends_with('"')) || (s.starts_with('\'') && s.ends_with('\'')))
    && s.len() >= 2
  {
    return Some(s[1..s.len() - 1].to_string());
  }
  None
}

/// Try to parse a boolean or number literal.
fn try_parse_literal(s: &str) -> Option<String> {
  match s {
    "true" => Some("true".to_string()),
    "false" => Some("false".to_string()),
    "null" | "undefined" => Some(String::new()),
    _ => {
      // Try number
      if s.parse::<f64>().is_ok() {
        Some(s.to_string())
      } else {
        None
      }
    }
  }
}

/// Try to evaluate a ternary expression: `condition ? consequent : alternate`.
fn try_evaluate_ternary(s: &str, scope: &EvaluationScope) -> Option<Result<String, String>> {
  // Find the `?` that's not inside quotes or nested expressions
  let question_pos = find_operator(s, '?')?;
  let condition = s[..question_pos].trim();
  let rest = s[question_pos + 1..].trim();

  // Find the `:` in the rest
  let colon_pos = find_operator(rest, ':')?;
  let consequent = rest[..colon_pos].trim();
  let alternate = rest[colon_pos + 1..].trim();

  // Evaluate condition
  let cond_result = match evaluate_expression(condition, scope) {
    Ok(v) => v,
    Err(e) => return Some(Err(e)),
  };

  let is_true = is_truthy_str(&cond_result);

  let branch = if is_true { consequent } else { alternate };
  Some(evaluate_expression(branch, scope))
}

/// Try to evaluate a comparison expression.
fn try_evaluate_comparison(s: &str, scope: &EvaluationScope) -> Option<Result<String, String>> {
  // Check for ===, !==, ==, !=
  for (op, negate) in &[("===", false), ("!==", true), ("==", false), ("!=", true)] {
    if let Some(pos) = s.find(op) {
      let left = s[..pos].trim();
      let right = s[pos + op.len()..].trim();

      let left_val = match evaluate_expression(left, scope) {
        Ok(v) => v,
        Err(e) => return Some(Err(e)),
      };
      let right_val = match evaluate_expression(right, scope) {
        Ok(v) => v,
        Err(e) => return Some(Err(e)),
      };

      let equal = left_val == right_val;
      let result = if *negate { !equal } else { equal };
      return Some(Ok(result.to_string()));
    }
  }
  None
}

/// Find the position of an operator character, skipping quoted strings and nested braces/parens.
fn find_operator(s: &str, op: char) -> Option<usize> {
  let mut depth = 0i32;
  let mut in_single_quote = false;
  let mut in_double_quote = false;
  let mut in_backtick = false;

  for (i, c) in s.char_indices() {
    match c {
      '\'' if !in_double_quote && !in_backtick => in_single_quote = !in_single_quote,
      '"' if !in_single_quote && !in_backtick => in_double_quote = !in_double_quote,
      '`' if !in_single_quote && !in_double_quote => in_backtick = !in_backtick,
      '(' | '{' | '[' if !in_single_quote && !in_double_quote && !in_backtick => depth += 1,
      ')' | '}' | ']' if !in_single_quote && !in_double_quote && !in_backtick => depth -= 1,
      c2 if c2 == op && depth == 0 && !in_single_quote && !in_double_quote && !in_backtick => {
        return Some(i);
      }
      _ => {}
    }
  }
  None
}

/// Check if a string value is "truthy" (non-empty, not "false", not "0", not "undefined", not "null").
fn is_truthy_str(s: &str) -> bool {
  !s.is_empty() && s != "false" && s != "0" && s != "undefined" && s != "null"
}

/// Get a human-readable type name for a JSON value.
fn value_type_name(v: &Value) -> &'static str {
  match v {
    Value::Null => "null",
    Value::Bool(_) => "boolean",
    Value::Number(_) => "number",
    Value::String(_) => "string",
    Value::Array(_) => "array",
    Value::Object(_) => "object",
  }
}

/// Convert a JSON value to its string representation.
pub fn convert_to_string(value: &Value) -> String {
  match value {
    Value::Null => String::new(),
    Value::Bool(b) => b.to_string(),
    Value::Number(n) => n.to_string(),
    Value::String(s) => s.clone(),
    Value::Array(_) | Value::Object(_) => {
      serde_json::to_string(value).unwrap_or_else(|_| String::new())
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  fn make_scope() -> EvaluationScope {
    let mut scope = EvaluationScope::new();
    scope.insert("os".into(), json!({"platform": "win32", "arch": "x64"}));
    scope.insert(
      "profile".into(),
      json!({"name": "TrueNine", "username": "truenine"}),
    );
    scope.insert("tool".into(), json!({"name": "cursor"}));
    scope
  }

  #[test]
  fn test_simple_reference() {
    let scope = make_scope();
    assert_eq!(evaluate_expression("os.platform", &scope).unwrap(), "win32");
    assert_eq!(
      evaluate_expression("profile.name", &scope).unwrap(),
      "TrueNine"
    );
    assert_eq!(evaluate_expression("tool.name", &scope).unwrap(), "cursor");
  }

  #[test]
  fn test_undefined_namespace() {
    let scope = make_scope();
    assert!(evaluate_expression("unknown.prop", &scope).is_err());
  }

  #[test]
  fn test_undefined_property() {
    let scope = make_scope();
    assert!(evaluate_expression("os.nonexistent", &scope).is_err());
  }

  #[test]
  fn test_string_literal() {
    let scope = make_scope();
    assert_eq!(evaluate_expression("\"hello\"", &scope).unwrap(), "hello");
    assert_eq!(evaluate_expression("'world'", &scope).unwrap(), "world");
  }

  #[test]
  fn test_boolean_literal() {
    let scope = make_scope();
    assert_eq!(evaluate_expression("true", &scope).unwrap(), "true");
    assert_eq!(evaluate_expression("false", &scope).unwrap(), "false");
  }

  #[test]
  fn test_empty_expression() {
    let scope = make_scope();
    assert_eq!(evaluate_expression("", &scope).unwrap(), "");
    assert_eq!(evaluate_expression("  ", &scope).unwrap(), "");
  }

  #[test]
  fn test_ternary() {
    let scope = make_scope();
    assert_eq!(
      evaluate_expression(
        "os.platform === \"win32\" ? \"windows\" : \"other\"",
        &scope
      )
      .unwrap(),
      "windows"
    );
    assert_eq!(
      evaluate_expression("os.platform === \"linux\" ? \"linux\" : \"other\"", &scope).unwrap(),
      "other"
    );
  }

  #[test]
  fn test_equality() {
    let scope = make_scope();
    assert_eq!(
      evaluate_expression("os.platform === \"win32\"", &scope).unwrap(),
      "true"
    );
    assert_eq!(
      evaluate_expression("os.platform !== \"win32\"", &scope).unwrap(),
      "false"
    );
    assert_eq!(
      evaluate_expression("os.platform === \"linux\"", &scope).unwrap(),
      "false"
    );
  }

  #[test]
  fn test_negation() {
    let scope = make_scope();
    // evaluate_expression("true") -> "true", is_truthy("true") -> true, !true -> false
    assert_eq!(evaluate_expression("!true", &scope).unwrap(), "false");
    assert_eq!(evaluate_expression("!false", &scope).unwrap(), "true");
  }

  #[test]
  fn test_null_undefined() {
    let scope = make_scope();
    assert_eq!(evaluate_expression("null", &scope).unwrap(), "");
    assert_eq!(evaluate_expression("undefined", &scope).unwrap(), "");
  }

  #[test]
  fn test_number_literal() {
    let scope = make_scope();
    assert_eq!(evaluate_expression("42", &scope).unwrap(), "42");
    assert_eq!(evaluate_expression("3.14", &scope).unwrap(), "3.14");
  }

  #[test]
  fn test_convert_to_string() {
    assert_eq!(convert_to_string(&Value::Null), "");
    assert_eq!(convert_to_string(&Value::Bool(true)), "true");
    assert_eq!(convert_to_string(&json!(42)), "42");
    assert_eq!(convert_to_string(&json!("hello")), "hello");
  }
}
