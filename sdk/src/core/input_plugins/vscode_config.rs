use serde::{Deserialize, Serialize};

use crate::core::input_plugins::public_config::read_public_ide_config_file;
use crate::core::plugin_shared::IDEKind;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VSCodeConfigInputOptions {
  pub workspace_dir: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub aindex: Option<super::gitignore::AindexInputOptions>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VSCodeConfigInputResult {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub vscode_config_files: Option<Vec<crate::core::plugin_shared::ProjectIDEConfigFile>>,
}

pub fn collect_vscode_config(options_json: &str) -> Result<String, crate::CliError> {
  let options: VSCodeConfigInputOptions =
    serde_json::from_str(options_json).map_err(|e| crate::CliError::ConfigError(e.to_string()))?;

  let workspace_dir = options.workspace_dir;
  let aindex_dir_name = options
    .aindex
    .as_ref()
    .and_then(|a| a.dir.clone())
    .unwrap_or_else(|| "aindex".to_string());
  let aindex_dir = std::path::Path::new(&workspace_dir).join(&aindex_dir_name);
  let aindex_dir_str = aindex_dir.to_string_lossy().into_owned();

  let mut files = Vec::new();
  let paths = &[".vscode/settings.json", ".vscode/extensions.json"];
  for relative_path in paths {
    if let Some(file) = read_public_ide_config_file(IDEKind::VSCode, relative_path, &aindex_dir_str)
    {
      files.push(file);
    }
  }

  let result = VSCodeConfigInputResult {
    vscode_config_files: if files.is_empty() { None } else { Some(files) },
  };

  serde_json::to_string(&result).map_err(crate::CliError::SerializationError)
}
