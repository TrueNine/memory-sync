use serde::Deserialize;
use serde_json::Value;

use crate::domain::config;
use crate::domain::plugin_shared::{
  SlashCommandPrompt, SlashCommandYAMLFrontMatter, PromptKind, RelativePath,
};
use crate::repositories::localized_reader::read_flat_files;

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommandInputOptions {
  workspace_dir: String,
  #[serde(default)]
  global_scope: Option<Value>,
}

fn validate_command_metadata(
  metadata: &serde_json::Map<String, Value>,
  file_path: &str,
) -> Result<(), String> {
  let prefix = if file_path.is_empty() {
    "".to_string()
  } else {
    format!(" in {file_path}")
  };

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

  Ok(())
}

fn build_command_prompt(
  entry: &crate::repositories::localized_reader::FlatFileEntry,
  dir: &str,
) -> Result<SlashCommandPrompt, crate::CliError> {
  let compiled = entry
    .compiled
    .as_ref()
    .ok_or_else(|| {
      crate::CliError::ConfigError(format!(
        "Missing compiled prompt: {}.mdx",
        entry.name
      ))
    })?;

  let file_path = format!("{}/{}.mdx", dir, entry.name);
  validate_command_metadata(&compiled.metadata, &file_path)
    .map_err(crate::CliError::ConfigError)?;

  let normalized_name = entry.name.replace('\\', "/");
  let slash_index = normalized_name.find('/');
  let parent_dir_name = slash_index.map(|i| &normalized_name[..i]);

  let file_name = match slash_index {
    Some(i) => &normalized_name[i + 1..],
    None => &normalized_name,
  };

  let base_name = file_name;
  let underscore_index = base_name.find('_');

  let command_prefix = parent_dir_name
    .or_else(|| underscore_index.map(|i| &base_name[..i]))
    .map(String::from);

  let command_name = match (parent_dir_name, underscore_index) {
    (Some(_), _) | (_, None) => base_name.to_string(),
    (None, Some(index)) => base_name[index + 1..].to_string(),
  };

  let global_only = match compiled.metadata.get("scope") {
    Some(Value::String(s)) if s == "global" => Some(true),
    _ => None,
  };

  let seri_name = compiled.metadata.get("seriName").and_then(|v| match v {
    Value::String(s) => Some(s.clone()),
    _ => None,
  });

  let yaml_front_matter = if compiled.metadata.is_empty() {
    None
  } else {
    Some(
      serde_json::from_value::<SlashCommandYAMLFrontMatter>(Value::Object(
        compiled.metadata.clone(),
      ))
      .map_err(|e| crate::CliError::ConfigError(e.to_string()))?,
    )
  };

  let content = compiled.content.clone();
  let length = content.len();

  Ok(SlashCommandPrompt {
    prompt_type: PromptKind::SlashCommand,
    content,
    length,
    dir: RelativePath::new(&format!("{}.mdx", entry.name), dir),
    command_name,
    series: command_prefix.clone(),
    seri_name,
    global_only,
    yaml_front_matter,
    raw_mdx_content: Some(compiled.raw_mdx.clone()),
    markdown_contents: None,
  })
}

