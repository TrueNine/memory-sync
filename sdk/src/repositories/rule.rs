use serde::Deserialize;
use serde_json::Value;

use crate::domain::config;
use crate::domain::plugin_shared::{
  PromptKind, RelativePath, RulePrompt, RuleScope, RuleYAMLFrontMatter,
};
use crate::repositories::localized_reader::read_flat_files;

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuleInputOptions {
  workspace_dir: String,
  #[serde(default)]
  global_scope: Option<Value>,
}

fn validate_rule_metadata(
  metadata: &serde_json::Map<String, Value>,
  file_path: &str,
) -> Result<(), String> {
  let prefix = if file_path.is_empty() {
    "".to_string()
  } else {
    format!(" in {file_path}")
  };

  match metadata.get("paths") {
    Some(Value::Array(arr)) if !arr.is_empty() => {
      if !arr.iter().all(|v| v.is_string()) {
        return Err(format!(
          r#"Field "paths" must be an array of strings{prefix}"#
        ));
      }
    }
    _ => {
      return Err(format!(
        r#"Missing or empty required field "paths"{prefix}"#
      ));
    }
  }

  match metadata.get("description") {
    Some(Value::String(s)) if !s.is_empty() => {}
    _ => {
      return Err(format!(
        r#"Missing or empty required field "description"{prefix}"#
      ));
    }
  }

  if let Some(scope) = metadata.get("scope") {
    let s = match scope {
      Value::String(s) => s.as_str(),
      _ => {
        return Err(format!(
          r#"Field "scope" must be "project" or "global"{prefix}"#
        ));
      }
    };
    if s != "project" && s != "global" {
      return Err(format!(
        r#"Field "scope" must be "project" or "global"{prefix}"#
      ));
    }
  }

  if let Some(seri_name) = metadata.get("seriName") {
    match seri_name {
      Value::String(_) => {}
      Value::Array(arr) => {
        if !arr.iter().all(|v| v.is_string()) {
          return Err(format!(
            r#"Field "seriName" must be a string or string array{prefix}"#
          ));
        }
      }
      _ => {
        return Err(format!(
          r#"Field "seriName" must be a string or string array{prefix}"#
        ));
      }
    }
  }

  Ok(())
}

fn build_rule_prompt(
  entry: &crate::repositories::localized_reader::FlatFileEntry,
  dir: &str,
) -> Result<RulePrompt, crate::CliError> {
  let compiled = entry
    .compiled
    .as_ref()
    .ok_or_else(|| crate::CliError::ConfigError("Missing compiled prompt".to_string()))?;

  let file_path = format!("{}/{}.mdx", dir, entry.name);
  validate_rule_metadata(&compiled.metadata, &file_path).map_err(crate::CliError::ConfigError)?;

  let normalized_name = entry.name.replace('\\', "/");
  let prefix = normalized_name.split('/').next().unwrap_or("").to_string();
  let rule_name = normalized_name
    .split('/')
    .last()
    .unwrap_or(&normalized_name)
    .to_string();

  let paths: Vec<String> = match compiled.metadata.get("paths") {
    Some(Value::Array(arr)) => arr
      .iter()
      .filter_map(|v| v.as_str().map(String::from))
      .collect(),
    _ => vec![],
  };

  let scope: RuleScope = match compiled.metadata.get("scope") {
    Some(Value::String(s)) if s == "global" => RuleScope::Global,
    _ => RuleScope::Project,
  };

  let seri_name = compiled.metadata.get("seriName").and_then(|v| match v {
    Value::String(s) => Some(s.clone()),
    _ => None,
  });

  let yaml_front_matter = if compiled.metadata.is_empty() {
    None
  } else {
    Some(
      serde_json::from_value::<RuleYAMLFrontMatter>(Value::Object(compiled.metadata.clone()))
        .map_err(|e| crate::CliError::ConfigError(e.to_string()))?,
    )
  };

  let content = compiled.content.clone();
  let length = content.len();

  let entry_path = std::path::Path::new(&entry.name);
  let dir_relative = entry_path
    .parent()
    .map(|p| p.to_string_lossy().into_owned())
    .unwrap_or_default();

  Ok(RulePrompt {
    prompt_type: PromptKind::Rule,
    content,
    length,
    dir: RelativePath::new(&dir_relative, dir),
    series: prefix,
    rule_name,
    paths,
    scope,
    seri_name,
    yaml_front_matter,
    raw_mdx_content: Some(compiled.raw_mdx.clone()),
    markdown_contents: None,
  })
}

