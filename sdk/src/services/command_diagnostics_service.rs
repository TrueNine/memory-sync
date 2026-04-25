use std::path::Path;

use serde_json::{Value, json};

use crate::domain::config::MergedConfigResult;
use crate::services::common::strip_unc_prefix;

pub(crate) fn build_workspace_mismatch_warning(
  cwd: &Path,
  workspace_dir: &Path,
  config_result: &MergedConfigResult,
) -> Option<Value> {
  if is_same_or_descendant(cwd, workspace_dir) {
    return None;
  }

  Some(json!({
    "type": "workspace_mismatch",
    "message": "Current directory is outside configured workspaceDir. tnmsc will operate on the configured workspace instead of the current directory.",
    "currentDir": normalize_display_path(cwd),
    "workspaceDir": normalize_display_path(workspace_dir),
    "configSources": config_result.sources,
  }))
}

fn is_same_or_descendant(path: &Path, base: &Path) -> bool {
  let normalized_path = normalize_compare_path(path);
  let normalized_base = normalize_compare_path(base);

  normalized_path == normalized_base || normalized_path.starts_with(&format!("{normalized_base}/"))
}

fn normalize_compare_path(path: &Path) -> String {
  let value = normalize_display_path(path).replace('\\', "/");
  if cfg!(windows) {
    value.to_ascii_lowercase()
  } else {
    value
  }
}

fn normalize_display_path(path: &Path) -> String {
  strip_unc_prefix(path).to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
  use std::path::PathBuf;

  use serde_json::json;

  use super::*;
  use crate::domain::config::{MergedConfigResult, UserConfigFile};

  fn merged_config_result() -> MergedConfigResult {
    MergedConfigResult {
      config: UserConfigFile::default(),
      sources: vec!["C:/Users/truen/.aindex/.tnmsc.json".to_string()],
      found: true,
    }
  }

  #[test]
  fn workspace_mismatch_warning_is_none_for_workspace_root() {
    let cwd = PathBuf::from("C:/workspace/memory-sync");
    let workspace_dir = PathBuf::from("C:/workspace/memory-sync");

    let warning = build_workspace_mismatch_warning(&cwd, &workspace_dir, &merged_config_result());

    assert!(warning.is_none());
  }

  #[test]
  fn workspace_mismatch_warning_is_none_for_workspace_child() {
    let cwd = PathBuf::from("C:/workspace/memory-sync/cli");
    let workspace_dir = PathBuf::from("C:/workspace/memory-sync");

    let warning = build_workspace_mismatch_warning(&cwd, &workspace_dir, &merged_config_result());

    assert!(warning.is_none());
  }

  #[test]
  fn workspace_mismatch_warning_includes_context_when_cwd_is_outside_workspace() {
    let cwd = PathBuf::from("C:/workspace/memory-sync");
    let workspace_dir = PathBuf::from("C:/temp/demo");

    let warning =
      build_workspace_mismatch_warning(&cwd, &workspace_dir, &merged_config_result()).unwrap();

    assert_eq!(warning["type"], "workspace_mismatch");
    assert_eq!(warning["currentDir"], json!("C:/workspace/memory-sync"));
    assert_eq!(warning["workspaceDir"], json!("C:/temp/demo"));
    assert_eq!(
      warning["configSources"],
      json!(["C:/Users/truen/.aindex/.tnmsc.json"])
    );
  }
}
