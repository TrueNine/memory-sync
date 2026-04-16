use super::plugin_shared::{RelativePath, Workspace};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExecutionScope {
  Workspace,
  Project,
  External,
  Unsupported,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionPlanProjectSummary {
  pub name: String,
  pub root_dir: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub project_type: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionPlanProjectsByType {
  pub app: Vec<ExecutionPlanProjectSummary>,
  pub ext: Vec<ExecutionPlanProjectSummary>,
  pub arch: Vec<ExecutionPlanProjectSummary>,
  pub softwares: Vec<ExecutionPlanProjectSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionPlan {
  pub scope: ExecutionScope,
  pub cwd: String,
  pub workspace_dir: String,
  pub projects_by_type: ExecutionPlanProjectsByType,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub matched_project: Option<ExecutionPlanProjectSummary>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub managed_projects: Option<Vec<ExecutionPlanProjectSummary>>,
}

pub fn resolve_execution_plan(workspace: &Workspace, execution_cwd: &str) -> ExecutionPlan {
  let cwd = normalize_absolute_path(execution_cwd);
  let workspace_dir = normalize_absolute_path(&workspace.directory.path);
  let managed_projects = collect_managed_projects(workspace);

  let projects_by_type = if managed_projects.is_empty() {
    ExecutionPlanProjectsByType::default()
  } else {
    group_projects_by_type(&managed_projects)
  };

  if cwd == workspace_dir {
    return ExecutionPlan {
      scope: ExecutionScope::Workspace,
      cwd: cwd.to_string_lossy().into_owned(),
      workspace_dir: workspace_dir.to_string_lossy().into_owned(),
      projects_by_type,
      matched_project: None,
      managed_projects: None,
    };
  }

  if let Some(matched_project) = find_matched_project(&cwd, &managed_projects) {
    return ExecutionPlan {
      scope: ExecutionScope::Project,
      cwd: cwd.to_string_lossy().into_owned(),
      workspace_dir: workspace_dir.to_string_lossy().into_owned(),
      projects_by_type,
      matched_project: Some(matched_project),
      managed_projects: None,
    };
  }

  if is_same_or_child_path(&cwd, &workspace_dir) {
    return ExecutionPlan {
      scope: ExecutionScope::Unsupported,
      cwd: cwd.to_string_lossy().into_owned(),
      workspace_dir: workspace_dir.to_string_lossy().into_owned(),
      projects_by_type,
      matched_project: None,
      managed_projects: Some(managed_projects),
    };
  }

  ExecutionPlan {
    scope: ExecutionScope::External,
    cwd: cwd.to_string_lossy().into_owned(),
    workspace_dir: workspace_dir.to_string_lossy().into_owned(),
    projects_by_type,
    matched_project: None,
    managed_projects: None,
  }
}

fn normalize_absolute_path(raw_path: &str) -> PathBuf {
  let p = Path::new(raw_path);
  if p.is_absolute() {
    p.to_path_buf()
  } else {
    std::env::current_dir()
      .unwrap_or_else(|_| PathBuf::from("."))
      .join(p)
  }
  // Note: simplification, not doing full canonicalization to match TS behavior
}

fn is_same_or_child_path(candidate: &Path, parent: &Path) -> bool {
  if candidate == parent {
    return true;
  }
  candidate.starts_with(parent)
}

pub fn collect_managed_projects(workspace: &Workspace) -> Vec<ExecutionPlanProjectSummary> {
  let mut projects = Vec::new();
  for project in &workspace.projects {
    if project.is_workspace_root_project == Some(true) {
      continue;
    }
    let Some(name) = &project.name else { continue };
    let Some(dir_rel) = &project.dir_from_workspace_path else {
      continue;
    };

    let root_dir = resolve_relative_path(dir_rel);

    projects.push(ExecutionPlanProjectSummary {
      name: name.clone(),
      root_dir: root_dir.to_string_lossy().into_owned(),
      project_type: project.project_type.clone(),
    });
  }

  // Sort projects by type, then name
  projects.sort_by(|a, b| {
    let type_a = a.project_type.as_deref().unwrap_or("");
    let type_b = b.project_type.as_deref().unwrap_or("");
    type_a.cmp(type_b).then_with(|| a.name.cmp(&b.name))
  });

  projects
}

fn resolve_relative_path(relative_path: &RelativePath) -> PathBuf {
  let raw_path = Path::new(&relative_path.path);
  if raw_path.is_absolute() {
    raw_path.to_path_buf()
  } else if relative_path.base_path.is_empty() {
    raw_path.to_path_buf()
  } else {
    PathBuf::from(&relative_path.base_path).join(raw_path)
  }
}

fn group_projects_by_type(projects: &[ExecutionPlanProjectSummary]) -> ExecutionPlanProjectsByType {
  let mut grouped = ExecutionPlanProjectsByType::default();
  for p in projects {
    match p.project_type.as_deref() {
      Some("app") => grouped.app.push(p.clone()),
      Some("ext") => grouped.ext.push(p.clone()),
      Some("arch") => grouped.arch.push(p.clone()),
      Some("softwares") => grouped.softwares.push(p.clone()),
      _ => {}
    }
  }
  grouped
}

fn find_matched_project(
  cwd: &Path,
  managed_projects: &[ExecutionPlanProjectSummary],
) -> Option<ExecutionPlanProjectSummary> {
  let mut matches: Vec<&ExecutionPlanProjectSummary> = managed_projects
    .iter()
    .filter(|p| is_same_or_child_path(cwd, Path::new(&p.root_dir)))
    .collect();

  if matches.is_empty() {
    return None;
  }

  // Sort by longest root_dir to get the most specific match
  matches.sort_by(|a, b| b.root_dir.len().cmp(&a.root_dir.len()));

  matches.first().map(|&p| p.clone())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScopedTargetOwnership {
  Global,
  Workspace,
  Project,
  External,
}

pub fn filter_path_scoped_entries<T>(
  entries: Vec<T>,
  plan: &ExecutionPlan,
  workspace_dir: &str,
  managed_projects: &[ExecutionPlanProjectSummary],
  get_path: impl Fn(&T) -> &str,
  get_scope: impl Fn(&T) -> Option<&str>,
) -> Vec<T> {
  entries
    .into_iter()
    .filter(|entry| {
      let path = get_path(entry);
      let scope = get_scope(entry);
      let ownership = classify_path_scoped_entry(path, scope, workspace_dir, managed_projects);
      should_include_target_ownership(plan, ownership, path, managed_projects)
    })
    .collect()
}

fn is_global_scoped_entry(scope: Option<&str>) -> bool {
  matches!(scope, Some("global") | Some("xdgConfig"))
}

fn classify_path_scoped_entry(
  entry_path: &str,
  scope: Option<&str>,
  workspace_dir: &str,
  managed_projects: &[ExecutionPlanProjectSummary],
) -> ScopedTargetOwnership {
  if is_global_scoped_entry(scope) {
    return ScopedTargetOwnership::Global;
  }

  let entry_abs = normalize_absolute_path(entry_path);
  let workspace_abs = normalize_absolute_path(workspace_dir);

  if find_matched_project(&entry_abs, managed_projects).is_some() {
    return ScopedTargetOwnership::Project;
  }

  if is_same_or_child_path(&entry_abs, &workspace_abs) {
    return ScopedTargetOwnership::Workspace;
  }

  ScopedTargetOwnership::External
}

fn should_include_target_ownership(
  plan: &ExecutionPlan,
  ownership: ScopedTargetOwnership,
  entry_path: &str,
  managed_projects: &[ExecutionPlanProjectSummary],
) -> bool {
  if plan.scope == ExecutionScope::Unsupported {
    return false;
  }
  if ownership == ScopedTargetOwnership::Global {
    return true;
  }
  if plan.scope == ExecutionScope::External {
    return true;
  }
  if plan.scope == ExecutionScope::Workspace {
    return ownership == ScopedTargetOwnership::Workspace;
  }
  if ownership != ScopedTargetOwnership::Project {
    return false;
  }

  let entry_abs = normalize_absolute_path(entry_path);
  let matched_project = find_matched_project(&entry_abs, managed_projects);

  match (&plan.matched_project, matched_project) {
    (Some(p1), Some(p2)) => p1.root_dir == p2.root_dir,
    _ => false,
  }
}
