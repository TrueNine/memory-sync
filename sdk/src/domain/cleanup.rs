use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProtectionModeDto {
  Direct,
  Recursive,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProtectionRuleMatcherDto {
  Path,
  Glob,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CleanupTargetKindDto {
  File,
  Directory,
  Glob,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CleanupErrorKindDto {
  File,
  Directory,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupTargetDto {
  pub path: String,
  pub kind: CleanupTargetKindDto,
  #[serde(default)]
  pub exclude_basenames: Vec<String>,
  pub protection_mode: Option<ProtectionModeDto>,
  pub scope: Option<String>,
  pub label: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupDeclarationsDto {
  #[serde(default)]
  pub delete: Vec<CleanupTargetDto>,
  #[serde(default)]
  pub protect: Vec<CleanupTargetDto>,
  #[serde(default)]
  pub exclude_scan_globs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginCleanupSnapshotDto {
  pub plugin_name: String,
  #[serde(default)]
  pub outputs: Vec<String>,
  #[serde(default)]
  pub cleanup: CleanupDeclarationsDto,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtectedRuleDto {
  pub path: String,
  pub protection_mode: ProtectionModeDto,
  pub reason: String,
  pub source: String,
  pub matcher: Option<ProtectionRuleMatcherDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupSnapshot {
  pub workspace_dir: String,
  pub aindex_dir: Option<String>,
  #[serde(default)]
  pub project_roots: Vec<String>,
  #[serde(default)]
  pub protected_rules: Vec<ProtectedRuleDto>,
  #[serde(default)]
  pub plugin_snapshots: Vec<PluginCleanupSnapshotDto>,
  pub empty_dir_exclude_globs: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtectedPathViolationDto {
  pub target_path: String,
  pub protected_path: String,
  pub protection_mode: ProtectionModeDto,
  pub reason: String,
  pub source: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupProtectionConflictDto {
  pub output_path: String,
  pub output_plugin: String,
  pub protected_path: String,
  pub protection_mode: ProtectionModeDto,
  pub protected_by: String,
  pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupPlan {
  pub files_to_delete: Vec<String>,
  pub dirs_to_delete: Vec<String>,
  pub empty_dirs_to_delete: Vec<String>,
  pub violations: Vec<ProtectedPathViolationDto>,
  pub conflicts: Vec<CleanupProtectionConflictDto>,
  pub excluded_scan_globs: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupErrorDto {
  pub path: String,
  pub kind: CleanupErrorKindDto,
  pub error: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupExecutionResultDto {
  pub deleted_files: usize,
  pub deleted_dirs: usize,
  pub errors: Vec<CleanupErrorDto>,
  pub violations: Vec<ProtectedPathViolationDto>,
  pub conflicts: Vec<CleanupProtectionConflictDto>,
  pub files_to_delete: Vec<String>,
  pub dirs_to_delete: Vec<String>,
  pub empty_dirs_to_delete: Vec<String>,
  pub excluded_scan_globs: Vec<String>,
}
