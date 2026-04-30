use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde_json::json;

use crate::infra::logger::{Logger, create_logger};
use crate::policy::cleanup::{
  CleanupDeclarationsDto, CleanupSnapshot, CleanupTargetDto, CleanupTargetKindDto,
  PluginCleanupSnapshotDto,
};
use crate::services::command_diagnostics_service::build_workspace_mismatch_warning;
use crate::services::common::{
  DefaultPluginKind, EnabledPlugins, collect_context, load_config, resolve_cwd,
  resolve_workspace_dir, strip_unc_prefix,
};
use crate::{CliError, MemorySyncCommandOptions, MemorySyncCommandResult};

type CleanupOutputMap = HashMap<String, Vec<String>>;
type CleanupDeclarationMap = HashMap<String, CleanupDeclarationsDto>;

pub fn clean(options: MemorySyncCommandOptions) -> Result<MemorySyncCommandResult, CliError> {
  let logger = create_logger(
    "clean",
    options
      .log_level
      .as_deref()
      .and_then(crate::infra::logger::LogLevel::from_str_loose),
  );
  let _span = logger.span("command.clean").enter();

  logger.info("Clean started", None);

  let cwd = resolve_cwd(options.cwd.as_deref())?;

  let config_span = logger.span("config.load").enter();
  let config_result = load_config(&cwd, options.load_user_config)?;
  config_span.exit();

  let workspace_dir = resolve_workspace_dir(&cwd, &config_result.config)?;
  let workspace_warning = build_workspace_mismatch_warning(&cwd, &workspace_dir, &config_result);
  let workspace_dir_str = workspace_dir.to_string_lossy().into_owned();

  logger.info(
    "Config loaded",
    Some(json!({
      "workspaceDir": &workspace_dir_str,
    })),
  );

  let global_scope = crate::services::common::build_global_scope(&config_result.config);
  let enabled_plugins = EnabledPlugins::from_config(
    config_result.config.plugins.as_ref(),
    DefaultPluginKind::Clean,
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
    })),
  );

  let discover_span = logger.span("cleanup.discover").enter();
  let (output_map, cleanup_map) = build_output_map(&context, enabled_plugins, &logger)?;
  let mut snapshot = build_cleanup_snapshot(&workspace_dir_str, &output_map, &cleanup_map)?;
  discover_span.exit();

  logger.info(
    "Cleanup targets discovered",
    Some(json!({
      "pluginCount": snapshot.plugin_snapshots.len(),
      "projectRoots": snapshot.project_roots.len(),
    })),
  );

  // 根据 cwd 限制清理作用域
  if let Some(scope) = resolve_project_scope(&cwd, &workspace_dir) {
    logger.info(
      "Project scope resolved",
      Some(json!({
        "scope": scope.to_string_lossy().to_string(),
      })),
    );
    snapshot = filter_snapshot_by_scope(snapshot, &scope, &workspace_dir);
  }

  if options.dry_run.unwrap_or(false) {
    let plan_span = logger.span("cleanup.plan").enter();
    let plan =
      crate::policy::cleanup::plan_cleanup(snapshot.clone()).map_err(CliError::ExecutionError)?;
    plan_span.exit();

    let mut warnings = workspace_warning.into_iter().collect::<Vec<_>>();
    warnings.extend(plan.violations.iter().map(|v| {
      json!({
        "type": "violation",
        "target": v.target_path,
        "protected": v.protected_path,
        "reason": v.reason
      })
    }));

    logger.info(
      "Dry run plan",
      Some(json!({
        "filesToDelete": plan.files_to_delete.len(),
        "dirsToDelete": plan.dirs_to_delete.len(),
        "emptyDirsToDelete": plan.empty_dirs_to_delete.len(),
        "violations": plan.violations.len(),
        "conflicts": plan.conflicts.len(),
      })),
    );

    Ok(MemorySyncCommandResult {
      success: plan.conflicts.is_empty() && plan.violations.is_empty(),
      files_affected: plan.files_to_delete.len() as i32,
      dirs_affected: plan.dirs_to_delete.len() as i32 + plan.empty_dirs_to_delete.len() as i32,
      message: Some(format!(
        "Dry run: Would delete {} files, {} directories, {} empty directories. Violations: {}, Conflicts: {}",
        plan.files_to_delete.len(),
        plan.dirs_to_delete.len(),
        plan.empty_dirs_to_delete.len(),
        plan.violations.len(),
        plan.conflicts.len()
      )),
      warnings,
      errors: plan
        .conflicts
        .iter()
        .map(|c| {
          json!({
            "type": "conflict",
            "output": c.output_path,
            "protected": c.protected_path,
            "reason": c.reason
          })
        })
        .collect(),
    })
  } else {
    let execute_span = logger.span("cleanup.execute").enter();
    let result =
      crate::policy::cleanup::perform_cleanup(snapshot).map_err(CliError::ExecutionError)?;
    execute_span.exit();

    let blocked = !result.violations.is_empty() || !result.conflicts.is_empty();
    let success = !blocked && result.errors.is_empty();
    let mut warnings = workspace_warning.into_iter().collect::<Vec<_>>();
    warnings.extend(result.violations.iter().map(|v| {
      json!({
        "type": "violation",
        "target": v.target_path,
        "protected": v.protected_path,
        "reason": v.reason
      })
    }));
    let mut errors = result
      .conflicts
      .iter()
      .map(|c| {
        json!({
          "type": "conflict",
          "output": c.output_path,
          "protected": c.protected_path,
          "reason": c.reason
        })
      })
      .collect::<Vec<_>>();
    errors.extend(result.errors.iter().map(|e| {
      json!({
        "path": e.path,
        "kind": format!("{:?}", e.kind),
        "error": e.error
      })
    }));

    logger.info(
      "Clean completed",
      Some(json!({
        "success": success,
        "deletedFiles": result.deleted_files,
        "deletedDirs": result.deleted_dirs,
        "conflicts": result.conflicts.len(),
        "violations": result.violations.len(),
        "errors": result.errors.len(),
      })),
    );

    Ok(MemorySyncCommandResult {
      success,
      files_affected: result.deleted_files as i32,
      dirs_affected: result.deleted_dirs as i32,
      message: Some(if blocked {
        format!(
          "Cleanup blocked: {} conflicts, {} violations",
          result.conflicts.len(),
          result.violations.len()
        )
      } else {
        format!(
          "Deleted {} files and {} directories",
          result.deleted_files, result.deleted_dirs
        )
      }),
      warnings: std::mem::take(&mut warnings),
      errors,
    })
  }
}

