use serde::{Deserialize, Serialize};

use crate::repositories::public_config::read_public_file;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitExcludeInputOptions {
  pub workspace_dir: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitExcludeInputResult {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub shadow_git_exclude: Option<String>,
}

pub fn collect_git_exclude(options_json: &str) -> Result<String, crate::CliError> {
  let options: GitExcludeInputOptions =
    serde_json::from_str(options_json).map_err(|e| crate::CliError::ConfigError(e.to_string()))?;

  let aindex_dir = crate::domain::config::resolve_workspace_aindex_dir(&options.workspace_dir);
  let aindex_dir_str = aindex_dir.to_string_lossy().into_owned();

  let content = read_public_file(&aindex_dir_str, ".git/info/exclude");

  let result = GitExcludeInputResult {
    shadow_git_exclude: content.filter(|c| !c.is_empty()),
  };

  serde_json::to_string(&result).map_err(crate::CliError::SerializationError)
}
