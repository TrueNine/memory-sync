use crate::CliError;
use crate::context::OutputContext;
use crate::domain::base_output_plans::BaseOutputPluginPlanDto;
use crate::domain::plugin_shared::Workspace;
use crate::policy::cleanup::CleanupDeclarationsDto;

const GENERIC_SKILLS_PLUGIN_NAME: &str = "GenericSkillsOutputAdaptor";

pub fn collect_generic_skills_output_plan(context_json: &str) -> Result<String, CliError> {
  let context = serde_json::from_str::<OutputContext>(context_json)?;
  let plan = build_generic_skills_output_plan(&context)?;
  serde_json::to_string(&plan).map_err(CliError::from)
}

pub fn build_generic_skills_output_plan(
  context: &OutputContext,
) -> Result<BaseOutputPluginPlanDto, CliError> {
  let workspace = context.workspace.as_ref().ok_or_else(|| {
    CliError::ExecutionError(
      "collectGenericSkillsOutputPlan requires collectedOutputContext.workspace".to_string(),
    )
  })?;
  Ok(BaseOutputPluginPlanDto {
    plugin_name: GENERIC_SKILLS_PLUGIN_NAME.to_string(),
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
