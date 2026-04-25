use serde_json::Value;

use super::core::{Event, LogLevel, Span};

/// Format an event as Markdown.
pub fn format_event(event: &Event) -> String {
  match event.level {
    LogLevel::Warn | LogLevel::Error | LogLevel::Fatal => format_diagnostic_event(event),
    _ => format_message_event(event),
  }
}

/// Format a span enter event.
pub fn format_span_enter(span: &Span) -> String {
  format!("### {} started", span.name)
}

/// Format a span exit event with duration.
pub fn format_span_exit(span: &Span) -> String {
  let duration_ms = span.duration().as_millis();
  format!(
    "### {} completed\n  - duration: {}ms",
    span.name, duration_ms
  )
}

fn format_message_event(event: &Event) -> String {
  let (title, meta_lines) = extract_message_and_meta(&event.message, event.meta.as_ref());
  let mut lines = Vec::new();

  if let Some(title) = title {
    if title.contains('\n') {
      let parts: Vec<&str> = title.splitn(2, '\n').collect();
      lines.push(format!("### {}", parts[0].trim()));
      lines.push(String::new());
      lines.push(parts[1].trim().to_string());
    } else {
      lines.push(format!("### {}", title));
    }
  } else {
    lines.push("### Details".to_string());
  }

  if !meta_lines.is_empty() {
    lines.push(String::new());
    lines.extend(meta_lines);
  }

  lines.join("\n")
}

fn format_diagnostic_event(event: &Event) -> String {
  // For diagnostic events, the message contains the serialized DiagnosticRecord
  let record: super::diagnostic::DiagnosticRecord =
    match serde_json::from_value(event.message.clone()) {
      Ok(r) => r,
      Err(_) => return "### Diagnostic error\n  - failed to parse diagnostic record".to_string(),
    };

  let mut lines = vec![format!("### {}", record.title)];

  if !record.root_cause.is_empty() {
    lines.push(String::new());
    lines.push("**What happened**".to_string());
    for cause in &record.root_cause {
      lines.push(format!("  - {cause}"));
    }
  }

  if let Some(exact_fix) = &record.exact_fix
    && !exact_fix.is_empty()
  {
    lines.push(String::new());
    lines.push("**Do this**".to_string());
    for fix in exact_fix {
      lines.push(format!("  - {fix}"));
    }
  }

  if let Some(possible_fixes) = &record.possible_fixes
    && !possible_fixes.is_empty()
  {
    lines.push(String::new());
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
    lines.push(String::new());
    lines.push("**Context**".to_string());
    let mut detail_lines = value_to_markdown_lines(&Value::Object(details.clone()));
    for line in &mut detail_lines {
      line.insert_str(0, "  ");
    }
    lines.extend(detail_lines);
  }

  lines.join("\n")
}

fn extract_message_and_meta(
  message: &Value,
  meta: Option<&Value>,
) -> (Option<String>, Vec<String>) {
  let (msg, mut lines) = match message {
    Value::String(s) => (Some(s.clone()), Vec::new()),
    Value::Object(map) => {
      if let Some(Value::String(msg)) = map.get("message") {
        let mut remainder = map.clone();
        remainder.remove("message");
        let lines = if remainder.is_empty() {
          Vec::new()
        } else {
          value_to_markdown_lines(&Value::Object(remainder))
        };
        (Some(msg.clone()), lines)
      } else if map.len() == 1 {
        let (key, val) = map.iter().next().unwrap();
        match val {
          Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => {
            (Some(format!("{key}: {}", scalar_to_text(val))), Vec::new())
          }
          Value::Array(items) if !items.is_empty() => {
            (Some(key.clone()), value_to_markdown_lines(val))
          }
          Value::Object(obj) if !obj.is_empty() => {
            (Some(key.clone()), value_to_markdown_lines(val))
          }
          _ => (None, value_to_markdown_lines(message)),
        }
      } else {
        (None, value_to_markdown_lines(message))
      }
    }
    _ => (None, value_to_markdown_lines(message)),
  };

  // Merge external meta if provided
  if let Some(meta_val) = meta
    && !meta_val.is_null()
  {
    let meta_lines = value_to_markdown_lines(meta_val);
    lines.extend(meta_lines);
  }

  (msg, lines)
}

pub(crate) fn value_to_markdown_lines(value: &Value) -> Vec<String> {
  let mut lines = Vec::new();
  append_markdown_value(&mut lines, None, value, 0);
  lines
}

pub(crate) fn append_markdown_value(
  lines: &mut Vec<String>,
  label: Option<&str>,
  value: &Value,
  depth: usize,
) {
  let prefix = "  ".repeat(depth);
  let bullet = format!("{prefix}- ");

  match value {
    Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => match label {
      Some(name) => {
        lines.push(format!("{bullet}{name}: {}", scalar_to_text(value)));
      }
      None => {
        lines.push(format!("{bullet}{}", scalar_to_text(value)));
      }
    },
    Value::Array(items) => {
      if items.is_empty() {
        match label {
          Some(name) => lines.push(format!("{bullet}{name}: []")),
          None => lines.push(format!("{bullet}[]")),
        }
        return;
      }

      if let Some(name) = label {
        lines.push(format!("{bullet}{name}:"));
        for item in items {
          append_markdown_value(lines, None, item, depth + 1);
        }
        return;
      }

      for item in items {
        append_markdown_value(lines, None, item, depth);
      }
    }
    Value::Object(map) => {
      if map.is_empty() {
        match label {
          Some(name) => lines.push(format!("{bullet}{name}: {{}}")),
          None => lines.push(format!("{bullet}{{}}")),
        }
        return;
      }

      if let Some(name) = label {
        lines.push(format!("{bullet}{name}:"));
        for (key, nested) in map {
          append_markdown_value(lines, Some(key), nested, depth + 1);
        }
        return;
      }

      for (key, nested) in map {
        append_markdown_value(lines, Some(key), nested, depth);
      }
    }
  }
}

pub(crate) fn scalar_to_text(value: &Value) -> String {
  match value {
    Value::Null => "null".to_string(),
    Value::Bool(b) => b.to_string(),
    Value::Number(n) => n.to_string(),
    Value::String(s) => s.clone(),
    Value::Array(_) | Value::Object(_) => serde_json::to_string(value).unwrap_or_default(),
  }
}
