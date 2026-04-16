use std::path::PathBuf;

use crate::CliError;
use crate::core::base_output_plans::{BaseOutputFileDeclarationDto, BaseOutputPluginPlanDto};
use crate::core::cleanup::{CleanupDeclarationsDto, CleanupTargetDto, CleanupTargetKindDto};
use crate::core::plugin_shared::{CollectedInputContext, Project, RelativePath, Workspace};

const CODEX_PLUGIN_NAME: &str = "CodexCLIOutputAdaptor";
const CODEX_INSTRUCTIONS_FILE: &str = "AGENTS.md";
const AGENTS_OUTPUT_ADAPTOR: &str = "AgentsOutputAdaptor";
const PROJECT_SCOPE: &str = "project";

pub fn collect_codex_output_plan(context_json: &str) -> Result<String, CliError> {
  let context = serde_json::from_str::<CollectedInputContext>(context_json)?;
  let plan = build_codex_output_plan(&context)?;
  serde_json::to_string(&plan).map_err(CliError::from)
}

pub fn build_codex_output_plan(
  context: &CollectedInputContext,
) -> Result<BaseOutputPluginPlanDto, CliError> {
  let workspace = context.workspace.as_ref().ok_or_else(|| {
    CliError::ExecutionError(
      "collectCodexOutputPlan requires collectedOutputContext.workspace".to_string(),
    )
  })?;

  Ok(BaseOutputPluginPlanDto {
    plugin_name: CODEX_PLUGIN_NAME.to_string(),
    output_files: build_output_files(workspace, context),
    cleanup: build_cleanup(workspace),
  })
}

fn build_output_files(
  workspace: &Workspace,
  context: &CollectedInputContext,
) -> Vec<BaseOutputFileDeclarationDto> {
  let mut output_files = Vec::new();
  let prompt_projects = get_project_prompt_output_projects(workspace);
  let agents_registered = context
    .registered_output_plugins
    .as_ref()
    .map(|plugins| plugins.iter().any(|name| name == AGENTS_OUTPUT_ADAPTOR))
    .unwrap_or(false);

  if agents_registered {
    if let Some(global_memory) = context.global_memory.as_ref() {
      for project in &prompt_projects {
        let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
          continue;
        };
        output_files.push(BaseOutputFileDeclarationDto {
          path: project_root_dir.join(CODEX_INSTRUCTIONS_FILE).to_string_lossy().into_owned(),
          scope: Some(PROJECT_SCOPE.to_string()),
          content: global_memory.content.clone(),
        });
      }
    }
  } else {
    let global_memory_content = context.global_memory.as_ref().map(|m| m.content.as_str());
    for project in &prompt_projects {
      let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else { continue };
      if let Some(root_prompt) = project.root_memory_prompt.as_ref() {
        let combined_content = combine_global_with_content(global_memory_content, &root_prompt.content);
        output_files.push(BaseOutputFileDeclarationDto {
          path: project_root_dir.join(CODEX_INSTRUCTIONS_FILE).to_string_lossy().into_owned(),
          scope: Some(PROJECT_SCOPE.to_string()),
          content: combined_content,
        });
      }
      if let Some(child_prompts) = project.child_memory_prompts.as_ref() {
        for child_prompt in child_prompts {
          output_files.push(BaseOutputFileDeclarationDto {
            path: resolve_relative_path(&child_prompt.dir).join(CODEX_INSTRUCTIONS_FILE).to_string_lossy().into_owned(),
            scope: Some(PROJECT_SCOPE.to_string()),
            content: child_prompt.content.clone(),
          });
        }
      }
    }
  }

  output_files
}

fn combine_global_with_content(global_content: Option<&str>, project_content: &str) -> String {
  match global_content {
    Some(global) if !global.trim().is_empty() => format!("{}\n\n{}", global.trim(), project_content.trim()),
    _ => project_content.to_string(),
  }
}

fn build_cleanup(workspace: &Workspace) -> CleanupDeclarationsDto {
  let mut delete = Vec::new();
  for project in get_project_output_projects(workspace) {
    let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else { continue };
    delete.push(CleanupTargetDto {
      path: project_root_dir.join(CODEX_INSTRUCTIONS_FILE).to_string_lossy().into_owned(),
      kind: CleanupTargetKindDto::File,
      exclude_basenames: Vec::new(),
      protection_mode: None,
      scope: Some(PROJECT_SCOPE.to_string()),
      label: Some("delete.project".to_string()),
    });
  }
  CleanupDeclarationsDto { delete, ..CleanupDeclarationsDto::default() }
}

fn get_concrete_projects(workspace: &Workspace) -> impl Iterator<Item = &Project> {
  workspace.projects.iter().filter(|p| p.is_workspace_root_project != Some(true))
}

fn get_project_output_projects(workspace: &Workspace) -> Vec<&Project> {
  let mut projects: Vec<&Project> = get_concrete_projects(workspace).collect();
  if let Some(root) = workspace.projects.iter().find(|p| p.is_workspace_root_project == Some(true)) {
    projects.push(root);
  }
  projects
}

fn get_project_prompt_output_projects(workspace: &Workspace) -> Vec<&Project> {
  get_project_output_projects(workspace).into_iter().filter(|p| p.is_prompt_source_project != Some(true)).collect()
}

fn resolve_project_root_dir(workspace: &Workspace, project: &Project) -> Option<PathBuf> {
  if project.is_workspace_root_project == Some(true) {
    return Some(PathBuf::from(&workspace.directory.path));
  }
  project.dir_from_workspace_path.as_ref().map(resolve_relative_path)
}

fn resolve_relative_path(rp: &RelativePath) -> PathBuf {
  let raw = std::path::Path::new(&rp.path);
  if raw.is_absolute() { return raw.to_path_buf(); }
  if rp.base_path.is_empty() { return raw.to_path_buf(); }
  PathBuf::from(&rp.base_path).join(raw)
}
