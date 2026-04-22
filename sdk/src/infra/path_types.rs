use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FilePathKind {
  Relative,
  Absolute,
  Root,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelativePath {
  pub path_kind: FilePathKind,
  pub path: String,
  #[serde(default)]
  pub base_path: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub absolute_path: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub directory_name: Option<String>,
}

impl RelativePath {
  pub fn new(path: &str, base_path: &str) -> Self {
    let abs = PathBuf::from(base_path).join(path);
    let dir_name = PathBuf::from(path)
      .parent()
      .map(|p| p.to_string_lossy().into_owned())
      .unwrap_or_default();
    Self {
      path_kind: FilePathKind::Relative,
      path: path.to_string(),
      base_path: base_path.to_string(),
      absolute_path: Some(abs.to_string_lossy().into_owned()),
      directory_name: Some(dir_name),
    }
  }

  pub fn get_absolute_path(&self) -> String {
    self.absolute_path.clone().unwrap_or_else(|| {
      if self.base_path.is_empty() {
        return self.path.clone();
      }
      PathBuf::from(&self.base_path)
        .join(&self.path)
        .to_string_lossy()
        .into_owned()
    })
  }

  pub fn get_directory_name(&self) -> String {
    self.directory_name.clone().unwrap_or_else(|| {
      PathBuf::from(&self.path)
        .parent()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default()
    })
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RootPath {
  pub path_kind: FilePathKind,
  pub path: String,
}

impl RootPath {
  pub fn new(path: &str) -> Self {
    Self {
      path_kind: FilePathKind::Root,
      path: path.to_string(),
    }
  }
}