// ---------------------------------------------------------------------------
// Scope resolution
// ---------------------------------------------------------------------------

fn resolve_project_scope(cwd: &Path, workspace_dir: &Path) -> Option<PathBuf> {
  let cwd_norm = strip_unc_prefix(cwd);
  let ws_norm = strip_unc_prefix(workspace_dir);

  let relative = cwd_norm.strip_prefix(&ws_norm).ok()?;

  if relative.as_os_str().is_empty() {
    return None;
  }

  let first_component = relative.components().next()?;
  Some(ws_norm.join(first_component.as_os_str()))
}

fn is_path_under_directory(path: &str, directory: &Path) -> bool {
  let path_buf = Path::new(path);
  let path_normalized = if path_buf.is_absolute() {
    path_buf.to_path_buf()
  } else {
    directory.join(path_buf)
  };

  let path_norm = strip_unc_prefix(&path_normalized);
  let dir_norm = strip_unc_prefix(directory);

  let path_str = path_norm.to_string_lossy().replace('\\', "/");
  let dir_str = dir_norm.to_string_lossy().replace('\\', "/");

  path_str == dir_str || path_str.starts_with(&format!("{}/", dir_str))
}

fn filter_snapshot_by_scope(
  mut snapshot: CleanupSnapshot,
  scope: &Path,
  workspace_dir: &Path,
) -> CleanupSnapshot {
  for plugin_snapshot in &mut snapshot.plugin_snapshots {
    plugin_snapshot.outputs.retain(|output| {
      if is_path_under_directory(output, workspace_dir) {
        is_path_under_directory(output, scope)
      } else {
        true
      }
    });
    plugin_snapshot.cleanup.delete.retain(|target| {
      if is_path_under_directory(&target.path, workspace_dir) {
        is_path_under_directory(&target.path, scope)
      } else {
        true
      }
    });
  }

  snapshot
    .project_roots
    .retain(|root| is_path_under_directory(root, scope));

  snapshot
}

