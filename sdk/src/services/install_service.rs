use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use base64::Engine;
use serde_json::{Value, json};

use crate::domain::base_output_plans::{BaseOutputFileDeclarationDto, BaseOutputPlansDto};
use crate::domain::cleanup::CleanupSnapshot;
use crate::domain::output_plans::droid_output_plan::DroidOutputPlanDto;
use crate::infra::desk_paths;
use crate::infra::logger::{Logger, create_logger};
use crate::policy::path_blocking;
use crate::services::command_diagnostics_service::build_workspace_mismatch_warning;
use crate::services::common::{
  DefaultPluginKind, EnabledPlugins, collect_context, load_config, resolve_cwd,
  resolve_workspace_dir,
};
use crate::{CliError, MemorySyncCommandOptions, MemorySyncCommandResult};

#[derive(Debug, Clone)]
struct PlannedOutputFile {
  path: String,
  content: String,
  encoding: Option<String>,
}

pub(crate) fn install(
  options: MemorySyncCommandOptions,
) -> Result<MemorySyncCommandResult, CliError> {
  let logger = create_logger(
    "install",
    options
      .log_level
      .as_deref()
      .and_then(crate::infra::logger::LogLevel::from_str_loose),
  );
  let _span = logger.span("command.install").enter();

  logger.info(
    "Install started",
    Some(json!({
      "cwd": options.cwd.as_ref(),
    })),
  );

  let cwd = resolve_cwd(options.cwd.as_deref())?;

  let config_span = logger.span("config.load").enter();
  let config_result = load_config(&cwd, options.load_user_config)?;
  config_span.exit();

  let workspace_dir = resolve_workspace_dir(&cwd, &config_result.config)?;
  let mut warnings = build_workspace_mismatch_warning(&cwd, &workspace_dir, &config_result)
    .into_iter()
    .collect::<Vec<_>>();
  let workspace_dir_str = workspace_dir.to_string_lossy().into_owned();

  logger.info(
    "Config loaded",
    Some(json!({
      "workspaceDir": &workspace_dir_str,
      "configFound": config_result.found,
      "configSources": config_result.sources,
    })),
  );

  let global_scope = crate::services::common::build_global_scope(&config_result.config);
  let enabled_plugins = EnabledPlugins::from_config(
    config_result.config.plugins.as_ref(),
    DefaultPluginKind::Install,
  );

  logger.info(
    "Plugins resolved",
    Some(json!({
      "enabled": enabled_plugins.registered_plugins(),
    })),
  );

  let context_span = logger.span("context.collect").enter();
  let context = collect_context(
    &workspace_dir_str,
    global_scope.as_ref(),
    &enabled_plugins,
    &logger,
  )?;
  context_span.exit();

  logger.info(
    "Context collected",
    Some(json!({
      "globalMemory": context.global_memory.is_some(),
      "commands": context.slash_commands.as_ref().map(|v| v.len()),
      "skills": context.skills.as_ref().map(|v| v.len()),
      "rules": context.rules.as_ref().map(|v| v.len()),
    })),
  );

  let output_span = logger.span("output.build").enter();
  let planned_outputs = build_output_files(&context, enabled_plugins, &logger)?;
  output_span.exit();

  logger.info(
    "Output files built",
    Some(json!({
      "filesPlanned": planned_outputs.len(),
    })),
  );

  let write_span = logger.span("files.write").enter();
  let protection_snapshot = build_install_protection_snapshot(&workspace_dir_str, &planned_outputs);
  let execution = write_output_files(&planned_outputs, &protection_snapshot, &logger)?;
  write_span.exit();

  warnings.extend(execution.warnings);

  logger.info(
    "Install completed",
    Some(json!({
      "success": execution.errors.is_empty(),
      "filesAffected": execution.files_affected,
      "dirsAffected": execution.dirs_affected,
      "warnings": warnings.len(),
      "errors": execution.errors.len(),
    })),
  );

  Ok(MemorySyncCommandResult {
    success: execution.errors.is_empty(),
    files_affected: execution.files_affected as i32,
    dirs_affected: execution.dirs_affected as i32,
    message: Some(
      if execution.files_affected == 0 && execution.dirs_affected == 0 {
        "No files needed updates".to_string()
      } else {
        format!(
          "Updated {} files and prepared {} directories",
          execution.files_affected, execution.dirs_affected
        )
      },
    ),
    warnings,
    errors: execution.errors,
  })
}

