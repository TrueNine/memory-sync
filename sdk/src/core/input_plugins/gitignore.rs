use serde::{Deserialize, Serialize};

use crate::core::input_plugins::public_config::read_public_file;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitIgnoreInputOptions {
  pub workspace_dir: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub aindex: Option<AindexInputOptions>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AindexInputOptions {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub dir: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitIgnoreInputResult {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub global_git_ignore: Option<String>,
}

pub fn collect_gitignore(options_json: &str) -> Result<String, crate::CliError> {
  let options: GitIgnoreInputOptions =
    serde_json::from_str(options_json).map_err(|e| crate::CliError::ConfigError(e.to_string()))?;

  let workspace_dir = options.workspace_dir;
  let aindex_dir_name = options
    .aindex
    .as_ref()
    .and_then(|a| a.dir.clone())
    .unwrap_or_else(|| "aindex".to_string());
  let aindex_dir = std::path::Path::new(&workspace_dir).join(&aindex_dir_name);
  let aindex_dir_str = aindex_dir.to_string_lossy().into_owned();

  let content = read_public_file(&aindex_dir_str, ".gitignore");

  let result = GitIgnoreInputResult {
    global_git_ignore: content.filter(|c| !c.is_empty()),
  };

  serde_json::to_string(&result).map_err(crate::CliError::SerializationError)
}
