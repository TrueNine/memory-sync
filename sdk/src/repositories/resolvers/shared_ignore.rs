use serde::{Deserialize, Serialize};

use crate::native_script_runtime::proxy_public_path;
use crate::repositories::public_config::read_public_file;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedIgnoreInputOptions {
  pub workspace_dir: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub aindex: Option<super::gitignore::AindexInputOptions>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedIgnoreInputResult {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub ai_agent_ignore_config_files: Option<Vec<AIAgentIgnoreConfigFile>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AIAgentIgnoreConfigFile {
  pub file_name: String,
  pub content: String,
  pub source_path: String,
}

const AI_AGENT_IGNORE_TARGET_RELATIVE_PATHS: &[&str] = &[
  ".qoderignore",
  ".cursorignore",
  ".warpindexignore",
  ".aiignore",
  ".codeignore",
  ".codeiumignore",
  ".kiroignore",
  ".traeignore",
];

pub fn collect_shared_ignore(options_json: &str) -> Result<String, crate::CliError> {
  let options: SharedIgnoreInputOptions =
    serde_json::from_str(options_json).map_err(|e| crate::CliError::ConfigError(e.to_string()))?;

  let workspace_dir = options.workspace_dir;
  let aindex_dir_name = options
    .aindex
    .as_ref()
    .and_then(|a| a.dir.clone())
    .unwrap_or_else(|| "aindex".to_string());
  let aindex_dir = std::path::Path::new(&workspace_dir).join(&aindex_dir_name);
  let aindex_dir_str = aindex_dir.to_string_lossy().into_owned();

  let mut results: Vec<AIAgentIgnoreConfigFile> = Vec::new();

  for file_name in AI_AGENT_IGNORE_TARGET_RELATIVE_PATHS {
    if let Some(content) = read_public_file(&aindex_dir_str, file_name) {
      if !content.is_empty() {
        let proxied_name = proxy_public_path(file_name);
        let source_path = std::path::Path::new(&aindex_dir_str)
          .join("public")
          .join(&proxied_name)
          .to_string_lossy()
          .into_owned();
        results.push(AIAgentIgnoreConfigFile {
          file_name: file_name.to_string(),
          content,
          source_path,
        });
      }
    }
  }

  let result = SharedIgnoreInputResult {
    ai_agent_ignore_config_files: if results.is_empty() {
      None
    } else {
      Some(results)
    },
  };

  serde_json::to_string(&result).map_err(crate::CliError::SerializationError)
}