// ---------------------------------------------------------------------------
// Output map building
// ---------------------------------------------------------------------------

fn build_output_map(
  context: &crate::context::OutputContext,
  enabled_plugins: EnabledPlugins,
  logger: &Logger,
) -> Result<(CleanupOutputMap, CleanupDeclarationMap), CliError> {
  let mut output_map: CleanupOutputMap = HashMap::new();
  let mut cleanup_map: CleanupDeclarationMap = HashMap::new();

  let base_span = logger.span("output.build").enter();
  let base_plans = crate::domain::base_output_plans::build_base_output_plans(context)?;
  for plan in &base_plans.plugins {
    cleanup_map
      .entry(plan.plugin_name.clone())
      .or_default()
      .delete
      .extend(plan.cleanup.delete.clone());
    if enabled_plugins.is_enabled(plan.plugin_name.as_str()) {
      for file in &plan.output_files {
        output_map
          .entry(plan.plugin_name.clone())
          .or_default()
          .push(file.path.clone());
      }
    }
  }

  // Build plugin-specific output maps
  if let Ok(plan) =
    crate::domain::output_plans::claude_code_output_plan::build_claude_code_output_plan(context)
  {
    cleanup_map
      .entry("ClaudeCodeCLIOutputAdaptor".to_string())
      .or_default()
      .delete
      .extend(plan.cleanup.delete.clone());
    if enabled_plugins.claude_code {
      for file in &plan.output_files {
        output_map
          .entry("ClaudeCodeCLIOutputAdaptor".to_string())
          .or_default()
          .push(file.path.clone());
      }
    }
  }
  if let Ok(plan) = crate::domain::output_plans::codex_output_plan::build_codex_output_plan(context)
  {
    cleanup_map
      .entry("CodexCLIOutputAdaptor".to_string())
      .or_default()
      .delete
      .extend(plan.cleanup.delete.clone());
    if enabled_plugins.codex {
      for file in &plan.output_files {
        output_map
          .entry("CodexCLIOutputAdaptor".to_string())
          .or_default()
          .push(file.path.clone());
      }
    }
  }
  if let Ok(plan) =
    crate::domain::output_plans::cursor_output_plan::build_cursor_output_plan(context)
  {
    cleanup_map
      .entry("CursorOutputAdaptor".to_string())
      .or_default()
      .delete
      .extend(plan.cleanup.delete.clone());
    if enabled_plugins.cursor {
      for file in &plan.output_files {
        output_map
          .entry("CursorOutputAdaptor".to_string())
          .or_default()
          .push(file.path.clone());
      }
    }
  }
  if let Ok(plan) = crate::domain::output_plans::droid_output_plan::build_droid_output_plan(context)
  {
    cleanup_map
      .entry("DroidCLIOutputAdaptor".to_string())
      .or_default()
      .delete
      .extend(plan.cleanup.delete.clone());
    if enabled_plugins.droid {
      for file in &plan.output_files {
        output_map
          .entry("DroidCLIOutputAdaptor".to_string())
          .or_default()
          .push(file.path.clone());
      }
    }
  }
  if let Ok(plan) =
    crate::domain::output_plans::gemini_output_plan::build_gemini_output_plan(context)
  {
    cleanup_map
      .entry("GeminiCLIOutputAdaptor".to_string())
      .or_default()
      .delete
      .extend(plan.cleanup.delete.clone());
    if enabled_plugins.gemini {
      for file in &plan.output_files {
        output_map
          .entry("GeminiCLIOutputAdaptor".to_string())
          .or_default()
          .push(file.path.clone());
      }
    }
  }
  if let Ok(plan) = crate::domain::output_plans::jetbrains_ai_assistant_codex_output_plan::build_jetbrains_ai_assistant_codex_output_plan(context) {
    cleanup_map.entry("JetBrainsAIAssistantCodexOutputAdaptor".to_string()).or_default().delete.extend(plan.cleanup.delete.clone());
    if enabled_plugins.jetbrains {
      for file in &plan.output_files { output_map.entry("JetBrainsAIAssistantCodexOutputAdaptor".to_string()).or_default().push(file.path.clone()); }
    }
  }
  if let Ok(plan) = crate::domain::output_plans::kiro_output_plan::build_kiro_output_plan(context) {
    cleanup_map
      .entry("KiroCLIOutputAdaptor".to_string())
      .or_default()
      .delete
      .extend(plan.cleanup.delete.clone());
    if enabled_plugins.kiro {
      for file in &plan.output_files {
        output_map
          .entry("KiroCLIOutputAdaptor".to_string())
          .or_default()
          .push(file.path.clone());
      }
    }
  }
  if let Ok(plan) =
    crate::domain::output_plans::opencode_output_plan::build_opencode_output_plan(context)
  {
    cleanup_map
      .entry("OpencodeCLIOutputAdaptor".to_string())
      .or_default()
      .delete
      .extend(plan.cleanup.delete.clone());
    if enabled_plugins.opencode {
      for file in &plan.output_files {
        output_map
          .entry("OpencodeCLIOutputAdaptor".to_string())
          .or_default()
          .push(file.path.clone());
      }
    }
  }
  if let Ok(plan) = crate::domain::output_plans::qoder_output_plan::build_qoder_output_plan(context)
  {
    cleanup_map
      .entry("QoderIDEPluginOutputAdaptor".to_string())
      .or_default()
      .delete
      .extend(plan.cleanup.delete.clone());
    if enabled_plugins.qoder {
      for file in &plan.output_files {
        output_map
          .entry("QoderIDEPluginOutputAdaptor".to_string())
          .or_default()
          .push(file.path.clone());
      }
    }
  }
  if let Ok(plan) = crate::domain::output_plans::trae_output_plan::build_trae_output_plan(context) {
    cleanup_map
      .entry("TraeOutputAdaptor".to_string())
      .or_default()
      .delete
      .extend(plan.cleanup.delete.clone());
    if enabled_plugins.trae || enabled_plugins.trae_cn {
      for file in &plan.output_files {
        output_map
          .entry("TraeOutputAdaptor".to_string())
          .or_default()
          .push(file.path.clone());
      }
    }
  }
  if let Ok(plan) = crate::domain::output_plans::warp_output_plan::build_warp_output_plan(context) {
    cleanup_map
      .entry("WarpIDEOutputAdaptor".to_string())
      .or_default()
      .delete
      .extend(plan.cleanup.delete.clone());
    if enabled_plugins.warp {
      for file in &plan.output_files {
        output_map
          .entry("WarpIDEOutputAdaptor".to_string())
          .or_default()
          .push(file.path.clone());
      }
    }
  }
  if let Ok(plan) =
    crate::domain::output_plans::windsurf_output_plan::build_windsurf_output_plan(context)
  {
    cleanup_map
      .entry("WindsurfOutputAdaptor".to_string())
      .or_default()
      .delete
      .extend(plan.cleanup.delete.clone());
    if enabled_plugins.windsurf {
      for file in &plan.output_files {
        output_map
          .entry("WindsurfOutputAdaptor".to_string())
          .or_default()
          .push(file.path.clone());
      }
    }
  }

  base_span.exit();
  Ok((output_map, cleanup_map))
}

