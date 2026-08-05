use std::path::PathBuf;

use crate::domain::cleanup::{CleanupDeclarationsDto, CleanupTargetDto, CleanupTargetKindDto};
use crate::domain::plugin_shared::{Project, RelativePath, Workspace};

const WARP_MEMORY_FILE: &str = "WARP.md";
const PROJECT_SCOPE: &str = "project";

/// Build cleanup declarations for WARP.md files.
/// Output generation is no longer supported, but cleanup is retained
/// to allow users to remove previously-generated WARP.md files.
pub fn build_warp_cleanup(workspace: &Workspace) -> CleanupDeclarationsDto {
  let mut delete = Vec::new();

  for project in get_project_output_projects(workspace) {
    let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
      continue;
    };

    delete.push(CleanupTargetDto {
      path: project_root_dir
        .join(WARP_MEMORY_FILE)
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

#[cfg(test)]
mod tests {
  use tempfile::TempDir;

  use super::*;
  use crate::domain::plugin_shared::{Project, RelativePath, RootPath};

  fn create_project(workspace_root: &str, name: &str) -> Project {
    Project {
      name: Some(name.to_string()),
      dir_from_workspace_path: Some(RelativePath::new(name, workspace_root)),
      ..Project::default()
    }
  }

  #[test]
  fn cleanup_targets_project_memory_files() {
    let temp_dir = TempDir::new().unwrap();
    let workspace_dir = temp_dir.path().join("workspace");

    let workspace = Workspace {
      directory: RootPath::new(&workspace_dir.to_string_lossy()),
      projects: vec![
        Project {
          is_workspace_root_project: Some(true),
          ..Project::default()
        },
        create_project(&workspace_dir.to_string_lossy(), "project-a"),
      ],
    };

    let cleanup = build_warp_cleanup(&workspace);
    let delete_paths = cleanup
      .delete
      .iter()
      .map(|target| target.path.as_str())
      .collect::<Vec<_>>();

    assert!(delete_paths.contains(&workspace_dir.join("WARP.md").to_string_lossy().as_ref()));
    assert!(
      delete_paths.contains(
        &workspace_dir
          .join("project-a")
          .join("WARP.md")
          .to_string_lossy()
          .as_ref()
      )
    );
  }
}
