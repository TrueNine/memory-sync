use std::collections::BTreeMap;
use std::path::Path;

use serde_json::json;

use crate::domain::base_output_plans::{BaseOutputFileDeclarationDto, BaseOutputPlansDto};
use crate::domain::output_plans::droid_output_plan::DroidOutputPlanDto;
use crate::infra::logger::create_logger;
use crate::services::command_diagnostics_service::build_workspace_mismatch_warning;
use crate::services::common::{
  DefaultPluginKind, EnabledPlugins, collect_context, load_config, resolve_cwd,
  resolve_workspace_dir,
};
use crate::{CliError, MemorySyncCommandOptions, MemorySyncCommandResult};

#[derive(Debug, Clone)]
#[allow(dead_code)]
struct PlannedOutputFile {
  path: String,
  content: String,
  encoding: Option<String>,
}

pub fn dry_run(options: MemorySyncCommandOptions) -> Result<MemorySyncCommandResult, CliError> {
  let logger = create_logger(
    "dry_run",
    options
      .log_level
      .as_deref()
      .and_then(crate::infra::logger::LogLevel::from_str_loose),
  );
  let _span = logger.span("command.dry_run").enter();

  logger.info("Dry run started", None);

  let cwd = resolve_cwd(options.cwd.as_deref())?;

  let config_span = logger.span("config.load").enter();
  let config_result = load_config(&cwd, options.load_user_config)?;
  config_span.exit();

  let workspace_dir = resolve_workspace_dir(&cwd, &config_result.config)?;
  let warnings = build_workspace_mismatch_warning(&cwd, &workspace_dir, &config_result)
    .into_iter()
    .collect();
  let workspace_dir_str = workspace_dir.to_string_lossy().into_owned();

  logger.info(
    "Config loaded",
    Some(json!({
      "workspaceDir": &workspace_dir_str,
      "configFound": config_result.found,
    })),
  );

  let global_scope = crate::services::common::build_global_scope(&config_result.config);
  let enabled_plugins = EnabledPlugins::from_config(
    config_result.config.plugins.as_ref(),
    DefaultPluginKind::DryRun,
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
  let planned_outputs = build_output_files(&context, enabled_plugins)?;
  output_span.exit();

  let mut files_affected = 0usize;
  let mut dirs_affected = 0usize;

  for file in planned_outputs.values() {
    let path = Path::new(&file.path);
    if let Some(parent) = path.parent()
      && !parent.exists()
    {
      dirs_affected += crate::services::common::count_missing_directories(parent);
    }
    files_affected += 1;
  }

  logger.info(
    "Dry run completed",
    Some(json!({
      "filesWouldCreate": files_affected,
      "dirsWouldCreate": dirs_affected,
    })),
  );

  let message = if options.dry_run.unwrap_or(false) {
    Some(format!(
      "Dry run: Would create {} files and {} directories",
      files_affected, dirs_affected
    ))
  } else {
    Some(format!(
      "Planned {} files and {} directories",
      files_affected, dirs_affected
    ))
  };

  Ok(MemorySyncCommandResult {
    success: true,
    files_affected: files_affected as i32,
    dirs_affected: dirs_affected as i32,
    message,
    warnings,
    errors: Vec::new(),
  })
}

fn build_output_files(
  context: &crate::context::OutputContext,
  enabled_plugins: EnabledPlugins,
) -> Result<BTreeMap<String, PlannedOutputFile>, CliError> {
  let mut outputs = BTreeMap::new();

  let base_plans = crate::domain::base_output_plans::build_base_output_plans(context)?;
  push_base_plans(&mut outputs, &base_plans, enabled_plugins);

  if enabled_plugins.claude_code {
    let plan =
      crate::domain::output_plans::claude_code_output_plan::build_claude_code_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
  }
  if enabled_plugins.codex {
    let plan = crate::domain::output_plans::codex_output_plan::build_codex_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
  }
  if enabled_plugins.cursor {
    let plan = crate::domain::output_plans::cursor_output_plan::build_cursor_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
  }
  if enabled_plugins.droid {
    let plan = crate::domain::output_plans::droid_output_plan::build_droid_output_plan(context)?;
    push_droid_output_files(&mut outputs, &plan);
  }
  if enabled_plugins.gemini {
    let plan = crate::domain::output_plans::gemini_output_plan::build_gemini_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
  }
  if enabled_plugins.jetbrains {
    let plan = crate::domain::output_plans::jetbrains_ai_assistant_codex_output_plan::build_jetbrains_ai_assistant_codex_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
  }
  if enabled_plugins.kiro {
    let plan = crate::domain::output_plans::kiro_output_plan::build_kiro_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
  }
  if enabled_plugins.opencode {
    let plan =
      crate::domain::output_plans::opencode_output_plan::build_opencode_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
  }
  if enabled_plugins.qoder {
    let plan = crate::domain::output_plans::qoder_output_plan::build_qoder_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
  }
  if enabled_plugins.trae || enabled_plugins.trae_cn {
    let plan = crate::domain::output_plans::trae_output_plan::build_trae_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
  }
  if enabled_plugins.warp {
    let plan = crate::domain::output_plans::warp_output_plan::build_warp_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
  }
  if enabled_plugins.windsurf {
    let plan =
      crate::domain::output_plans::windsurf_output_plan::build_windsurf_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
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
  fn dry_run_returns_plan_without_writing_files() {
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

      let result = dry_run(options);
      assert!(
        result.is_ok(),
        "dry_run should succeed, got: {:?}",
        result.err()
      );
      let result = result.unwrap();
      assert!(result.success, "dry_run should report success");
      assert!(result.message.is_some(), "dry_run should return a message");
    });
  }

  #[test]
  fn dry_run_with_no_workspace_returns_plan() {
    let temp_dir = TempDir::new().unwrap();
    with_home_dir(temp_dir.path(), || {
      create_test_config(temp_dir.path(), temp_dir.path()).unwrap();

      let options = MemorySyncCommandOptions {
        cwd: Some(temp_dir.path().to_string_lossy().to_string()),
        load_user_config: Some(true),
        dry_run: Some(true),
        ..Default::default()
      };

      let result = dry_run(options);
      assert!(
        result.is_ok(),
        "dry_run should succeed, got: {:?}",
        result.err()
      );
      let result = result.unwrap();
      assert!(
        result.message.is_some(),
        "dry_run should return a message about the plan"
      );
    });
  }

  #[test]
  fn dry_run_resolve_cwd_uses_provided_path() {
    let temp_dir = TempDir::new().unwrap();
    let cwd = temp_dir.path().to_string_lossy();
    let result = resolve_cwd(Some(&cwd));
    assert!(result.is_ok());
  }

  #[test]
  fn dry_run_resolve_cwd_falls_back_to_current_dir() {
    let result = resolve_cwd(None);
    assert!(result.is_ok());
  }

  #[test]
  fn dry_run_load_config_allows_skip() {
    let temp_dir = TempDir::new().unwrap();
    let result = load_config(temp_dir.path(), Some(false));
    assert!(result.is_ok());
    let merged = result.unwrap();
    assert!(!merged.found);
  }

  #[test]
  fn dry_run_count_missing_directories_works() {
    let temp_dir = TempDir::new().unwrap();
    let nested = temp_dir.path().join("a").join("b").join("c");
    let count = crate::services::common::count_missing_directories(&nested);
    assert_eq!(count, 3);
  }

  #[test]
  fn dry_run_count_missing_directories_returns_zero_for_existing() {
    let temp_dir = TempDir::new().unwrap();
    let count = crate::services::common::count_missing_directories(temp_dir.path());
    assert_eq!(count, 0);
  }
}
