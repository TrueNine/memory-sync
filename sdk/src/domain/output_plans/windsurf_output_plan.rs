use std::path::PathBuf;

use crate::domain::base_output_plans::{BaseOutputFileDeclarationDto, BaseOutputPluginPlanDto};
use crate::context::OutputContext;
use crate::domain::plugin_shared::{Project, RelativePath, Workspace};
use crate::policy::cleanup::{CleanupDeclarationsDto, CleanupTargetDto, CleanupTargetKindDto};
use crate::CliError;

const WINDSURF_PLUGIN_NAME: &str = "WindsurfOutputAdaptor";
const WINDSURF_MEMORY_FILE: &str = ".windsurfrules";
const AGENTS_OUTPUT_ADAPTOR: &str = "AgentsOutputAdaptor";
const PROJECT_SCOPE: &str = "project";

pub fn collect_windsurf_output_plan(context_json: &str) -> Result<String, CliError> {
  let context = serde_json::from_str::<OutputContext>(context_json)?;
  let plan = build_windsurf_output_plan(&context)?;
  serde_json::to_string(&plan).map_err(CliError::from)
}

pub fn build_windsurf_output_plan(
  context: &OutputContext,
) -> Result<BaseOutputPluginPlanDto, CliError> {
  let workspace = context.workspace.as_ref().ok_or_else(|| {
    CliError::ExecutionError(
      "collectWindsurfOutputPlan requires collectedOutputContext.workspace".to_string(),
    )
  })?;
  Ok(BaseOutputPluginPlanDto {
    plugin_name: WINDSURF_PLUGIN_NAME.to_string(),
    output_files: build_output_files(workspace, context),
    cleanup: build_cleanup(workspace),
  })
}

fn build_output_files(
  workspace: &Workspace,
  context: &OutputContext,
) -> Vec<BaseOutputFileDeclarationDto> {
  let mut output_files = Vec::new();
  let prompt_projects = get_project_prompt_output_projects(workspace);
  let agents_registered = context
    .registered_output_plugins
    .as_ref()
    .map(|p| p.iter().any(|n| n == AGENTS_OUTPUT_ADAPTOR))
    .unwrap_or(false);
  if agents_registered {
    if let Some(gm) = context.global_memory.as_ref() {
      for project in &prompt_projects {
        let Some(prd) = resolve_project_root_dir(workspace, project) else {
          continue;
        };
        output_files.push(BaseOutputFileDeclarationDto {
          path: prd
            .join(WINDSURF_MEMORY_FILE)
            .to_string_lossy()
            .into_owned(),
          scope: Some(PROJECT_SCOPE.to_string()),
          content: gm.content.clone(),
        });
      }
    }
  } else {
    let gmc = context.global_memory.as_ref().map(|m| m.content.as_str());
    for project in &prompt_projects {
      let Some(prd) = resolve_project_root_dir(workspace, project) else {
        continue;
      };
      if let Some(rp) = project.root_memory_prompt.as_ref() {
        output_files.push(BaseOutputFileDeclarationDto {
          path: prd
            .join(WINDSURF_MEMORY_FILE)
            .to_string_lossy()
            .into_owned(),
          scope: Some(PROJECT_SCOPE.to_string()),
          content: combine_global_with_content(gmc, &rp.content),
        });
      }
    }
  }
  output_files
}

fn combine_global_with_content(gc: Option<&str>, pc: &str) -> String {
  match gc {
    Some(g) if !g.trim().is_empty() => format!("{}\n\n{}", g.trim(), pc.trim()),
    _ => pc.to_string(),
  }
}

fn build_cleanup(workspace: &Workspace) -> CleanupDeclarationsDto {
  let mut delete = Vec::new();
  for project in get_project_output_projects(workspace) {
    let Some(prd) = resolve_project_root_dir(workspace, project) else {
      continue;
    };
    delete.push(CleanupTargetDto {
      path: prd
        .join(WINDSURF_MEMORY_FILE)
        .to_string_lossy()
        .into_owned(),
      kind: CleanupTargetKindDto::File,
      exclude_basenames: Vec::new(),
      protection_mode: None,
      scope: Some(PROJECT_SCOPE.to_string()),
      label: Some("delete.project".to_string()),
    });
  }
  CleanupDeclarationsDto {
    delete,
    ..CleanupDeclarationsDto::default()
  }
}

fn get_concrete_projects(workspace: &Workspace) -> impl Iterator<Item = &Project> {
  workspace
    .projects
    .iter()
    .filter(|p| p.is_workspace_root_project != Some(true))
}
fn get_project_output_projects(workspace: &Workspace) -> Vec<&Project> {
  let mut ps: Vec<&Project> = get_concrete_projects(workspace).collect();
  if let Some(r) = workspace
    .projects
    .iter()
    .find(|p| p.is_workspace_root_project == Some(true))
  {
    ps.push(r);
  }
  ps
}
fn get_project_prompt_output_projects(workspace: &Workspace) -> Vec<&Project> {
  get_project_output_projects(workspace)
    .into_iter()
    .filter(|p| p.is_prompt_source_project != Some(true))
    .collect()
}
fn resolve_project_root_dir(workspace: &Workspace, project: &Project) -> Option<PathBuf> {
  if project.is_workspace_root_project == Some(true) {
    return Some(PathBuf::from(&workspace.directory.path));
  }
  project
    .dir_from_workspace_path
    .as_ref()
    .map(resolve_relative_path)
}
fn resolve_relative_path(rp: &RelativePath) -> PathBuf {
  let r = std::path::Path::new(&rp.path);
  if r.is_absolute() {
    return r.to_path_buf();
  }
  if rp.base_path.is_empty() {
    return r.to_path_buf();
  }
  PathBuf::from(&rp.base_path).join(r)
}