// ---------------------------------------------------------------------------
// Cleanup snapshot
// ---------------------------------------------------------------------------

fn build_cleanup_snapshot(
  workspace_dir: &str,
  output_map: &HashMap<String, Vec<String>>,
  cleanup_map: &HashMap<String, CleanupDeclarationsDto>,
) -> Result<CleanupSnapshot, CliError> {
  let mut plugin_snapshots = Vec::new();

  let mut all_plugin_names: Vec<&String> = output_map.keys().collect();
  for name in cleanup_map.keys() {
    if !all_plugin_names.contains(&name) {
      all_plugin_names.push(name);
    }
  }

  for plugin_name in all_plugin_names {
    let output_paths = output_map.get(plugin_name).cloned().unwrap_or_default();
    let cleanup = cleanup_map
      .get(plugin_name)
      .cloned()
      .unwrap_or_else(|| CleanupDeclarationsDto {
        delete: Vec::new(),
        protect: Vec::new(),
        exclude_scan_globs: Vec::new(),
      });
    plugin_snapshots.push(PluginCleanupSnapshotDto {
      plugin_name: plugin_name.clone(),
      outputs: output_paths,
      cleanup,
    });
  }

  let project_roots = discover_project_roots(workspace_dir);

  let mut delete_targets = Vec::new();
  for root_path in &project_roots {
    let root = Path::new(root_path);
    let agents_path = root.join("AGENTS.md");
    let claude_path = root.join("CLAUDE.md");
    let agt_path = root.join("agt.mdx");

    let agents_exists = agents_path.exists();
    let claude_exists = claude_path.exists();
    let agt_exists = agt_path.exists();

    if agents_exists && !agt_exists {
      delete_targets.push(CleanupTargetDto {
        path: agents_path.to_string_lossy().into_owned(),
        kind: CleanupTargetKindDto::File,
        exclude_basenames: Vec::new(),
        protection_mode: None,
        scope: None,
        label: Some("orphaned-agents".to_string()),
      });
    }
    if claude_exists && !agt_exists {
      delete_targets.push(CleanupTargetDto {
        path: claude_path.to_string_lossy().into_owned(),
        kind: CleanupTargetKindDto::File,
        exclude_basenames: Vec::new(),
        protection_mode: None,
        scope: None,
        label: Some("orphaned-claude".to_string()),
      });
    }
  }

  plugin_snapshots.push(PluginCleanupSnapshotDto {
    plugin_name: "base-cleanup".to_string(),
    outputs: Vec::new(),
    cleanup: CleanupDeclarationsDto {
      delete: delete_targets,
      protect: Vec::new(),
      exclude_scan_globs: Vec::new(),
    },
  });

  Ok(CleanupSnapshot {
    workspace_dir: workspace_dir.to_string(),
    aindex_dir: Some(
      crate::domain::config::resolve_workspace_aindex_dir(workspace_dir)
        .to_string_lossy()
        .into_owned(),
    ),
    project_roots,
    protected_rules: Vec::new(),
    plugin_snapshots,
    empty_dir_exclude_globs: Vec::new(),
  })
}

