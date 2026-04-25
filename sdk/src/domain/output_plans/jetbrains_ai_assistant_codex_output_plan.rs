use crate::CliError;
use crate::domain::base_output_plans::BaseOutputPluginPlanDto;
use crate::domain::cleanup::CleanupDeclarationsDto;
use crate::domain::output_context::OutputContext;
use crate::domain::plugin_shared::Workspace;

const JB_PLUGIN_NAME: &str = "JetBrainsAIAssistantCodexOutputAdaptor";

pub fn collect_jetbrains_ai_assistant_codex_output_plan(
  context_json: &str,
) -> Result<String, CliError> {
  let context = serde_json::from_str::<OutputContext>(context_json)?;
  let plan = build_jetbrains_ai_assistant_codex_output_plan(&context)?;
  serde_json::to_string(&plan).map_err(CliError::from)
}

pub fn build_jetbrains_ai_assistant_codex_output_plan(
  context: &OutputContext,
) -> Result<BaseOutputPluginPlanDto, CliError> {
  let workspace = context.workspace.as_ref().ok_or_else(|| {
    CliError::ExecutionError(
      "collectJetBrainsAIAssistantCodexOutputPlan requires collectedOutputContext.workspace"
        .to_string(),
    )
  })?;
  Ok(BaseOutputPluginPlanDto {
    plugin_name: JB_PLUGIN_NAME.to_string(),
    output_files: Vec::new(),
    cleanup: build_cleanup(workspace),
  })
}

fn build_cleanup(_workspace: &Workspace) -> CleanupDeclarationsDto {
  CleanupDeclarationsDto {
    delete: Vec::new(),
    ..CleanupDeclarationsDto::default()
  }
}
