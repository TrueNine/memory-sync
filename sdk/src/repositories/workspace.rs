use serde::{Deserialize, Serialize};

use crate::domain::config;
use crate::domain::plugin_shared::{RootPath, Workspace};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInputOptions {
  pub workspace_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInputResult {
  pub workspace: Workspace,
  pub aindex_dir: String,
}

pub fn collect_workspace(options_json: &str) -> Result<String, crate::CliError> {
  let options: WorkspaceInputOptions =
    serde_json::from_str(options_json).map_err(|e| crate::CliError::ConfigError(e.to_string()))?;

  let workspace_dir = config::resolve_workspace_dir(&options.workspace_dir);
  let workspace_dir_str = workspace_dir.to_string_lossy().into_owned();
  let aindex_dir = config::resolve_workspace_aindex_dir(&workspace_dir_str);
  let aindex_dir_str = aindex_dir.to_string_lossy().into_owned();

  let workspace = Workspace {
    directory: RootPath::new(&workspace_dir_str),
    projects: vec![],
  };

  let result = WorkspaceInputResult {
    workspace,
    aindex_dir: aindex_dir_str,
  };

  serde_json::to_string(&result).map_err(crate::CliError::SerializationError)
}
