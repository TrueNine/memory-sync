use serde::{Deserialize, Serialize};

use crate::core::plugin_shared::IDEKind;
use crate::repositories::public_config::read_public_ide_config_file;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JetBrainsConfigInputOptions {
  pub workspace_dir: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub aindex: Option<super::gitignore::AindexInputOptions>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JetBrainsConfigInputResult {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub jetbrains_config_files: Option<Vec<crate::core::plugin_shared::ProjectIDEConfigFile>>,
}

pub fn collect_jetbrains_config(options_json: &str) -> Result<String, crate::CliError> {
  let options: JetBrainsConfigInputOptions =
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
  let paths = &[
    ".idea/codeStyles/Project.xml",
    ".idea/codeStyles/codeStyleConfig.xml",
    ".idea/.gitignore",
  ];
  for relative_path in paths {
    if let Some(file) =
      read_public_ide_config_file(IDEKind::IntellijIDEA, relative_path, &aindex_dir_str)
    {
      files.push(file);
    }
  }

  let result = JetBrainsConfigInputResult {
    jetbrains_config_files: if files.is_empty() { None } else { Some(files) },
  };

  serde_json::to_string(&result).map_err(crate::CliError::SerializationError)
}
