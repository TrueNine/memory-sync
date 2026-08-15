pub mod clean;
pub mod dry_run;
pub mod install;

pub use clean::clean;
pub use dry_run::dry_run;
pub use install::install;

pub fn version() -> &'static str {
  env!("CARGO_PKG_VERSION")
}

use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::domain::config;

#[derive(Debug, thiserror::Error)]
pub enum SdkError {
  #[error("Config error: {0}")]
  ConfigError(String),

  #[error("IO error: {0}")]
  IoError(#[from] std::io::Error),

  #[error("Serialization error: {0}")]
  SerializationError(#[from] serde_json::Error),

  #[error("Execution error: {0}")]
  ExecutionError(String),
}

pub fn load_config(cwd: &Path) -> Result<config::MergedConfigResult, SdkError> {
  config::ConfigLoader::with_defaults()
    .try_load(cwd)
    .map_err(SdkError::ConfigError)
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CroessweaveCommandOptions {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub cwd: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub load_user_config: Option<bool>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub log_level: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub plugin_options: Option<Value>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub dry_run: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CroessweaveCommandResult {
  pub success: bool,
  pub files_affected: i32,
  pub dirs_affected: i32,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub message: Option<String>,
  #[serde(default)]
  pub warnings: Vec<Value>,
  #[serde(default)]
  pub errors: Vec<Value>,
}
