use crate::CliError;
use crate::domain::output_context::OutputContext;
use crate::domain::base_output_plans::BaseOutputPluginPlanDto;
use crate::domain::plugin_shared::Workspace;
use crate::domain::cleanup::CleanupDeclarationsDto;

const QODER_PLUGIN_NAME: &str = "QoderIDEPluginOutputAdaptor";

pub fn collect_qoder_output_plan(context_json: &str) -> Result<String, CliError> {
  let context = serde_json::from_str::<OutputContext>(context_json)?;
  let plan = build_qoder_output_plan(&context)?;
  serde_json::to_string(&plan).map_err(CliError::from)
}

pub fn build_qoder_output_plan(
  context: &OutputContext,
) -> Result<BaseOutputPluginPlanDto, CliError> {
  let workspace = context.workspace.as_ref().ok_or_else(|| {
    CliError::ExecutionError(
      "collectQoderOutputPlan requires collectedOutputContext.workspace".to_string(),
    )
  })?;
  Ok(BaseOutputPluginPlanDto {
    plugin_name: QODER_PLUGIN_NAME.to_string(),
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