fn build_output_files(
  context: &crate::context::OutputContext,
  enabled_plugins: EnabledPlugins,
  logger: &Logger,
) -> Result<BTreeMap<String, PlannedOutputFile>, CliError> {
  let mut outputs = BTreeMap::new();

  let base_span = logger.span("output.base_plans").enter();
  let base_plans = crate::domain::base_output_plans::build_base_output_plans(context)?;
  push_base_plans(&mut outputs, &base_plans, enabled_plugins);
  base_span.exit();

  if enabled_plugins.claude_code {
    let plugin_span = logger.span("output.claude_code").enter();
    let plan =
      crate::domain::output_plans::claude_code_output_plan::build_claude_code_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
    plugin_span.exit();
  }
  if enabled_plugins.codex {
    let plugin_span = logger.span("output.codex").enter();
    let plan = crate::domain::output_plans::codex_output_plan::build_codex_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
    plugin_span.exit();
  }
  if enabled_plugins.cursor {
    let plugin_span = logger.span("output.cursor").enter();
    let plan = crate::domain::output_plans::cursor_output_plan::build_cursor_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
    plugin_span.exit();
  }
  if enabled_plugins.droid {
    let plugin_span = logger.span("output.droid").enter();
    let plan = crate::domain::output_plans::droid_output_plan::build_droid_output_plan(context)?;
    push_droid_output_files(&mut outputs, &plan);
    plugin_span.exit();
  }
  if enabled_plugins.gemini {
    let plugin_span = logger.span("output.gemini").enter();
    let plan = crate::domain::output_plans::gemini_output_plan::build_gemini_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
    plugin_span.exit();
  }
  if enabled_plugins.jetbrains {
    let plugin_span = logger.span("output.jetbrains").enter();
    let plan = crate::domain::output_plans::jetbrains_ai_assistant_codex_output_plan::build_jetbrains_ai_assistant_codex_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
    plugin_span.exit();
  }
  if enabled_plugins.kiro {
    let plugin_span = logger.span("output.kiro").enter();
    let plan = crate::domain::output_plans::kiro_output_plan::build_kiro_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
    plugin_span.exit();
  }
  if enabled_plugins.opencode {
    let plugin_span = logger.span("output.opencode").enter();
    let plan =
      crate::domain::output_plans::opencode_output_plan::build_opencode_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
    plugin_span.exit();
  }
  if enabled_plugins.qoder {
    let plugin_span = logger.span("output.qoder").enter();
    let plan = crate::domain::output_plans::qoder_output_plan::build_qoder_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
    plugin_span.exit();
  }
  if enabled_plugins.trae || enabled_plugins.trae_cn {
    let plugin_span = logger.span("output.trae").enter();
    let plan = crate::domain::output_plans::trae_output_plan::build_trae_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
    plugin_span.exit();
  }
  if enabled_plugins.warp {
    let plugin_span = logger.span("output.warp").enter();
    let plan = crate::domain::output_plans::warp_output_plan::build_warp_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
    plugin_span.exit();
  }
  if enabled_plugins.windsurf {
    let plugin_span = logger.span("output.windsurf").enter();
    let plan =
      crate::domain::output_plans::windsurf_output_plan::build_windsurf_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
    plugin_span.exit();
  }

  Ok(outputs)
}

fn push_base_plans(
  outputs: &mut BTreeMap<String, PlannedOutputFile>,
  base_plans: &BaseOutputPlansDto,
  enabled_plugins: EnabledPlugins,
) {
  for plan in &base_plans.plugins {
    if enabled_plugins.is_enabled(&plan.plugin_name) {
      push_base_output_files(outputs, &plan.output_files);
    }
  }
}

fn push_base_output_files(
  outputs: &mut BTreeMap<String, PlannedOutputFile>,
  files: &[BaseOutputFileDeclarationDto],
) {
  for file in files {
    outputs.insert(
      file.path.clone(),
      PlannedOutputFile {
        path: file.path.clone(),
        content: file.content.clone(),
        encoding: file.encoding.clone(),
      },
    );
  }
}

fn push_droid_output_files(
  outputs: &mut BTreeMap<String, PlannedOutputFile>,
  plan: &DroidOutputPlanDto,
) {
  for file in &plan.output_files {
    outputs.insert(
      file.path.clone(),
      PlannedOutputFile {
        path: file.path.clone(),
        content: file.content.clone(),
        encoding: file.encoding.clone(),
      },
    );
  }
}

struct InstallExecutionResult {
  files_affected: usize,
  dirs_affected: usize,
  warnings: Vec<Value>,
  errors: Vec<Value>,
}

