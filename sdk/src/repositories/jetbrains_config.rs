use serde::{Deserialize, Serialize};

use crate::domain::plugin_shared::IDEKind;
use crate::repositories::public_config::read_public_ide_config_file;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JetBrainsConfigInputOptions {
  pub workspace_dir: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JetBrainsConfigInputResult {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub jetbrains_config_files: Option<Vec<crate::domain::plugin_shared::ProjectIDEConfigFile>>,
}

pub fn collect_jetbrains_config(options_json: &str) -> Result<String, crate::CliError> {
  let options: JetBrainsConfigInputOptions =
    serde_json::from_str(options_json).map_err(|e| crate::CliError::ConfigError(e.to_string()))?;

  let aindex_dir = crate::domain::config::resolve_workspace_aindex_dir(&options.workspace_dir);
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
