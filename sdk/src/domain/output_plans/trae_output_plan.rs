use std::path::PathBuf;

use crate::CliError;
use crate::domain::base_output_plans::{BaseOutputFileDeclarationDto, BaseOutputPluginPlanDto};
use crate::domain::cleanup::{CleanupDeclarationsDto, CleanupTargetDto, CleanupTargetKindDto};
use crate::domain::output_context::OutputContext;
use crate::domain::plugin_shared::{Project, RelativePath, Workspace};

const TRAE_PLUGIN_NAME: &str = "TraeOutputAdaptor";
const TRAE_STEERING_FILE: &str = "GLOBAL.md";
const TRAE_CN_USER_RULES_FILE: &str = "GLOBAL.md";
const AGENTS_OUTPUT_ADAPTOR: &str = "AgentsOutputAdaptor";
const PROJECT_SCOPE: &str = "project";

pub fn collect_trae_output_plan(context_json: &str) -> Result<String, CliError> {
  let context = serde_json::from_str::<OutputContext>(context_json)?;
  let plan = build_trae_output_plan(&context)?;
  serde_json::to_string(&plan).map_err(CliError::from)
}

pub fn build_trae_output_plan(
  context: &OutputContext,
) -> Result<BaseOutputPluginPlanDto, CliError> {
  let workspace = context.workspace.as_ref().ok_or_else(|| {
    CliError::ExecutionError(
      "collectTraeOutputPlan requires collectedOutputContext.workspace".to_string(),
    )
  })?;

  Ok(BaseOutputPluginPlanDto {
    plugin_name: TRAE_PLUGIN_NAME.to_string(),
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
    .map(|plugins| plugins.iter().any(|name| name == AGENTS_OUTPUT_ADAPTOR))
    .unwrap_or(false);

  let global_content: Option<String> = if agents_registered {
    context.global_memory.as_ref().map(|m| m.content.clone())
  } else {
    None
  };

  for project in &prompt_projects {
    let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
      continue;
    };

    let content = if agents_registered {
      global_content.clone()
    } else {
      let global_mem = context.global_memory.as_ref().map(|m| m.content.as_str());
      project
        .root_memory_prompt
        .as_ref()
        .map(|rp| combine_global_with_content(global_mem, &rp.content))
    };

    if let Some(content) = content {
      let steering_dir = project_root_dir.join(".trae").join("steering");
      output_files.push(BaseOutputFileDeclarationDto {
        path: steering_dir
          .join(TRAE_STEERING_FILE)
          .to_string_lossy()
          .into_owned(),
        scope: Some(PROJECT_SCOPE.to_string()),
        content,
        encoding: None,
      });
    }
  }

  output_files
}

fn combine_global_with_content(global_content: Option<&str>, project_content: &str) -> String {
  match global_content {
    Some(global) if !global.trim().is_empty() => {
      format!("{}\n\n{}", global.trim(), project_content.trim())
    }
    _ => project_content.to_string(),
  }
}

fn build_cleanup(workspace: &Workspace) -> CleanupDeclarationsDto {
  let mut delete = Vec::new();

  for project in get_project_output_projects(workspace) {
    let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
      continue;
    };

    delete.push(CleanupTargetDto {
      path: project_root_dir
        .join(".trae")
        .join("steering")
        .join(TRAE_STEERING_FILE)
        .to_string_lossy()
        .into_owned(),
      kind: CleanupTargetKindDto::File,
      exclude_basenames: Vec::new(),
      protection_mode: None,
      scope: Some(PROJECT_SCOPE.to_string()),
      label: Some("delete.traeSteering".to_string()),
    });

    delete.push(CleanupTargetDto {
      path: project_root_dir
        .join(".trae-cn")
        .join("user_rules")
        .join(TRAE_CN_USER_RULES_FILE)
        .to_string_lossy()
        .into_owned(),
      kind: CleanupTargetKindDto::File,
      exclude_basenames: Vec::new(),
      protection_mode: None,
      scope: Some(PROJECT_SCOPE.to_string()),
      label: Some("delete.traeCnUserRules".to_string()),
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
  let mut projects: Vec<&Project> = get_concrete_projects(workspace).collect();
  if let Some(root) = workspace
    .projects
    .iter()
    .find(|p| p.is_workspace_root_project == Some(true))
  {
    projects.push(root);
  }
  projects
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
  let raw = std::path::Path::new(&rp.path);
  if raw.is_absolute() {
    return raw.to_path_buf();
  }
  if rp.base_path.is_empty() {
    return raw.to_path_buf();
  }
  PathBuf::from(&rp.base_path).join(raw)
}

#[cfg(test)]
mod tests {
  use tempfile::TempDir;

  use super::*;
  use crate::domain::plugin_shared::{
    FilePathKind, GlobalMemoryPrompt, ProjectRootMemoryPrompt, PromptKind, RootPath,
  };

  fn create_relative_path(base_path: &str, path: &str) -> RelativePath {
    RelativePath::new(path, base_path)
  }

  fn create_root_prompt(content: &str) -> ProjectRootMemoryPrompt {
    ProjectRootMemoryPrompt {
      prompt_type: PromptKind::ProjectRootMemory,
      content: content.to_string(),
      length: content.len(),
      file_path_kind: FilePathKind::Root,
      dir: RootPath::new(""),
      yaml_front_matter: None,
      raw_front_matter: None,
      markdown_ast: None,
      markdown_contents: None,
    }
  }

  fn create_global_memory(content: &str) -> GlobalMemoryPrompt {
    GlobalMemoryPrompt {
      prompt_type: PromptKind::GlobalMemory,
      content: content.to_string(),
      length: content.len(),
      file_path_kind: FilePathKind::Relative,
      dir: create_relative_path("/home", ".trae"),
      raw_front_matter: None,
      markdown_contents: None,
      parent_directory_path: None,
      raw_content: None,
    }
  }

  fn create_project(workspace_root: &str, name: &str) -> Project {
    Project {
      name: Some(name.to_string()),
      dir_from_workspace_path: Some(create_relative_path(workspace_root, name)),
      ..Project::default()
    }
  }

  #[test]
  fn trae_output_contains_only_steering_not_trae_cn() {
    let temp_dir = TempDir::new().unwrap();
    let workspace_dir = temp_dir.path().join("workspace");
    let context = OutputContext {
      workspace: Some(Workspace {
        directory: RootPath::new(&workspace_dir.to_string_lossy()),
        projects: vec![
          Project {
            name: Some("__workspace__".to_string()),
            is_workspace_root_project: Some(true),
            root_memory_prompt: Some(create_root_prompt("workspace root")),
            ..Project::default()
          },
          Project {
            is_prompt_source_project: Some(true),
            root_memory_prompt: Some(create_root_prompt("prompt source")),
            ..create_project(&workspace_dir.to_string_lossy(), "aindex")
          },
          Project {
            root_memory_prompt: Some(create_root_prompt("project root")),
            ..create_project(&workspace_dir.to_string_lossy(), "project-a")
          },
          Project {
            root_memory_prompt: Some(create_root_prompt("project root")),
            ..create_project(&workspace_dir.to_string_lossy(), "project-a")
          },
        ],
      }),
      global_memory: Some(create_global_memory("global prompt")),
      registered_output_plugins: Some(vec![AGENTS_OUTPUT_ADAPTOR.to_string()]),
      ..OutputContext::default()
    };

    let plan = build_trae_output_plan(&context).unwrap();
    let output_paths: Vec<&str> = plan
      .output_files
      .iter()
      .map(|f| f.path.as_str())
      .collect();

    assert!(
      output_paths.contains(
        &workspace_dir
          .join(".trae")
          .join("steering")
          .join("GLOBAL.md")
          .to_string_lossy()
          .as_ref()
      ),
      "output must include .trae/steering/GLOBAL.md"
    );

    assert!(
      !output_paths
        .iter()
        .any(|p| p.contains(".trae-cn")),
      "output must NOT include any .trae-cn path, got: {:?}",
      output_paths
    );
  }

  #[test]
  fn trae_output_omits_prompt_source_projects() {
    let temp_dir = TempDir::new().unwrap();
    let workspace_dir = temp_dir.path().join("workspace");

    let context = OutputContext {
      workspace: Some(Workspace {
        directory: RootPath::new(&workspace_dir.to_string_lossy()),
        projects: vec![
          Project {
            name: Some("__workspace__".to_string()),
            is_workspace_root_project: Some(true),
            root_memory_prompt: Some(create_root_prompt("workspace root")),
            ..Project::default()
          },
          Project {
            is_prompt_source_project: Some(true),
            root_memory_prompt: Some(create_root_prompt("prompt source")),
            ..create_project(&workspace_dir.to_string_lossy(), "aindex")
          },
          Project {
            root_memory_prompt: Some(create_root_prompt("project root")),
            ..create_project(&workspace_dir.to_string_lossy(), "project-a")
          },
        ],
      }),
      ..OutputContext::default()
    };

    let plan = build_trae_output_plan(&context).unwrap();
    let output_paths: Vec<&str> = plan
      .output_files
      .iter()
      .map(|f| f.path.as_str())
      .collect();

    assert!(
      output_paths.contains(
        &workspace_dir
          .join("project-a")
          .join(".trae")
          .join("steering")
          .join("GLOBAL.md")
          .to_string_lossy()
          .as_ref()
      ),
      "output must include project-a/.trae/steering/GLOBAL.md"
    );

    assert!(
      !output_paths.contains(
        &workspace_dir
          .join("aindex")
          .join(".trae")
          .join("steering")
          .join("GLOBAL.md")
          .to_string_lossy()
          .as_ref()
      ),
      "output must NOT include prompt source project"
    );
  }

  #[test]
  fn trae_cleanup_still_removes_trae_cn_for_compatibility() {
    let temp_dir = TempDir::new().unwrap();
    let workspace_dir = temp_dir.path().join("workspace");
    let project_root = workspace_dir.join("project-a");

    let context = OutputContext {
      workspace: Some(Workspace {
        directory: RootPath::new(&workspace_dir.to_string_lossy()),
        projects: vec![
          Project {
            name: Some("__workspace__".to_string()),
            is_workspace_root_project: Some(true),
            ..Project::default()
          },
          Project {
            ..create_project(&workspace_dir.to_string_lossy(), "project-a")
          },
        ],
      }),
      ..OutputContext::default()
    };

    let plan = build_trae_output_plan(&context).unwrap();
    let cleanup_paths: Vec<&str> = plan
      .cleanup
      .delete
      .iter()
      .map(|t| t.path.as_str())
      .collect();

    assert!(
      cleanup_paths.contains(
        &project_root
          .join(".trae-cn")
          .join("user_rules")
          .join("GLOBAL.md")
          .to_string_lossy()
          .as_ref()
      ),
      "cleanup must still include .trae-cn/user_rules/GLOBAL.md for backward compatibility, got: {:?}",
      cleanup_paths
    );

    assert!(
      cleanup_paths.contains(
        &project_root
          .join(".trae")
          .join("steering")
          .join("GLOBAL.md")
          .to_string_lossy()
          .as_ref()
      ),
      "cleanup must include .trae/steering/GLOBAL.md, got: {:?}",
      cleanup_paths
    );
  }
}