fn write_output_files(
  outputs: &BTreeMap<String, PlannedOutputFile>,
  protection_snapshot: &CleanupSnapshot,
  logger: &Logger,
) -> Result<InstallExecutionResult, CliError> {
  let mut files_affected = 0usize;
  let mut dirs_affected = 0usize;
  let mut warnings = Vec::new();
  let mut errors = Vec::new();

  for file in outputs.values() {
    let path = Path::new(&file.path);

    if let Some(violation) =
      crate::policy::cleanup::detect_protected_path_violation(protection_snapshot, &file.path)
        .map_err(CliError::ExecutionError)?
    {
      errors.push(json!({
        "path": file.path,
        "protected": violation.protected_path,
        "reason": violation.reason,
        "source": violation.source,
        "error": "Refusing to write protected path.",
      }));
      continue;
    }

    match prepare_target_path(path, protection_snapshot, &mut warnings) {
      Ok(created_dirs) => {
        dirs_affected += created_dirs;
      }
      Err(error) => {
        errors.push(json!({
          "path": file.path,
          "error": error,
        }));
        continue;
      }
    }

    let bytes = match render_bytes(file) {
      Ok(bytes) => bytes,
      Err(error) => {
        errors.push(json!({
          "path": file.path,
          "error": error.to_string(),
        }));
        continue;
      }
    };

    let existing = fs::read(path).ok();
    if existing.as_deref() == Some(bytes.as_slice()) {
      logger.debug(
        format!("file.skipped: {}", file.path),
        Some(json!({ "reason": "unchanged" })),
      );
      continue;
    }

    if let Err(error) = desk_paths::write_file_sync(path, &bytes) {
      errors.push(json!({
        "path": file.path,
        "error": error.to_string(),
      }));
      continue;
    }

    logger.info(format!("file.written: {}", file.path), None);
    files_affected += 1;
  }

  Ok(InstallExecutionResult {
    files_affected,
    dirs_affected,
    warnings,
    errors,
  })
}

fn render_bytes(file: &PlannedOutputFile) -> Result<Vec<u8>, CliError> {
  match file.encoding.as_deref() {
    Some("base64") => base64::engine::general_purpose::STANDARD
      .decode(&file.content)
      .map_err(|error| CliError::ExecutionError(format!("Invalid base64 output payload: {error}"))),
    _ => Ok(file.content.as_bytes().to_vec()),
  }
}

fn build_install_protection_snapshot(
  workspace_dir: &str,
  outputs: &BTreeMap<String, PlannedOutputFile>,
) -> CleanupSnapshot {
  CleanupSnapshot {
    workspace_dir: workspace_dir.to_string(),
    aindex_dir: Some(
      crate::domain::config::resolve_workspace_aindex_dir(workspace_dir)
        .to_string_lossy()
        .into_owned(),
    ),
    project_roots: discover_install_project_roots(workspace_dir, outputs),
    protected_rules: Vec::new(),
    plugin_snapshots: Vec::new(),
    empty_dir_exclude_globs: Vec::new(),
  }
}

fn discover_install_project_roots(
  workspace_dir: &str,
  outputs: &BTreeMap<String, PlannedOutputFile>,
) -> Vec<String> {
  let workspace = Path::new(workspace_dir);
  let mut roots = outputs
    .values()
    .filter_map(|file| {
      Path::new(&file.path)
        .strip_prefix(workspace)
        .ok()
        .and_then(|relative| relative.components().next())
        .map(|component| {
          workspace
            .join(component.as_os_str())
            .to_string_lossy()
            .into_owned()
        })
    })
    .collect::<Vec<_>>();
  roots.sort();
  roots.dedup();
  roots
}

