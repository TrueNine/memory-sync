use serde::Deserialize;
use serde_json::{Map, Value};
use std::collections::{BTreeSet, HashMap};

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildTomlDocumentOptions {
  pub field_order: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildPromptTomlArtifactOptions {
  pub content: String,
  pub body_field_name: String,
  pub front_matter: Option<Map<String, Value>>,
  pub field_name_map: Option<HashMap<String, String>>,
  pub excluded_keys: Option<Vec<String>>,
  pub extra_fields: Option<Map<String, Value>>,
  pub field_order: Option<Vec<String>>,
}

fn normalize_value(value: Value) -> Option<Value> {
  match value {
    Value::Null => None,
    Value::Bool(_) | Value::Number(_) | Value::String(_) => Some(value),
    Value::Array(items) => Some(Value::Array(
      items.into_iter().filter_map(normalize_value).collect(),
    )),
    Value::Object(map) => {
      let normalized = map
        .into_iter()
        .filter_map(|(key, value)| normalize_value(value).map(|value| (key, value)))
        .collect::<Map<String, Value>>();
      Some(Value::Object(normalized))
    }
  }
}

fn is_bare_toml_key(key: &str) -> bool {
  key
    .chars()
    .all(|character| character.is_ascii_alphanumeric() || character == '_' || character == '-')
}

fn format_toml_key(key: &str) -> String {
  if is_bare_toml_key(key) {
    key.to_string()
  } else {
    serde_json::to_string(key).unwrap_or_else(|_| format!("\"{key}\""))
  }
}

fn format_toml_key_path(path: &[String]) -> String {
  path
    .iter()
    .map(|part| format_toml_key(part))
    .collect::<Vec<_>>()
    .join(".")
}

fn format_multiline_toml_string(value: &str) -> String {
  let normalized = value.replace("\r\n", "\n").replace('\r', "\n");
  let mut escaped = String::new();

  for character in normalized.chars() {
    match character {
      '\\' => escaped.push_str("\\\\"),
      '"' => escaped.push_str("\\\""),
      '\u{0008}' => escaped.push_str("\\b"),
      '\t' => escaped.push_str("\\t"),
      '\u{000C}' => escaped.push_str("\\f"),
      '\n' => escaped.push('\n'),
      value if value < '\u{0020}' => {
        escaped.push_str(&format!("\\u{:04x}", value as u32));
      }
      value => escaped.push(value),
    }
  }

  format!("\"\"\"\n{escaped}\"\"\"")
}

fn format_toml_scalar(value: &Value) -> Result<String, String> {
  match value {
    Value::String(text) => {
      if text.contains('\n') || text.contains('\r') {
        Ok(format_multiline_toml_string(text))
      } else {
        serde_json::to_string(text).map_err(|error| error.to_string())
      }
    }
    Value::Number(number) => Ok(number.to_string()),
    Value::Bool(boolean) => Ok(boolean.to_string()),
    Value::Null => Err("TOML scalar cannot be null".into()),
    Value::Array(_) | Value::Object(_) => Err("TOML scalar cannot be an array or object".into()),
  }
}

fn is_array_of_tables(items: &[Value]) -> bool {
  !items.is_empty() && items.iter().all(|item| matches!(item, Value::Object(_)))
}

fn format_inline_toml_value(value: &Value) -> Result<String, String> {
  match value {
    Value::Null => Err("TOML inline value cannot be null or undefined".into()),
    Value::Bool(_) | Value::Number(_) | Value::String(_) => format_toml_scalar(value),
    Value::Array(items) => {
      if is_array_of_tables(items) {
        return Err("TOML inline arrays of tables are not supported".into());
      }

      let mut formatted = Vec::with_capacity(items.len());
      for item in items {
        formatted.push(format_inline_toml_value(item)?);
      }
      Ok(format!("[{}]", formatted.join(", ")))
    }
    Value::Object(map) => {
      let mut entries = Vec::with_capacity(map.len());
      for (key, value) in map {
        entries.push(format!(
          "{} = {}",
          format_toml_key(key),
          format_inline_toml_value(value)?
        ));
      }
      Ok(format!("{{ {} }}", entries.join(", ")))
    }
  }
}

fn order_entries(
  entries: Vec<(String, Value)>,
  field_order: Option<&[String]>,
) -> Vec<(String, Value)> {
  let Some(field_order) = field_order.filter(|keys| !keys.is_empty()) else {
    return entries;
  };

  let priority = field_order
    .iter()
    .enumerate()
    .map(|(index, key)| (key.as_str(), index))
    .collect::<HashMap<_, _>>();

  let mut entries = entries;
  entries.sort_by(|(left_key, _), (right_key, _)| {
    match (
      priority.get(left_key.as_str()),
      priority.get(right_key.as_str()),
    ) {
      (Some(left_priority), Some(right_priority)) => left_priority.cmp(right_priority),
      (Some(_), None) => std::cmp::Ordering::Less,
      (None, Some(_)) => std::cmp::Ordering::Greater,
      (None, None) => left_key.cmp(right_key),
    }
  });
  entries
}

fn render_toml_section(
  path: &[String],
  value: &Map<String, Value>,
  field_order: Option<&[String]>,
  emit_table_header: bool,
) -> Result<Vec<String>, String> {
  let ordered_entries = order_entries(
    value
      .iter()
      .map(|(key, value)| (key.clone(), value.clone()))
      .collect(),
    field_order,
  );

  let mut scalar_entries: Vec<(String, Value)> = Vec::new();
  let mut table_entries: Vec<(String, Map<String, Value>)> = Vec::new();
  let mut array_table_entries: Vec<(String, Vec<Map<String, Value>>)> = Vec::new();

  for (key, entry_value) in ordered_entries {
    match entry_value {
      Value::Null => {}
      Value::Array(items) if is_array_of_tables(&items) => {
        let tables = items
          .into_iter()
          .filter_map(|item| match item {
            Value::Object(map) => Some(map),
            _ => None,
          })
          .collect::<Vec<_>>();
        array_table_entries.push((key, tables));
      }
      Value::Object(map) => table_entries.push((key, map)),
      other => scalar_entries.push((key, other)),
    }
  }

  let mut lines = Vec::new();
  if emit_table_header && !path.is_empty() {
    lines.push(format!("[{}]", format_toml_key_path(path)));
  }

  for (key, value) in scalar_entries {
    lines.push(format!(
      "{} = {}",
      format_toml_key(&key),
      format_inline_toml_value(&value)?
    ));
  }

  for (key, table_value) in table_entries {
    if !lines.is_empty() {
      lines.push(String::new());
    }

    let mut next_path = path.to_vec();
    next_path.push(key);
    lines.extend(render_toml_section(
      &next_path,
      &table_value,
      field_order,
      true,
    )?);
  }

  for (key, table_values) in array_table_entries {
    for table_value in table_values {
      if !lines.is_empty() {
        lines.push(String::new());
      }

      let mut next_path = path.to_vec();
      next_path.push(key.clone());
      lines.push(format!("[[{}]]", format_toml_key_path(&next_path)));
      lines.extend(render_toml_section(
        &next_path,
        &table_value,
        field_order,
        false,
      )?);
    }
  }

  Ok(lines)
}

pub fn build_toml_document(
  value: Value,
  options: Option<BuildTomlDocumentOptions>,
) -> Result<String, String> {
  let normalized =
    normalize_value(value).ok_or_else(|| "TOML document root must be an object".to_string())?;
  let Value::Object(map) = normalized else {
    return Err("TOML document root must be an object".into());
  };

  let field_order = options
    .as_ref()
    .and_then(|options| options.field_order.as_deref());
  let lines = render_toml_section(&[], &map, field_order, true)?;
  Ok(lines.join("\n"))
}

pub fn build_prompt_toml_artifact(
  options: BuildPromptTomlArtifactOptions,
) -> Result<String, String> {
  let mut excluded_keys = BTreeSet::new();
  if let Some(keys) = &options.excluded_keys {
    excluded_keys.extend(keys.iter().cloned());
  }

  let mut mapped_fields = Map::new();
  if let Some(front_matter) = options.front_matter {
    for (key, value) in front_matter {
      if excluded_keys.contains(&key) {
        continue;
      }

      let mapped_key = options
        .field_name_map
        .as_ref()
        .and_then(|map| map.get(&key))
        .cloned()
        .unwrap_or(key);
      mapped_fields.insert(mapped_key, value);
    }
  }

  if let Some(extra_fields) = options.extra_fields {
    for (key, value) in extra_fields {
      mapped_fields.insert(key, value);
    }
  }

  mapped_fields.insert(options.body_field_name, Value::String(options.content));

  build_toml_document(
    Value::Object(mapped_fields),
    Some(BuildTomlDocumentOptions {
      field_order: options.field_order,
    }),
  )
}
