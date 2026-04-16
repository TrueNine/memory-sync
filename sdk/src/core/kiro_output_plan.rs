use std::path::PathBuf;

use crate::CliError;
use crate::core::base_output_plans::BaseOutputPluginPlanDto;
use crate::core::cleanup::{CleanupDeclarationsDto, CleanupTargetDto, CleanupTargetKindDto};
use crate::core::plugin_shared::{CollectedInputContext, Project, RelativePath, Workspace};

const KIRO_PLUGIN_NAME: &str = "KiroCLIOutputAdaptor";
const PROJECT_SCOPE: &str = "project";
const GLOBAL_SCOPE: &str = "global";

pub fn collect_kiro_output_plan(context_json: &str) -> Result<String, CliError> {
  let context = serde_json::from_str::<CollectedInputContext>(context_json)?;
  let plan = build_kiro_output_plan(&context)?;
  serde_json::to_string(&plan).map_err(CliError::from)
}

pub fn build_kiro_output_plan(
  context: &CollectedInputContext,
) -> Result<BaseOutputPluginPlanDto, CliError> {
  let workspace = context.workspace.as_ref().ok_or_else(|| {
    CliError::ExecutionError(
      "collectKiroOutputPlan requires collectedOutputContext.workspace".to_string(),
    )
  })?;

  Ok(BaseOutputPluginPlanDto {
    plugin_name: KIRO_PLUGIN_NAME.to_string(),
    output_files: Vec::new(),
    cleanup: build_cleanup(workspace),
  })
}

fn build_cleanup(workspace: &Workspace) -> CleanupDeclarationsDto {
  let mut delete = Vec::new();

  let project_globs = [
    ".kiro/streening",
    ".kiro/streening/**/*",
    ".kiro/specs",
    ".kiro/specs/**/*",
    ".kiro/settings/mcp.json",
    "**/.kiro/streening",
    "**/.kiro/streening/**/*",
    "**/.kiro/specs",
    "**/.kiro/specs/**/*",
    "**/.kiro/settings/mcp.json",
  ];

  let global_globs = [".kiro/streening", ".kiro/streening/**/*"];

  for project in get_project_output_projects(workspace) {
    let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
      continue;
    };
    for glob in &project_globs {
      delete.push(CleanupTargetDto {
        path: normalize_glob_pattern(project_root_dir.join(glob)),
        kind: CleanupTargetKindDto::Glob,
        exclude_basenames: Vec::new(),
        protection_mode: None,
        scope: Some(PROJECT_SCOPE.to_string()),
        label: Some("delete.project.glob".to_string()),
      });
    }
  }

  for glob in &global_globs {
    delete.push(CleanupTargetDto {
      path: normalize_glob_pattern(resolve_home_dir().join(glob)),
      kind: CleanupTargetKindDto::Glob,
      exclude_basenames: Vec::new(),
      protection_mode: None,
      scope: Some(GLOBAL_SCOPE.to_string()),
      label: Some("delete.global.glob".to_string()),
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
    .filter(|project| project.is_workspace_root_project != Some(true))
}

fn get_project_output_projects(workspace: &Workspace) -> Vec<&Project> {
  let mut projects: Vec<&Project> = get_concrete_projects(workspace).collect();
  if let Some(workspace_root_project) = workspace
    .projects
    .iter()
    .find(|project| project.is_workspace_root_project == Some(true))
  {
    projects.push(workspace_root_project);
  }
  projects
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

fn resolve_relative_path(relative_path: &RelativePath) -> PathBuf {
  let raw_path = std::path::Path::new(&relative_path.path);
  if raw_path.is_absolute() {
    return raw_path.to_path_buf();
  }
  if relative_path.base_path.is_empty() {
    return raw_path.to_path_buf();
  }
  PathBuf::from(&relative_path.base_path).join(raw_path)
}

fn resolve_home_dir() -> PathBuf {
  dirs::home_dir().unwrap_or_else(|| PathBuf::from("~"))
}

fn normalize_glob_pattern(path: PathBuf) -> String {
  path.to_string_lossy().replace('\\', "/")
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::core::plugin_shared::RootPath;

  fn create_relative_path(base_path: &str, path: &str) -> RelativePath {
    RelativePath::new(path, base_path)
  }

  fn create_workspace(workspace_dir: &str) -> Workspace {
    Workspace {
      directory: RootPath::new(workspace_dir),
      projects: vec![
        Project {
          name: Some("__workspace__".to_string()),
          is_workspace_root_project: Some(true),
          ..Project::default()
        },
        Project {
          name: Some("project-a".to_string()),
          dir_from_workspace_path: Some(create_relative_path(workspace_dir, "project-a")),
          ..Project::default()
        },
      ],
    }
  }

  #[test]
  fn kiro_plan_has_no_output_files() {
    let workspace = create_workspace("/tmp/workspace");
    let plan = build_kiro_output_plan(&CollectedInputContext {
      workspace: Some(workspace),
      ..CollectedInputContext::default()
    })
    .unwrap();
    assert!(plan.output_files.is_empty());
    assert_eq!(plan.plugin_name, "KiroCLIOutputAdaptor");
  }

  #[test]
  fn kiro_cleanup_contains_expected_globs() {
    let workspace_dir = "/tmp/workspace";
    let workspace = create_workspace(workspace_dir);
    let plan = build_kiro_output_plan(&CollectedInputContext {
      workspace: Some(workspace),
      ..CollectedInputContext::default()
    })
    .unwrap();

    let paths: Vec<&str> = plan
      .cleanup
      .delete
      .iter()
      .map(|d| d.path.as_str())
      .collect();

    assert!(
      paths.iter().any(|p| *p == "/tmp/workspace/.kiro/streening"),
      "expected workspace root glob"
    );
    assert!(
      paths
        .iter()
        .any(|p| *p == "/tmp/workspace/project-a/.kiro/specs/**/*"),
      "expected project glob"
    );
    assert!(
      paths.iter().any(|p| p.ends_with(".kiro/settings/mcp.json")),
      "expected mcp.json glob"
    );
  }
}