pub fn collect_rule(options_json: &str) -> Result<String, crate::CliError> {
  let options: RuleInputOptions =
    serde_json::from_str(options_json).map_err(|e| crate::CliError::ConfigError(e.to_string()))?;

  let workspace_dir = config::resolve_workspace_dir(&options.workspace_dir);
  let workspace_dir_str = workspace_dir.to_string_lossy().into_owned();
  let dir = config::resolve_workspace_aindex_rules_dir(&workspace_dir_str);

  let dir_str = dir.to_string_lossy().into_owned();

  let global_scope_json = options.global_scope.as_ref().map(|v| v.to_string());

  let entries = read_flat_files(&dir_str, global_scope_json.as_deref())?;

  let mut prompts: Vec<RulePrompt> = Vec::new();
  for entry in &entries {
    if entry.compiled.is_none() && (entry.src_zh.is_some() || entry.src_en.is_some()) {
      return Err(crate::CliError::ConfigError(
        "Missing compiled prompt".to_string(),
      ));
    }
    if entry.compiled.is_some() {
      prompts.push(build_rule_prompt(entry, &dir_str)?);
    }
  }

  #[derive(Debug, Clone, serde::Serialize)]
  #[serde(rename_all = "camelCase")]
  struct RuleResult {
    rules: Vec<RulePrompt>,
  }

  let result = RuleResult { rules: prompts };
  serde_json::to_string(&result).map_err(crate::CliError::SerializationError)
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;
  use tempfile::TempDir;

  #[test]
  fn collect_rule_fails_on_source_only() {
    let tmp = TempDir::new().unwrap();
    let dir = tmp.path().join("aindex").join("rules").join("qa");
    fs::create_dir_all(&dir).unwrap();
    fs::write(
      dir.join("boot.src.mdx"),
      "---\ndescription: source only\npaths:\n  - '**/*.ts'\n---\nSource only rule",
    )
    .unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_rule(&options.to_string());
    assert!(result.is_err());
    assert!(
      result
        .unwrap_err()
        .to_string()
        .contains("Missing compiled prompt")
    );
  }

  #[test]
  fn collect_rule_loads_compiled_only() {
    let tmp = TempDir::new().unwrap();
    let dir = tmp.path().join("aindex").join("rules").join("qa");
    fs::create_dir_all(&dir).unwrap();
    fs::write(
      dir.join("boot.mdx"),
      "---\nscope: global\ndescription: Compiled only rule\npaths:\n  - '**/*.ts'\n---\nCompiled only rule",
    )
    .unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_rule(&options.to_string()).unwrap();
    let parsed: Value = serde_json::from_str(&result).unwrap();
    let rules = parsed["rules"].as_array().unwrap();
    assert_eq!(rules.len(), 1);
    assert_eq!(rules[0]["ruleName"], "boot");
    assert_eq!(rules[0]["scope"], "global");
    assert_eq!(
      rules[0]["paths"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap())
        .collect::<Vec<_>>(),
      vec!["**/*.ts"]
    );
  }

  #[test]
  fn collect_rule_rejects_workspace_scope() {
    let tmp = TempDir::new().unwrap();
    let dir = tmp.path().join("aindex").join("rules").join("qa");
    fs::create_dir_all(&dir).unwrap();
    fs::write(
      dir.join("boot.mdx"),
      "---\nscope: workspace\ndescription: Compiled only rule\npaths:\n  - '**/*.ts'\n---\nCompiled only rule",
    )
    .unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_rule(&options.to_string());
    assert!(result.is_err());
    assert!(
      result
        .unwrap_err()
        .to_string()
        .contains(r#"Field "scope" must be "project" or "global""#)
    );
  }
}
