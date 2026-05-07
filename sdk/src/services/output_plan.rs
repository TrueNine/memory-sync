use std::collections::BTreeMap;

use crate::domain::base_output_plans::{BaseOutputFileDeclarationDto, BaseOutputPlansDto};
use crate::domain::output_plans::droid_output_plan::DroidOutputPlanDto;
use crate::infra::logger::Logger;
use crate::CliError;

/// Shared output file descriptor used by both install and dry-run.
/// Install writes these to disk; dry-run counts them and reports the plan.
#[derive(Debug, Clone)]
pub(crate) struct PlannedOutputFile {
  pub path: String,
  pub content: String,
  pub encoding: Option<String>,
}

/// Build the complete output plan from context across all enabled plugins.
/// Returns a map of path → PlannedOutputFile.
///
/// Shared between `install_service` (which writes) and `dry_run_service` (which
/// counts / reports).  Keeps the two code paths in sync — a single source of
/// truth for the build phase, with the write phase being the only difference.
pub(crate) fn build_output_files(
  context: &crate::context::OutputContext,
  enabled_plugins: crate::services::common::EnabledPlugins,
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
    let plan =
      crate::domain::output_plans::cursor_output_plan::build_cursor_output_plan(context)?;
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
    let plan =
      crate::domain::output_plans::gemini_output_plan::build_gemini_output_plan(context)?;
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
  if enabled_plugins.windsurf {
    let plugin_span = logger.span("output.windsurf").enter();
    let plan =
      crate::domain::output_plans::windsurf_output_plan::build_windsurf_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
    plugin_span.exit();
  }

  Ok(outputs)
}

pub(crate) fn push_base_plans(
  outputs: &mut BTreeMap<String, PlannedOutputFile>,
  base_plans: &BaseOutputPlansDto,
  enabled_plugins: crate::services::common::EnabledPlugins,
) {
  for plan in &base_plans.plugins {
    if enabled_plugins.is_enabled(&plan.plugin_name) {
      push_base_output_files(outputs, &plan.output_files);
    }
  }
}

pub(crate) fn push_base_output_files(
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

pub(crate) fn push_droid_output_files(
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