fn prepare_target_path(
  path: &Path,
  protection_snapshot: &CleanupSnapshot,
  warnings: &mut Vec<Value>,
) -> Result<usize, String> {
  let mut created_dirs = 0usize;

  if let Some(parent) = path.parent() {
    if let Some(blocking) =
      path_blocking::find_blocking_non_directory_path(&parent.to_string_lossy())
    {
      if let Some(violation) =
        crate::policy::cleanup::detect_protected_path_violation(protection_snapshot, &blocking)?
      {
        return Err(format!(
          "Refusing to delete protected blocking path {} (protected: {}, reason: {})",
          blocking, violation.protected_path, violation.reason
        ));
      }
      desk_paths::delete_path_sync(&blocking).map_err(|error| error.to_string())?;
      warnings.push(json!({
        "path": blocking,
        "warning": "Removed a blocking non-directory path before writing output.",
      }));
    }

    created_dirs += crate::services::common::count_missing_directories(parent);
    desk_paths::ensure_dir(parent).map_err(|error| error.to_string())?;
  }

  if let Ok(metadata) = fs::symlink_metadata(path)
    && metadata.is_dir()
  {
    let file_path = path.to_string_lossy().into_owned();
    if let Some(violation) =
      crate::policy::cleanup::detect_protected_path_violation(protection_snapshot, &file_path)?
    {
      return Err(format!(
        "Refusing to delete protected blocking directory {} (protected: {}, reason: {})",
        file_path, violation.protected_path, violation.reason
      ));
    }
    desk_paths::delete_path_sync(path).map_err(|error| error.to_string())?;
    warnings.push(json!({
      "path": path.to_string_lossy(),
      "warning": "Removed a blocking directory before writing output.",
    }));
  }

  Ok(created_dirs)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::domain::config::UserConfigFile;
  use std::collections::BTreeMap;
  use std::fs;
  use std::path::PathBuf;

  #[test]
  fn test_resolve_workspace_dir_returns_configured_path() {
    let cwd = PathBuf::from("/some/cwd");
    let config = UserConfigFile {
      workspace_dir: Some("/configured/workspace".to_string()),
      ..Default::default()
    };
    let result = resolve_workspace_dir(&cwd, &config);
    assert!(
      result.is_ok(),
      "should succeed when workspace_dir is configured"
    );
    assert!(
      result.unwrap().to_string_lossy().contains("workspace"),
      "resolved path should contain the configured workspace dir"
    );
  }

  #[test]
  fn test_resolve_workspace_dir_errors_when_not_configured() {
    let cwd = PathBuf::from("/some/cwd");
    let config = UserConfigFile::default();
    let result = resolve_workspace_dir(&cwd, &config);
    assert!(
      result.is_err(),
      "should error when workspace_dir is not configured"
    );
    let error = result.unwrap_err();
    let message = error.to_string();
    assert!(
      message.contains("workspaceDir"),
      "error message should mention workspaceDir, got: {message}"
    );
  }

  #[test]
  fn test_load_config_requires_config_file_to_be_found() {
    let temp_dir = tempfile::TempDir::new().unwrap();
    let cwd = temp_dir.path();
    let result = load_config(cwd, None);
    match &result {
      Err(error) => {
        let message = error.to_string();
        assert!(
          message.contains("not found"),
          "error message should mention config not found, got: {message}"
        );
        assert!(
          message.contains(".tnmsc.json"),
          "error message should mention .tnmsc.json, got: {message}"
        );
      }
      Ok(merged) if !merged.found => {
        let ws_result = resolve_workspace_dir(cwd, &merged.config);
        assert!(
          ws_result.is_err(),
          "when config file is not found, workspaceDir should be required"
        );
      }
      Ok(_) => {}
    }
  }

  #[test]
  fn test_load_config_allows_explicit_skip() {
    let temp_dir = tempfile::TempDir::new().unwrap();
    let cwd = temp_dir.path();
    let result = load_config(cwd, Some(false));
    assert!(
      result.is_ok(),
      "should succeed when load_user_config is false"
    );
    let merged = result.unwrap();
    assert!(
      !merged.found,
      "found should be false when skipping user config"
    );
  }

  #[test]
  fn write_output_files_refuses_to_overwrite_protected_project_root() {
    let temp_dir = tempfile::TempDir::new().unwrap();
    let project_root = temp_dir.path().join("project-a");
    fs::create_dir_all(&project_root).unwrap();

    let mut outputs = BTreeMap::new();
    outputs.insert(
      project_root.to_string_lossy().into_owned(),
      PlannedOutputFile {
        path: project_root.to_string_lossy().into_owned(),
        content: "malicious".to_string(),
        encoding: None,
      },
    );
    let snapshot = build_install_protection_snapshot(&temp_dir.path().to_string_lossy(), &outputs);
    let logger = create_logger("test", None);

    let result = write_output_files(&outputs, &snapshot, &logger).unwrap();

    assert_eq!(result.files_affected, 0);
    assert_eq!(result.errors.len(), 1);
    assert!(
      result.errors[0]["error"]
        .as_str()
        .unwrap()
        .contains("Refusing to write protected path")
    );
    assert!(project_root.is_dir());
  }

  #[test]
  fn prepare_target_path_refuses_to_delete_protected_blocking_path() {
    let temp_dir = tempfile::TempDir::new().unwrap();
    let project_root = temp_dir.path().join("project-a");
    fs::write(&project_root, "do-not-delete").unwrap();

    let mut outputs = BTreeMap::new();
    let target = project_root.join("nested").join("AGENTS.md");
    outputs.insert(
      target.to_string_lossy().into_owned(),
      PlannedOutputFile {
        path: target.to_string_lossy().into_owned(),
        content: "content".to_string(),
        encoding: None,
      },
    );
    let snapshot = build_install_protection_snapshot(&temp_dir.path().to_string_lossy(), &outputs);
    let mut warnings = Vec::new();

    let result = prepare_target_path(&target, &snapshot, &mut warnings);

    assert!(result.is_err());
    assert!(
      result
        .unwrap_err()
        .contains("Refusing to delete protected blocking path")
    );
    assert_eq!(fs::read_to_string(&project_root).unwrap(), "do-not-delete");
    assert!(warnings.is_empty());
  }
}
