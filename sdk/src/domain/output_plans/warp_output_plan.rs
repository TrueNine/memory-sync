use std::path::PathBuf;

use crate::CliError;
use crate::domain::base_output_plans::{BaseOutputFileDeclarationDto, BaseOutputPluginPlanDto};
use crate::domain::cleanup::{CleanupDeclarationsDto, CleanupTargetDto, CleanupTargetKindDto};
use crate::domain::output_context::OutputContext;
use crate::domain::plugin_shared::{Project, RelativePath, Workspace};

const WARP_PLUGIN_NAME: &str = "WarpIDEOutputAdaptor";
const WARP_MEMORY_FILE: &str = "WARP.md";
const WARP_IGNORE_FILE: &str = ".warpindexignore";
const AGENTS_OUTPUT_ADAPTOR: &str = "AgentsOutputAdaptor";
const PROJECT_SCOPE: &str = "project";

pub fn collect_warp_output_plan(context_json: &str) -> Result<String, CliError> {
  let context = serde_json::from_str::<OutputContext>(context_json)?;
  let plan = build_warp_output_plan(&context)?;
  serde_json::to_string(&plan).map_err(CliError::from)
}

pub fn build_warp_output_plan(
  context: &OutputContext,
) -> Result<BaseOutputPluginPlanDto, CliError> {
  let workspace = context.workspace.as_ref().ok_or_else(|| {
    CliError::ExecutionError(
      "collectWarpOutputPlan requires collectedOutputContext.workspace".to_string(),
    )
  })?;

  Ok(BaseOutputPluginPlanDto {
    plugin_name: WARP_PLUGIN_NAME.to_string(),
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

  if agents_registered {
    if let Some(global_memory) = context.global_memory.as_ref() {
      for project in &prompt_projects {
        let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
          continue;
        };
        output_files.push(BaseOutputFileDeclarationDto {
          path: project_root_dir
            .join(WARP_MEMORY_FILE)
            .to_string_lossy()
            .into_owned(),
          scope: Some(PROJECT_SCOPE.to_string()),
          content: global_memory.content.clone(),
          encoding: None,
        });
      }
    }
  } else {
    let global_memory_content = context.global_memory.as_ref().map(|m| m.content.as_str());

    for project in &prompt_projects {
      let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
        continue;
      };

      if let Some(root_prompt) = project.root_memory_prompt.as_ref() {
        let combined_content =
          combine_global_with_content(global_memory_content, &root_prompt.content);
        output_files.push(BaseOutputFileDeclarationDto {
          path: project_root_dir
            .join(WARP_MEMORY_FILE)
            .to_string_lossy()
            .into_owned(),
          scope: Some(PROJECT_SCOPE.to_string()),
          content: combined_content,
          encoding: None,
        });
      }

      if let Some(child_prompts) = project.child_memory_prompts.as_ref() {
        for child_prompt in child_prompts {
          output_files.push(BaseOutputFileDeclarationDto {
            path: resolve_relative_path(&child_prompt.dir)
              .join(WARP_MEMORY_FILE)
              .to_string_lossy()
              .into_owned(),
            scope: Some(PROJECT_SCOPE.to_string()),
            content: child_prompt.content.clone(),
            encoding: None,
          });
        }
      }
    }
  }

  if let Some(ignore_config_files) = context.ai_agent_ignore_config_files.as_ref() {
    if let Some(ignore_file) = ignore_config_files
      .iter()
      .find(|file| file.file_name == WARP_IGNORE_FILE)
    {
      for project in get_concrete_projects(workspace) {
        let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
          continue;
        };
        if project.is_prompt_source_project == Some(true) {
          continue;
        }
        output_files.push(BaseOutputFileDeclarationDto {
          path: project_root_dir
            .join(WARP_IGNORE_FILE)
            .to_string_lossy()
            .into_owned(),
          scope: Some(PROJECT_SCOPE.to_string()),
          content: ignore_file.content.clone(),
          encoding: None,
        });
      }
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

fn get_project_prompt_output_projects(workspace: &Workspace) -> Vec<&Project> {
  get_project_output_projects(workspace)
    .into_iter()
    .filter(|project| project.is_prompt_source_project != Some(true))
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
  use crate::domain::plugin_shared::{
    AIAgentIgnoreConfigFile, FilePathKind, GlobalMemoryPrompt, ProjectChildrenMemoryPrompt,
    ProjectRootMemoryPrompt, PromptKind, RootPath,
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
      dir: create_relative_path("/home", ".warp"),
      raw_front_matter: None,
      markdown_contents: None,
      parent_directory_path: None,
      raw_content: None,
    }
  }

  fn create_child_prompt(
    project_root: &str,
    relative_dir: &str,
    content: &str,
  ) -> ProjectChildrenMemoryPrompt {
    let relative_path = create_relative_path(project_root, relative_dir);
    ProjectChildrenMemoryPrompt {
      prompt_type: PromptKind::ProjectChildrenMemory,
      content: content.to_string(),
      length: content.len(),
      file_path_kind: FilePathKind::Relative,
      dir: relative_path.clone(),
      yaml_front_matter: None,
      raw_front_matter: None,
      markdown_ast: None,
      markdown_contents: None,
      working_child_directory_path: relative_path,
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
  fn builds_project_outputs_with_global_memory_when_agents_registered() {
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
            root_memory_prompt: Some(create_root_prompt("workspace root")),
            ..Project::default()
          },
          Project {
            is_prompt_source_project: Some(true),
            root_memory_prompt: Some(create_root_prompt("prompt source root")),
            ..create_project(&workspace_dir.to_string_lossy(), "aindex")
          },
          Project {
            root_memory_prompt: Some(create_root_prompt("project root")),
            child_memory_prompts: Some(vec![create_child_prompt(
              &project_root.to_string_lossy(),
              "commands",
              "project child",
            )]),
            ..create_project(&workspace_dir.to_string_lossy(), "project-a")
          },
        ],
      }),
      global_memory: Some(create_global_memory("global prompt")),
      registered_output_plugins: Some(vec![AGENTS_OUTPUT_ADAPTOR.to_string()]),
      ..OutputContext::default()
    };

    let plan = build_warp_output_plan(&context).unwrap();
    let output_paths = plan
      .output_files
      .iter()
      .map(|entry| entry.path.as_str())
      .collect::<Vec<_>>();

    assert!(output_paths.contains(&workspace_dir.join("WARP.md").to_string_lossy().as_ref()));
    assert!(output_paths.contains(&project_root.join("WARP.md").to_string_lossy().as_ref()));
    assert!(
      !output_paths.contains(
        &project_root
          .join("commands")
          .join("WARP.md")
          .to_string_lossy()
          .as_ref()
      )
    );

    let workspace_file = plan
      .output_files
      .iter()
      .find(|entry| entry.path == workspace_dir.join("WARP.md").to_string_lossy())
      .unwrap();
    assert_eq!(workspace_file.content, "global prompt");
  }

  #[test]
  fn builds_combined_outputs_when_agents_not_registered() {
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
            root_memory_prompt: Some(create_root_prompt("workspace root")),
            ..Project::default()
          },
          Project {
            root_memory_prompt: Some(create_root_prompt("project root")),
            child_memory_prompts: Some(vec![create_child_prompt(
              &project_root.to_string_lossy(),
              "commands",
              "project child",
            )]),
            ..create_project(&workspace_dir.to_string_lossy(), "project-a")
          },
        ],
      }),
      global_memory: Some(create_global_memory("global prompt")),
      ..OutputContext::default()
    };

    let plan = build_warp_output_plan(&context).unwrap();
    let output_paths = plan
      .output_files
      .iter()
      .map(|entry| entry.path.as_str())
      .collect::<Vec<_>>();

    assert!(output_paths.contains(&workspace_dir.join("WARP.md").to_string_lossy().as_ref()));
    assert!(output_paths.contains(&project_root.join("WARP.md").to_string_lossy().as_ref()));
    assert!(
      output_paths.contains(
        &project_root
          .join("commands")
          .join("WARP.md")
          .to_string_lossy()
          .as_ref()
      )
    );

    let workspace_file = plan
      .output_files
      .iter()
      .find(|entry| entry.path == workspace_dir.join("WARP.md").to_string_lossy())
      .unwrap();
    assert_eq!(workspace_file.content, "global prompt\n\nworkspace root");
  }

  #[test]
  fn outputs_ignore_file_for_concrete_projects() {
    let temp_dir = TempDir::new().unwrap();
    let workspace_dir = temp_dir.path().join("workspace");
    let project_root = workspace_dir.join("project-a");

    let context = OutputContext {
      workspace: Some(Workspace {
        directory: RootPath::new(&workspace_dir.to_string_lossy()),
        projects: vec![
          Project {
            is_prompt_source_project: Some(true),
            ..create_project(&workspace_dir.to_string_lossy(), "aindex")
          },
          Project {
            ..create_project(&workspace_dir.to_string_lossy(), "project-a")
          },
        ],
      }),
      registered_output_plugins: Some(vec![AGENTS_OUTPUT_ADAPTOR.to_string()]),
      ai_agent_ignore_config_files: Some(vec![AIAgentIgnoreConfigFile {
        file_name: WARP_IGNORE_FILE.to_string(),
        content: "node_modules/\n".to_string(),
        source_path: None,
      }]),
      ..OutputContext::default()
    };

    let plan = build_warp_output_plan(&context).unwrap();
    let output_paths = plan
      .output_files
      .iter()
      .map(|entry| entry.path.as_str())
      .collect::<Vec<_>>();

    assert!(
      !output_paths.contains(
        &workspace_dir
          .join(".warpindexignore")
          .to_string_lossy()
          .as_ref()
      )
    );
    assert!(
      !output_paths.contains(
        &workspace_dir
          .join("aindex")
          .join(".warpindexignore")
          .to_string_lossy()
          .as_ref()
      )
    );
    assert!(
      output_paths.contains(
        &project_root
          .join(".warpindexignore")
          .to_string_lossy()
          .as_ref()
      )
    );
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

    let cleanup = build_cleanup(&workspace);
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
    assert_eq!(cleanup.delete.len(), 2);
  }
}
