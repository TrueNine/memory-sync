use std::path::Path;

use serde::Deserialize;
use serde_json::Value;

use crate::domain::config;
use crate::domain::plugin_shared::{
  FastCommandPrompt, FastCommandYAMLFrontMatter, PromptKind, RelativePath,
};
use crate::repositories::localized_reader::read_flat_files;

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommandInputOptions {
  workspace_dir: String,
  #[serde(default)]
  aindex: Option<CommandAindexInput>,
  #[serde(default)]
  global_scope: Option<Value>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommandAindexInput {
  #[serde(default)]
  dir: Option<String>,
  #[serde(default)]
  commands: Option<CommandPair>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommandPair {
  #[serde(default)]
  src: Option<String>,
  #[serde(default)]
  dist: Option<String>,
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
  dist_dir: &str,
) -> Result<FastCommandPrompt, crate::CliError> {
  let dist = entry
    .dist
    .as_ref()
    .ok_or_else(|| crate::CliError::ConfigError("Missing compiled dist prompt".to_string()))?;

  let file_path = format!("{}/{}.mdx", dist_dir, entry.name);
  validate_command_metadata(&dist.metadata, &file_path).map_err(crate::CliError::ConfigError)?;

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

  let command_name = if parent_dir_name.is_some() || underscore_index.is_none() {
    base_name.to_string()
  } else {
    base_name[underscore_index.unwrap() + 1..].to_string()
  };

  let global_only = match dist.metadata.get("scope") {
    Some(Value::String(s)) if s == "global" => Some(true),
    _ => None,
  };

  let seri_name = dist.metadata.get("seriName").and_then(|v| match v {
    Value::String(s) => Some(s.clone()),
    _ => None,
  });

  let yaml_front_matter = if dist.metadata.is_empty() {
    None
  } else {
    Some(
      serde_json::from_value::<FastCommandYAMLFrontMatter>(Value::Object(dist.metadata.clone()))
        .map_err(|e| crate::CliError::ConfigError(e.to_string()))?,
    )
  };

  let content = dist.content.clone();
  let length = content.len();

  Ok(FastCommandPrompt {
    prompt_type: PromptKind::FastCommand,
    content,
    length,
    dir: RelativePath::new(&format!("{}.mdx", entry.name), dist_dir),
    command_name,
    series: command_prefix.clone(),
    seri_name,
    global_only,
    yaml_front_matter,
    raw_mdx_content: Some(dist.raw_mdx.clone()),
    markdown_contents: None,
  })
}

pub fn collect_command(options_json: &str) -> Result<String, crate::CliError> {
  let options: CommandInputOptions =
    serde_json::from_str(options_json).map_err(|e| crate::CliError::ConfigError(e.to_string()))?;

  let workspace_dir = config::resolve_workspace_dir(&options.workspace_dir);
  let workspace_dir_str = workspace_dir.to_string_lossy().into_owned();

  let aindex_dir_name = options
    .aindex
    .as_ref()
    .and_then(|a| a.dir.clone())
    .unwrap_or_else(|| "aindex".to_string());
  let aindex_dir = Path::new(&workspace_dir_str).join(aindex_dir_name);
  let _aindex_dir_str = aindex_dir.to_string_lossy().into_owned();

  let src_dir = aindex_dir.join(
    options
      .aindex
      .as_ref()
      .and_then(|a| a.commands.as_ref().and_then(|r| r.src.clone()))
      .unwrap_or_else(|| "commands".to_string()),
  );
  let dist_dir = aindex_dir.join(
    options
      .aindex
      .as_ref()
      .and_then(|a| a.commands.as_ref().and_then(|r| r.dist.clone()))
      .unwrap_or_else(|| "dist/commands".to_string()),
  );

  let src_dir_str = src_dir.to_string_lossy().into_owned();
  let dist_dir_str = dist_dir.to_string_lossy().into_owned();

  let global_scope_json = options.global_scope.as_ref().map(|v| v.to_string());

  let entries = read_flat_files(&src_dir_str, &dist_dir_str, global_scope_json.as_deref())?;

  let mut prompts: Vec<FastCommandPrompt> = Vec::new();
  for entry in &entries {
    if entry.dist.is_none() && (entry.src_zh.is_some() || entry.src_en.is_some()) {
      return Err(crate::CliError::ConfigError(
        "Missing compiled dist prompt".to_string(),
      ));
    }
    if entry.dist.is_some() {
      prompts.push(build_command_prompt(entry, &dist_dir_str)?);
    }
  }

  #[derive(Debug, Clone, serde::Serialize)]
  #[serde(rename_all = "camelCase")]
  struct CommandResult {
    commands: Vec<FastCommandPrompt>,
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
  fn collect_command_prefers_dist_and_compiles_mdx() {
    let tmp = TempDir::new().unwrap();
    let src_dir = tmp.path().join("aindex").join("commands");
    let dist_dir = tmp.path().join("aindex").join("dist").join("commands");
    fs::create_dir_all(&src_dir).unwrap();
    fs::create_dir_all(&dist_dir).unwrap();
    fs::write(
      src_dir.join("demo.src.mdx"),
      "---\ndescription: src\n---\nCommand source",
    )
    .unwrap();
    fs::write(
      dist_dir.join("demo.mdx"),
      "---\ndescription: dist\n---\nexport const x = 1\n\nCommand dist",
    )
    .unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_command(&options.to_string()).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
    let commands = parsed["commands"].as_array().unwrap();
    assert_eq!(commands.len(), 1);
    assert_eq!(commands[0]["commandName"], "demo");
    assert!(
      commands[0]["content"]
        .as_str()
        .unwrap()
        .contains("Command dist")
    );
    assert!(
      !commands[0]["content"]
        .as_str()
        .unwrap()
        .contains("export const x = 1")
    );
    assert_eq!(commands[0]["yamlFrontMatter"]["description"], "dist");
    assert!(
      commands[0]["rawMdxContent"]
        .as_str()
        .unwrap()
        .contains("export const x = 1")
    );
  }

  #[test]
  fn collect_command_dist_only() {
    let tmp = TempDir::new().unwrap();
    let dist_dir = tmp.path().join("aindex").join("dist").join("commands");
    fs::create_dir_all(&dist_dir).unwrap();
    fs::write(
      dist_dir.join("demo.mdx"),
      "---\ndescription: dist only\n---\nDist only command",
    )
    .unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_command(&options.to_string()).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
    let commands = parsed["commands"].as_array().unwrap();
    assert_eq!(commands.len(), 1);
    assert_eq!(commands[0]["commandName"], "demo");
    assert!(
      commands[0]["content"]
        .as_str()
        .unwrap()
        .contains("Dist only command")
    );
  }

  #[test]
  fn collect_command_fails_on_source_only() {
    let tmp = TempDir::new().unwrap();
    let src_dir = tmp.path().join("aindex").join("commands");
    fs::create_dir_all(&src_dir).unwrap();
    fs::write(
      src_dir.join("demo.src.mdx"),
      "---\ndescription: source only\n---\nSource only command",
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
        .contains("Missing compiled dist prompt")
    );
  }

  #[test]
  fn collect_command_rejects_workspace_scope() {
    let tmp = TempDir::new().unwrap();
    let dist_dir = tmp.path().join("aindex").join("dist").join("commands");
    fs::create_dir_all(&dist_dir).unwrap();
    fs::write(
      dist_dir.join("demo.mdx"),
      "---\nscope: workspace\n---\nDist only command",
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
    let src_dir = tmp.path().join("aindex").join("commands");
    fs::create_dir_all(&src_dir).unwrap();
    fs::write(
      src_dir.join("demo.cn.mdx"),
      "---\ndescription: legacy\n---\nLegacy command",
    )
    .unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_command(&options.to_string()).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
    let commands = parsed["commands"].as_array().unwrap();
    assert!(commands.is_empty());
  }
}
