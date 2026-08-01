use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use base64::Engine;
use serde_json::{Value, json};

use crate::domain::cleanup::CleanupSnapshot;
use crate::infra::desk_paths;
use crate::infra::logger::{Logger, create_logger};
use crate::policy::path_blocking;
use crate::services::command_diagnostics_service::build_workspace_mismatch_warning;
use crate::services::common::{
  DefaultPluginKind, EnabledPlugins, collect_context, load_config, resolve_cwd,
  resolve_workspace_dir,
};
use crate::services::output_plan::{PlannedOutputFile, build_output_files};
use crate::{CliError, MemorySyncCommandOptions, MemorySyncCommandResult};

pub(crate) fn install(
  options: MemorySyncCommandOptions,
) -> Result<MemorySyncCommandResult, CliError> {
  let logger = create_logger(
    "install",
    options
      .log_level
      .as_deref()
      .and_then(|s| crate::infra::logger::LogLevel::from_str_loose(s)),
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

  // Fixes #352: use shared build_output_files (same code path as dry_run_service).
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
      "warning": "Removed a blocking directory (path was a dir, not a file) before writing output.",
    }));
  }

  Ok(created_dirs)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn render_bytes_passthrough_for_no_encoding() {
    let file = PlannedOutputFile {
      path: "/tmp/test.md".into(),
      content: "hello world".into(),
      encoding: None,
    };
    let bytes = render_bytes(&file).unwrap();
    assert_eq!(bytes, b"hello world");
  }

  #[test]
  fn render_bytes_decodes_base64() {
    let file = PlannedOutputFile {
      path: "/tmp/test.bin".into(),
      content: "aGVsbG8gd29ybGQ=".into(),
      encoding: Some("base64".into()),
    };
    let bytes = render_bytes(&file).unwrap();
    assert_eq!(bytes, b"hello world");
  }

  #[test]
  fn render_bytes_fails_on_bad_base64() {
    let file = PlannedOutputFile {
      path: "/tmp/test.bin".into(),
      content: "!!!invalid base64!!!".into(),
      encoding: Some("base64".into()),
    };
    assert!(render_bytes(&file).is_err());
  }

  #[test]
  fn write_output_files_refuses_to_overwrite_protected_project_root() {
    let mut outputs = BTreeMap::new();
    outputs.insert(
      "/tmp/project-root/AGENTS.md".to_string(),
      PlannedOutputFile {
        path: "/tmp/project-root/AGENTS.md".into(),
        content: "content".into(),
        encoding: None,
      },
    );
    let snapshot = CleanupSnapshot {
      workspace_dir: "/tmp/workspace".to_string(),
      aindex_dir: None,
      project_roots: vec!["/tmp/project-root".to_string()],
      protected_rules: Vec::new(),
      plugin_snapshots: Vec::new(),
      empty_dir_exclude_globs: Vec::new(),
    };

    let result = write_output_files(&outputs, &snapshot, &create_logger("test", None));
    assert!(result.is_ok(), "write should not crash: {:?}", result.err());
  }

  #[test]
  fn build_install_protection_snapshot_includes_workspace() {
    let outputs = BTreeMap::new();
    let snapshot = build_install_protection_snapshot("/tmp/workspace", &outputs);
    assert_eq!(snapshot.workspace_dir, "/tmp/workspace");
  }
}
