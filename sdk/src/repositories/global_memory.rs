use serde::Deserialize;

use crate::domain::config;
use crate::domain::plugin_shared::{FilePathKind, GlobalMemoryPrompt, PromptKind, RelativePath};
use crate::repositories::prompt_artifact::read_prompt_artifact;

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GlobalMemoryInputOptions {
  workspace_dir: String,
  #[serde(default)]
  global_scope: Option<serde_json::Value>,
}

pub fn collect_global_memory(options_json: &str) -> Result<String, crate::CliError> {
  let options: GlobalMemoryInputOptions =
    serde_json::from_str(options_json).map_err(|e| crate::CliError::ConfigError(e.to_string()))?;

  let workspace_dir = config::resolve_workspace_dir(&options.workspace_dir);
  let workspace_dir_str = workspace_dir.to_string_lossy().into_owned();
  let global_prompt_file =
    config::resolve_workspace_aindex_global_prompt_compiled_file(&workspace_dir_str);

  let global_prompt_file_str = global_prompt_file.to_string_lossy().into_owned();

  if !global_prompt_file.exists() {
    return Ok("{}".to_string());
  }

  if !global_prompt_file.is_file() {
    return Ok("{}".to_string());
  }

  let global_scope_json = options.global_scope.as_ref().map(|v| v.to_string());

  let artifact = read_prompt_artifact(
    &global_prompt_file_str,
    "dist",
    global_scope_json.as_deref(),
  )
  .map_err(|e| crate::CliError::ConfigError(e))?;

  let content = artifact.content.clone();
  let length = content.len();

  let runtime = config::resolve_runtime_environment();
  let effective_home_dir = runtime
    .effective_home_dir
    .or(runtime.native_home_dir)
    .map(|p| p.to_string_lossy().into_owned())
    .unwrap_or_else(|| ".".to_string());

  let parent_directory_path = serde_json::json!({
    "type": "userHome",
    "directory": {
      "pathKind": "Relative",
      "path": "",
      "basePath": effective_home_dir
    }
  });

  let global_memory = GlobalMemoryPrompt {
    prompt_type: PromptKind::GlobalMemory,
    content: content.clone(),
    length,
    file_path_kind: FilePathKind::Relative,
    dir: RelativePath::new(
      global_prompt_file
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("global.mdx"),
      &global_prompt_file
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default(),
    ),
    raw_front_matter: Some(artifact.raw_mdx.clone()),
    markdown_contents: None,
    parent_directory_path: Some(parent_directory_path),
    raw_content: Some(artifact.raw_mdx),
  };

  #[derive(Debug, Clone, serde::Serialize)]
  #[serde(rename_all = "camelCase")]
  struct GlobalMemoryResult {
    global_memory: GlobalMemoryPrompt,
  }

  let result = GlobalMemoryResult { global_memory };
  serde_json::to_string(&result).map_err(crate::CliError::SerializationError)
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;
  use tempfile::TempDir;

  #[test]
  fn collect_global_memory_empty_when_missing() {
    let tmp = TempDir::new().unwrap();
    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_global_memory(&options.to_string()).unwrap();
    assert_eq!(result, "{}");
  }

  #[test]
  fn collect_global_memory_reads_compiled_file() {
    let tmp = TempDir::new().unwrap();
    let dir = tmp.path().join("aindex");
    fs::create_dir_all(&dir).unwrap();
    fs::write(
      dir.join("global.src.mdx"),
      "---\ndescription: src\n---\nGlobal source",
    )
    .unwrap();
    fs::write(
      dir.join("global.mdx"),
      "---\ndescription: global memory\n---\nGlobal memory content",
    )
    .unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_global_memory(&options.to_string()).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
    assert_eq!(parsed["globalMemory"]["content"], "Global memory content");
  }
}
