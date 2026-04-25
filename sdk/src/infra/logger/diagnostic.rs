//! Structured diagnostic types for error/warning/fatal logging.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// Input schema for a structured diagnostic log entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticInput {
  pub code: String,
  pub title: String,
  pub root_cause: Vec<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub exact_fix: Option<Vec<String>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub possible_fixes: Option<Vec<Vec<String>>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub details: Option<Map<String, Value>>,
}

/// Full diagnostic record including runtime metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticRecord {
  pub code: String,
  pub title: String,
  pub root_cause: Vec<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub exact_fix: Option<Vec<String>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub possible_fixes: Option<Vec<Vec<String>>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub details: Option<Map<String, Value>>,
  pub level: String,
  pub namespace: String,
  pub copy_text: Vec<String>,
}

/// Validate a diagnostic input for required fields.
pub fn validate_diagnostic_input(input: &DiagnosticInput) -> Result<(), Vec<String>> {
  let mut errors: Vec<String> = Vec::new();

  if input.code.trim().is_empty() {
    errors.push("code must be a non-empty string".to_string());
  }
  if input.title.trim().is_empty() {
    errors.push("title must be a non-empty string".to_string());
  }
  if input.root_cause.is_empty() {
    errors.push("rootCause must contain at least one line".to_string());
  }

  if let Some(lines) = &input.exact_fix
    && lines.is_empty()
  {
    errors.push("exactFix must contain at least one line when provided".to_string());
  }

  if let Some(fixes) = &input.possible_fixes {
    if fixes.is_empty() {
      errors.push("possibleFixes must contain at least one fix when provided".to_string());
    }
    for (index, lines) in fixes.iter().enumerate() {
      if lines.is_empty() {
        errors.push(format!(
          "possibleFixes[{index}] must contain at least one line"
        ));
      }
    }
  }

  if errors.is_empty() {
    Ok(())
  } else {
    Err(errors)
  }
}

/// Build copy-friendly text from a diagnostic record.
pub fn build_copy_text(record: &DiagnosticRecord) -> Vec<String> {
  let mut lines = vec![record.title.clone()];

  append_section(&mut lines, "**What happened**", &record.root_cause, None);

  if let Some(exact_fix) = &record.exact_fix {
    append_section(&mut lines, "**Do this**", exact_fix, None);
  }

  if let Some(possible_fixes) = &record.possible_fixes
    && !possible_fixes.is_empty()
  {
    if !lines.is_empty() {
      lines.push(String::new());
    }
    lines.push("**Try this if needed**".to_string());
    for (index, fix) in possible_fixes.iter().enumerate() {
      let mut iter = fix.iter();
      if let Some(first) = iter.next() {
        lines.push(format!("  {}. {}", index + 1, first));
      }
      for entry in iter {
        lines.push(format!("     {entry}"));
      }
    }
  }

  if let Some(details) = &record.details
    && !details.is_empty()
  {
    if !lines.is_empty() {
      lines.push(String::new());
    }
    lines.push("**Context**".to_string());
    let mut detail_lines = value_to_markdown_lines(&Value::Object(details.clone()));
    for line in &mut detail_lines {
      line.insert_str(0, "  ");
    }
    lines.extend(detail_lines);
  }

  lines
}

fn append_section(
  lines: &mut Vec<String>,
  title: &str,
  entries: &[String],
  numbered: Option<usize>,
) {
  if entries.is_empty() {
    return;
  }

  if !lines.is_empty() {
    lines.push(String::new());
  }

  if !title.is_empty() {
    lines.push(title.to_string());
  }

  match numbered {
    Some(number) => {
      let mut iter = entries.iter();
      if let Some(first) = iter.next() {
        lines.push(format!("  {number}. {first}"));
      }
      for entry in iter {
        lines.push(format!("     {entry}"));
      }
    }
    None => {
      for entry in entries {
        lines.push(format!("  - {entry}"));
      }
    }
  }
}

use super::formatter::value_to_markdown_lines;

/// Build a diagnostic record from validated input.
pub fn record_from_input(namespace: &str, level: &str, input: DiagnosticInput) -> DiagnosticRecord {
  let mut record = DiagnosticRecord {
    code: input.code.trim().to_string(),
    title: input.title.trim().to_string(),
    root_cause: input.root_cause,
    exact_fix: input.exact_fix,
    possible_fixes: input.possible_fixes,
    details: input.details,
    level: level.to_string(),
    namespace: namespace.to_string(),
    copy_text: Vec::new(),
  };
  record.copy_text = build_copy_text(&record);
  record
}

/// Build a fallback diagnostic record for invalid input.
pub fn invalid_record(
  namespace: &str,
  level: &str,
  raw_payload: Value,
  validation_errors: &[String],
) -> DiagnosticRecord {
  let mut details = Map::new();
  details.insert("rawPayload".to_string(), raw_payload);
  details.insert(
    "validationErrors".to_string(),
    Value::Array(
      validation_errors
        .iter()
        .map(|e| Value::String(e.clone()))
        .collect(),
    ),
  );

  let mut record = DiagnosticRecord {
    code: "LOGGER_DIAGNOSTIC_SCHEMA_INVALID".to_string(),
    title: "Logger diagnostic payload is invalid".to_string(),
    root_cause: vec![
      "The logger received a warn/error/fatal payload that does not match the required diagnostic schema.".to_string(),
      format!("Validation issues: {}", validation_errors.join("; ")),
    ],
    exact_fix: Some(vec![
      "Pass a diagnostic object with non-empty code, title, and rootCause fields.".to_string(),
      "Keep exactFix and each possibleFixes entry as non-empty string arrays when they are present.".to_string(),
    ]),
    possible_fixes: None,
    details: Some(details),
    level: level.to_string(),
    namespace: namespace.to_string(),
    copy_text: Vec::new(),
  };
  record.copy_text = build_copy_text(&record);
  record
}
