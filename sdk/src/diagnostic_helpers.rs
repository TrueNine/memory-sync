use crate::logger::LoggerDiagnosticInput;
use serde_json::{Map, Value};

pub(crate) fn line(value: impl Into<String>) -> Vec<String> {
  vec![value.into()]
}

pub(crate) fn diagnostic(
  code: impl Into<String>,
  title: impl Into<String>,
  root_cause: Vec<String>,
  exact_fix: Option<Vec<String>>,
  possible_fixes: Option<Vec<Vec<String>>>,
  details: Option<Map<String, Value>>,
) -> LoggerDiagnosticInput {
  LoggerDiagnosticInput {
    code: code.into(),
    title: title.into(),
    root_cause,
    exact_fix,
    possible_fixes,
    details,
  }
}

pub(crate) fn optional_details(value: Value) -> Option<Map<String, Value>> {
  match value {
    Value::Object(map) if !map.is_empty() => Some(map),
    Value::Object(_) => None,
    _ => None,
  }
}