fn discover_project_roots(workspace_dir: &str) -> Vec<String> {
  let ws_path = Path::new(workspace_dir);
  let mut roots = Vec::new();

  if let Ok(entries) = std::fs::read_dir(ws_path) {
    for entry in entries.flatten() {
      let path = entry.path();
      if path.is_dir() {
        let dir_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if !dir_name.starts_with('.')
          && dir_name != crate::domain::config::DEFAULT_AINDEX_DIR_NAME
          && dir_name != "node_modules"
          && dir_name != "target"
        {
          roots.push(path.to_string_lossy().into_owned());
        }
      }
    }
  }

  roots
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
  use super::*;
  use tempfile::TempDir;

  fn with_home_dir<T>(home_dir: &std::path::Path, callback: impl FnOnce() -> T) -> T {
    let _guard = match crate::domain::TEST_ENV_LOCK.lock() {
      Ok(g) => g,
      Err(error) => error.into_inner(),
    };
    let previous_home = std::env::var_os("HOME");

    unsafe {
      std::env::set_var("HOME", home_dir);
    }

    let result = callback();

    match previous_home {
      Some(value) => unsafe {
        std::env::set_var("HOME", value);
      },
      None => unsafe {
        std::env::remove_var("HOME");
      },
    }

    result
  }

  fn create_test_config(
    home_dir: &std::path::Path,
    workspace_dir: &std::path::Path,
  ) -> std::io::Result<()> {
    let config_content = json!({
      "workspaceDir": workspace_dir.to_string_lossy()
    });
    let config_path = home_dir.join(".aindex").join(".tnmsc.json");
    std::fs::create_dir_all(config_path.parent().unwrap())?;
    std::fs::write(
      config_path,
      serde_json::to_string_pretty(&config_content).unwrap(),
    )?;
    Ok(())
  }

  #[test]
  fn clean_dry_run_returns_plan_without_deleting() {
    let temp_dir = TempDir::new().unwrap();
    let aindex_dir = temp_dir.path().join("aindex");
    std::fs::create_dir_all(&aindex_dir).unwrap();
    std::fs::write(aindex_dir.join("global.mdx"), "Global memory").unwrap();
    std::fs::write(aindex_dir.join("workspace.mdx"), "Workspace memory").unwrap();

    with_home_dir(temp_dir.path(), || {
      create_test_config(temp_dir.path(), temp_dir.path()).unwrap();

      let options = MemorySyncCommandOptions {
        cwd: Some(temp_dir.path().to_string_lossy().to_string()),
        load_user_config: Some(true),
        dry_run: Some(true),
        ..Default::default()
      };

      let result = clean(options);
      assert!(
        result.is_ok(),
        "clean should succeed, got: {:?}",
        result.err()
      );
      let result = result.unwrap();
      assert!(result.message.is_some(), "clean should return a message");
    });
  }

  #[test]
  fn clean_with_no_outputs_returns_plan() {
    let temp_dir = TempDir::new().unwrap();
    with_home_dir(temp_dir.path(), || {
      create_test_config(temp_dir.path(), temp_dir.path()).unwrap();

      let options = MemorySyncCommandOptions {
        cwd: Some(temp_dir.path().to_string_lossy().to_string()),
        load_user_config: Some(true),
        dry_run: Some(true),
        ..Default::default()
      };

      let result = clean(options);
      assert!(
        result.is_ok(),
        "clean should succeed, got: {:?}",
        result.err()
      );
      let result = result.unwrap();
      assert!(
        result.message.is_some(),
        "clean should return a message about the plan"
      );
    });
  }

  #[test]
  fn clean_resolve_cwd_uses_provided_path() {
    let temp_dir = TempDir::new().unwrap();
    let cwd = temp_dir.path().to_string_lossy();
    let result = resolve_cwd(Some(&cwd));
    assert!(result.is_ok());
  }

  #[test]
  fn clean_resolve_cwd_falls_back_to_current_dir() {
    let result = resolve_cwd(None);
    assert!(result.is_ok());
  }

  #[test]
  fn clean_load_config_allows_skip() {
    let temp_dir = TempDir::new().unwrap();
    let result = load_config(temp_dir.path(), Some(false));
    assert!(result.is_ok());
    let merged = result.unwrap();
    assert!(!merged.found);
  }

  #[test]
  fn clean_enabled_plugins_from_empty_config() {
    let plugins = EnabledPlugins::from_config(None, DefaultPluginKind::Clean);
    assert!(plugins.agents_md);
    assert!(plugins.claude_code);
    assert!(plugins.git);
    assert!(plugins.readme);
  }

  #[test]
  fn clean_enabled_plugins_respects_config() {
    let config = crate::domain::config::PluginsConfig {
      git: Some(false),
      readme: Some(false),
      claude_code: Some(true),
      ..Default::default()
    };
    let plugins = EnabledPlugins::from_config(Some(&config), DefaultPluginKind::Clean);
    assert!(!plugins.git);
    assert!(!plugins.readme);
    assert!(plugins.claude_code);
  }

  #[test]
  fn clean_plugin_name_matching() {
    let plugins = EnabledPlugins::from_config(None, DefaultPluginKind::Clean);
    assert!(plugins.is_enabled("GitExcludeOutputAdaptor"));
    assert!(plugins.is_enabled("ReadmeMdConfigFileOutputAdaptor"));
    assert!(plugins.is_enabled("ClaudeCodeCLIOutputAdaptor"));
  }

  #[test]
  fn clean_build_cleanup_snapshot_works() {
    let temp_dir = TempDir::new().unwrap();
    let workspace_dir = temp_dir.path().to_string_lossy();
    let mut output_map = HashMap::new();
    output_map.insert(
      "TestPlugin".to_string(),
      vec!["/path/to/output.md".to_string()],
    );

    let cleanup_map: HashMap<String, CleanupDeclarationsDto> = HashMap::new();
    let snapshot = build_cleanup_snapshot(&workspace_dir, &output_map, &cleanup_map);
    assert!(snapshot.is_ok());
    let snapshot = snapshot.unwrap();
    assert_eq!(snapshot.plugin_snapshots.len(), 2);
    assert_eq!(snapshot.plugin_snapshots[0].plugin_name, "TestPlugin");
    assert_eq!(snapshot.plugin_snapshots[0].outputs.len(), 1);
  }

  #[test]
  fn clean_workspace_dir_format() {
    let temp_dir = TempDir::new().unwrap();
    let workspace_dir = temp_dir.path().to_string_lossy();
    let output_map = HashMap::new();
    let cleanup_map: HashMap<String, CleanupDeclarationsDto> = HashMap::new();

    let snapshot = build_cleanup_snapshot(&workspace_dir, &output_map, &cleanup_map).unwrap();
    assert!(snapshot.aindex_dir.is_some());
    assert!(snapshot.aindex_dir.unwrap().contains("aindex"));
  }

  #[test]
  fn clean_snapshot_includes_disabled_plugin_cleanup_targets() {
    let workspace_dir = "/tmp/test-workspace";
    let output_map: HashMap<String, Vec<String>> = HashMap::new();
    let mut cleanup_map: HashMap<String, CleanupDeclarationsDto> = HashMap::new();
    cleanup_map.insert(
      "AgentsOutputAdaptor".to_string(),
      CleanupDeclarationsDto {
        delete: vec![CleanupTargetDto {
          path: "/tmp/test-workspace/AGENTS.md".to_string(),
          kind: CleanupTargetKindDto::File,
          exclude_basenames: Vec::new(),
          protection_mode: None,
          scope: None,
          label: Some("delete.project".to_string()),
        }],
        protect: Vec::new(),
        exclude_scan_globs: Vec::new(),
      },
    );

    let snapshot = build_cleanup_snapshot(workspace_dir, &output_map, &cleanup_map).unwrap();

    let agents_snapshot = snapshot
      .plugin_snapshots
      .iter()
      .find(|p| p.plugin_name == "AgentsOutputAdaptor");
    assert!(
      agents_snapshot.is_some(),
      "cleanup snapshot should include disabled plugin (AgentsOutputAdaptor)"
    );
    let agents_snapshot = agents_snapshot.unwrap();
    assert!(
      agents_snapshot.outputs.is_empty(),
      "disabled plugin should have no outputs"
    );
    assert_eq!(
      agents_snapshot.cleanup.delete.len(),
      1,
      "disabled plugin should still contribute cleanup targets"
    );
  }

  #[test]
  fn clean_snapshot_collects_from_both_maps() {
    let workspace_dir = "/tmp/test-workspace";
    let mut output_map: HashMap<String, Vec<String>> = HashMap::new();
    output_map.insert("EnabledPlugin".to_string(), vec!["file.md".to_string()]);

    let mut cleanup_map: HashMap<String, CleanupDeclarationsDto> = HashMap::new();
    cleanup_map.insert(
      "DisabledPlugin".to_string(),
      CleanupDeclarationsDto {
        delete: vec![CleanupTargetDto {
          path: "stale.md".to_string(),
          kind: CleanupTargetKindDto::File,
          exclude_basenames: Vec::new(),
          protection_mode: None,
          scope: None,
          label: None,
        }],
        protect: Vec::new(),
        exclude_scan_globs: Vec::new(),
      },
    );

    let snapshot = build_cleanup_snapshot(workspace_dir, &output_map, &cleanup_map).unwrap();

    let names: Vec<_> = snapshot
      .plugin_snapshots
      .iter()
      .map(|p| p.plugin_name.as_str())
      .collect();
    assert!(
      names.contains(&"EnabledPlugin"),
      "snapshot should include plugin from output_map"
    );
    assert!(
      names.contains(&"DisabledPlugin"),
      "snapshot should include plugin from cleanup_map"
    );
  }

  #[test]
  fn clean_is_path_under_directory_matches_direct_child() {
    assert!(is_path_under_directory(
      "/workspace/project/file.md",
      Path::new("/workspace/project")
    ));
  }

  #[test]
  fn clean_is_path_under_directory_matches_exact() {
    assert!(is_path_under_directory(
      "/workspace/project",
      Path::new("/workspace/project")
    ));
  }

  #[test]
  fn clean_is_path_under_directory_rejects_sibling() {
    assert!(!is_path_under_directory(
      "/workspace/other/file.md",
      Path::new("/workspace/project")
    ));
  }

  #[test]
  fn clean_is_path_under_directory_rejects_parent() {
    assert!(!is_path_under_directory(
      "/workspace/file.md",
      Path::new("/workspace/project")
    ));
  }

  #[test]
  fn clean_resolve_project_scope_when_cwd_in_project() {
    let ws = PathBuf::from("/workspace");
    let cwd = PathBuf::from("/workspace/memory-sync/src");
    let scope = resolve_project_scope(&cwd, &ws);
    assert_eq!(scope, Some(PathBuf::from("/workspace/memory-sync")));
  }

  #[test]
  fn clean_resolve_project_scope_when_cwd_is_workspace_root() {
    let ws = PathBuf::from("/workspace");
    let cwd = PathBuf::from("/workspace");
    let scope = resolve_project_scope(&cwd, &ws);
    assert_eq!(scope, None);
  }

  #[test]
  fn clean_resolve_project_scope_when_cwd_outside_workspace() {
    let ws = PathBuf::from("/workspace");
    let cwd = PathBuf::from("/home/user");
    let scope = resolve_project_scope(&cwd, &ws);
    assert_eq!(scope, None);
  }

  #[test]
  fn clean_filter_snapshot_by_scope_keeps_paths_in_scope() {
    let workspace_dir = "/tmp/test-workspace";
    let scope = PathBuf::from("/tmp/test-workspace/project-a");
    let mut output_map: HashMap<String, Vec<String>> = HashMap::new();
    output_map.insert(
      "TestPlugin".to_string(),
      vec![
        "/tmp/test-workspace/project-a/AGENTS.md".to_string(),
        "/tmp/test-workspace/project-b/AGENTS.md".to_string(),
      ],
    );

    let snapshot = build_cleanup_snapshot(workspace_dir, &output_map, &HashMap::new()).unwrap();
    let filtered = filter_snapshot_by_scope(snapshot, &scope, Path::new(workspace_dir));

    let test_plugin = filtered
      .plugin_snapshots
      .iter()
      .find(|p| p.plugin_name == "TestPlugin")
      .expect("TestPlugin should exist");
    assert_eq!(test_plugin.outputs.len(), 1);
    assert_eq!(
      test_plugin.outputs[0],
      "/tmp/test-workspace/project-a/AGENTS.md"
    );
  }

  #[test]
  fn clean_filter_snapshot_by_scope_keeps_global_paths() {
    let workspace_dir = "/tmp/test-workspace";
    let scope = PathBuf::from("/tmp/test-workspace/project-a");
    let mut output_map: HashMap<String, Vec<String>> = HashMap::new();
    output_map.insert(
      "TestPlugin".to_string(),
      vec![
        "/tmp/test-workspace/project-a/AGENTS.md".to_string(),
        "/home/user/.claude/CLAUDE.md".to_string(),
      ],
    );

    let snapshot = build_cleanup_snapshot(workspace_dir, &output_map, &HashMap::new()).unwrap();
    let filtered = filter_snapshot_by_scope(snapshot, &scope, Path::new(workspace_dir));

    let test_plugin = filtered
      .plugin_snapshots
      .iter()
      .find(|p| p.plugin_name == "TestPlugin")
      .expect("TestPlugin should exist");
    assert_eq!(test_plugin.outputs.len(), 2);
    assert!(
      test_plugin
        .outputs
        .contains(&"/tmp/test-workspace/project-a/AGENTS.md".to_string())
    );
    assert!(
      test_plugin
        .outputs
        .contains(&"/home/user/.claude/CLAUDE.md".to_string())
    );
  }

  #[test]
  fn clean_filter_snapshot_by_scope_filters_project_roots() {
    let temp_dir = TempDir::new().unwrap();
    let ws = temp_dir.path();
    std::fs::create_dir_all(ws.join("project-a")).unwrap();
    std::fs::create_dir_all(ws.join("project-b")).unwrap();

    let scope = ws.join("project-a");
    let snapshot =
      build_cleanup_snapshot(&ws.to_string_lossy(), &HashMap::new(), &HashMap::new()).unwrap();

    let filtered = filter_snapshot_by_scope(snapshot, &scope, ws);

    assert_eq!(filtered.project_roots.len(), 1);
    assert_eq!(Path::new(&filtered.project_roots[0]), ws.join("project-a"));
  }
}