pub fn collect_command(options_json: &str) -> Result<String, crate::CliError> {
  let options: CommandInputOptions =
    serde_json::from_str(options_json).map_err(|e| crate::CliError::ConfigError(e.to_string()))?;

  let workspace_dir = config::resolve_workspace_dir(&options.workspace_dir);
  let workspace_dir_str = workspace_dir.to_string_lossy().into_owned();
  let dir = config::resolve_workspace_aindex_commands_dir(&workspace_dir_str);

  let dir_str = dir.to_string_lossy().into_owned();

  let global_scope_json = options.global_scope.as_ref().map(|v| v.to_string());

  let entries = read_flat_files(&dir_str, global_scope_json.as_deref())?;

  let mut prompts: Vec<SlashCommandPrompt> = Vec::new();
  for entry in &entries {
    if entry.compiled.is_none() && (entry.src_zh.is_some() || entry.src_en.is_some()) {
      return Err(crate::CliError::ConfigError(format!(
        "Missing compiled prompt: {}.mdx",
        entry.name
      )));
    }
    if entry.compiled.is_some() {
      prompts.push(build_command_prompt(entry, &dir_str)?);
    }
  }

  #[derive(Debug, Clone, serde::Serialize)]
  #[serde(rename_all = "camelCase")]
  struct CommandResult {
    commands: Vec<SlashCommandPrompt>,
  }

  let result = CommandResult { commands: prompts };
  serde_json::to_string(&result).map_err(crate::CliError::SerializationError)
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;
  use tempfile::TempDir;

  #[test]
  fn collect_command_reads_compiled_mdx() {
    let tmp = TempDir::new().unwrap();
    let dir = tmp.path().join("aindex").join("commands");
    fs::create_dir_all(&dir).unwrap();
    fs::write(
      dir.join("demo.src.mdx"),
      "---\ndescription: src\n---\nCommand source",
    )
    .unwrap();
    fs::write(
      dir.join("demo.mdx"),
      "---\ndescription: compiled\n---\nexport const x = 1\n\nCommand compiled",
    )
    .unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_command(&options.to_string()).unwrap();
    let parsed: Value = serde_json::from_str(&result).unwrap();
    let commands = parsed["commands"].as_array().unwrap();
    assert_eq!(commands.len(), 1);
    assert_eq!(commands[0]["commandName"], "demo");
    assert!(
      commands[0]["content"]
        .as_str()
        .unwrap()
        .contains("Command compiled")
    );
    assert!(
      !commands[0]["content"]
        .as_str()
        .unwrap()
        .contains("export const x = 1")
    );
    assert_eq!(commands[0]["yamlFrontMatter"]["description"], "compiled");
  }

  #[test]
  fn collect_command_compiled_only() {
    let tmp = TempDir::new().unwrap();
    let dir = tmp.path().join("aindex").join("commands");
    fs::create_dir_all(&dir).unwrap();
    fs::write(
      dir.join("demo.mdx"),
      "---\ndescription: compiled only\n---\nCompiled only command",
    )
    .unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_command(&options.to_string()).unwrap();
    let parsed: Value = serde_json::from_str(&result).unwrap();
    let commands = parsed["commands"].as_array().unwrap();
    assert_eq!(commands.len(), 1);
    assert_eq!(commands[0]["commandName"], "demo");
    assert!(
      commands[0]["content"]
        .as_str()
        .unwrap()
        .contains("Compiled only command")
    );
  }

  #[test]
  fn collect_command_fails_on_source_only() {
    let tmp = TempDir::new().unwrap();
    let dir = tmp.path().join("aindex").join("commands");
    fs::create_dir_all(&dir).unwrap();
    fs::write(
      dir.join("demo.src.mdx"),
      "---\ndescription: source only\n---\nSource only command",
    )
    .unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_command(&options.to_string());
    assert!(result.is_err());
    let err = result.unwrap_err().to_string();
    assert!(
      err.contains("Missing compiled prompt: demo.mdx"),
      "expected file path in error message, got: {}",
      err
    );
  }

  #[test]
  fn collect_command_rejects_workspace_scope() {
    let tmp = TempDir::new().unwrap();
    let dir = tmp.path().join("aindex").join("commands");
    fs::create_dir_all(&dir).unwrap();
    fs::write(
      dir.join("demo.mdx"),
      "---\nscope: workspace\n---\nCompiled only command",
    )
    .unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_command(&options.to_string());
    assert!(result.is_err());
    assert!(
      result
        .unwrap_err()
        .to_string()
        .contains(r#"Field "scope" must be "project" or "global""#)
    );
  }

  #[test]
  fn collect_command_ignores_legacy_cn_sources() {
    let tmp = TempDir::new().unwrap();
    let dir = tmp.path().join("aindex").join("commands");
    fs::create_dir_all(&dir).unwrap();
    fs::write(
      dir.join("demo.cn.mdx"),
      "---\ndescription: legacy\n---\nLegacy command",
    )
    .unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_command(&options.to_string()).unwrap();
    let parsed: Value = serde_json::from_str(&result).unwrap();
    let commands = parsed["commands"].as_array().unwrap();
    assert!(commands.is_empty());
  }
}
