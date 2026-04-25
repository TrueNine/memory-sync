use std::collections::HashSet;
use std::path::PathBuf;

use crate::CliError;
use crate::domain::base_output_plans::{BaseOutputFileDeclarationDto, BaseOutputPluginPlanDto};
use crate::domain::cleanup::{CleanupDeclarationsDto, CleanupTargetDto, CleanupTargetKindDto};
use crate::domain::config;
use crate::domain::output_context::OutputContext;
use crate::domain::plugin_shared::{Project, RelativePath, Workspace};

const GEMINI_PLUGIN_NAME: &str = "GeminiCLIOutputAdaptor";
const GEMINI_MEMORY_FILE: &str = "GEMINI.md";
const GEMINI_GLOBAL_CONFIG_DIR: &str = ".gemini";

pub fn collect_gemini_output_plan(context_json: &str) -> Result<String, CliError> {
  let context = serde_json::from_str::<OutputContext>(context_json)?;
  let plan = build_gemini_output_plan(&context)?;
  serde_json::to_string(&plan).map_err(CliError::from)
}

pub fn build_gemini_output_plan(
  context: &OutputContext,
) -> Result<BaseOutputPluginPlanDto, CliError> {
  let workspace = context.workspace.as_ref().ok_or_else(|| {
    CliError::ExecutionError(
      "collectGeminiOutputPlan requires collectedOutputContext.workspace".to_string(),
    )
  })?;

  Ok(BaseOutputPluginPlanDto {
    plugin_name: GEMINI_PLUGIN_NAME.to_string(),
    output_files: build_output_files(workspace, context),
    cleanup: build_cleanup(workspace),
  })
}

fn build_output_files(
  workspace: &Workspace,
  context: &OutputContext,
) -> Vec<BaseOutputFileDeclarationDto> {
  let mut output_files = Vec::new();

  for project in get_project_prompt_output_projects(workspace) {
    let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
      continue;
    };

    if let Some(root_prompt) = project.root_memory_prompt.as_ref() {
      output_files.push(BaseOutputFileDeclarationDto {
        path: project_root_dir
          .join(GEMINI_MEMORY_FILE)
          .to_string_lossy()
          .into_owned(),
        scope: Some("project".to_string()),
        content: root_prompt.content.clone(),
        encoding: None,
      });
    }

    if let Some(child_prompts) = project.child_memory_prompts.as_ref() {
      for child_prompt in child_prompts {
        output_files.push(BaseOutputFileDeclarationDto {
          path: resolve_relative_path(&child_prompt.dir)
            .join(GEMINI_MEMORY_FILE)
            .to_string_lossy()
            .into_owned(),
          scope: Some("project".to_string()),
          content: child_prompt.content.clone(),
          encoding: None,
        });
      }
    }
  }

  if let Some(global_memory) = context.global_memory.as_ref() {
    output_files.push(BaseOutputFileDeclarationDto {
      path: resolve_effective_home_dir()
        .join(GEMINI_GLOBAL_CONFIG_DIR)
        .join(GEMINI_MEMORY_FILE)
        .to_string_lossy()
        .into_owned(),
      scope: Some("global".to_string()),
      content: global_memory.content.clone(),
      encoding: None,
    });
  }

  output_files
}

fn build_cleanup(workspace: &Workspace) -> CleanupDeclarationsDto {
  let mut delete = Vec::new();
  let mut seen_project_files = HashSet::new();

  for project in get_project_output_projects(workspace) {
    let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
      continue;
    };

    delete.push(CleanupTargetDto {
      path: project_root_dir
        .join("**")
        .join(GEMINI_MEMORY_FILE)
        .to_string_lossy()
        .into_owned(),
      kind: CleanupTargetKindDto::Glob,
      exclude_basenames: Vec::new(),
      protection_mode: None,
      scope: Some("project".to_string()),
      label: Some("delete.project.glob".to_string()),
    });

    push_unique_cleanup_file(
      &mut delete,
      &mut seen_project_files,
      project_root_dir.join(GEMINI_MEMORY_FILE),
      "delete.project",
    );

    if let Some(child_prompts) = project.child_memory_prompts.as_ref() {
      for child_prompt in child_prompts {
        push_unique_cleanup_file(
          &mut delete,
          &mut seen_project_files,
          resolve_relative_path(&child_prompt.dir).join(GEMINI_MEMORY_FILE),
          "delete.project.child",
        );
      }
    }
  }

  delete.push(CleanupTargetDto {
    path: resolve_effective_home_dir()
      .join(GEMINI_GLOBAL_CONFIG_DIR)
      .join(GEMINI_MEMORY_FILE)
      .to_string_lossy()
      .into_owned(),
    kind: CleanupTargetKindDto::File,
    exclude_basenames: Vec::new(),
    protection_mode: None,
    scope: Some("global".to_string()),
    label: Some("delete.global".to_string()),
  });

  CleanupDeclarationsDto {
    delete,
    ..CleanupDeclarationsDto::default()
  }
}

fn resolve_effective_home_dir() -> PathBuf {
  let runtime_environment = config::resolve_runtime_environment();
  runtime_environment
    .effective_home_dir
    .or(runtime_environment.native_home_dir)
    .unwrap_or_else(|| PathBuf::from("/"))
}

fn get_project_output_projects(workspace: &Workspace) -> Vec<&Project> {
  let mut projects = workspace
    .projects
    .iter()
    .filter(|project| project.is_workspace_root_project != Some(true))
    .collect::<Vec<_>>();

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
  PathBuf::from(relative_path.get_absolute_path())
}

fn push_unique_cleanup_file(
  delete: &mut Vec<CleanupTargetDto>,
  seen_files: &mut HashSet<String>,
  path: PathBuf,
  label: &str,
) {
  let path_string = path.to_string_lossy().into_owned();
  if !seen_files.insert(path_string.clone()) {
    return;
  }

  delete.push(CleanupTargetDto {
    path: path_string,
    kind: CleanupTargetKindDto::File,
    exclude_basenames: Vec::new(),
    protection_mode: None,
    scope: Some("project".to_string()),
    label: Some(label.to_string()),
  });
}

#[cfg(test)]
mod tests {
  use tempfile::TempDir;

  use super::*;
  use crate::domain::plugin_shared::{
    FilePathKind, GlobalMemoryPrompt, ProjectChildrenMemoryPrompt, ProjectRootMemoryPrompt,
    PromptKind, RootPath, Workspace,
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

  fn create_global_memory(content: &str, home_dir: &str) -> GlobalMemoryPrompt {
    GlobalMemoryPrompt {
      prompt_type: PromptKind::GlobalMemory,
      content: content.to_string(),
      length: content.len(),
      file_path_kind: FilePathKind::Relative,
      dir: create_relative_path(home_dir, GEMINI_GLOBAL_CONFIG_DIR),
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

  fn with_home_dir<T>(home_dir: &std::path::Path, callback: impl FnOnce() -> T) -> T {
    let _guard = match crate::domain::TEST_ENV_LOCK.lock() {
      Ok(g) => g,
      Err(e) => e.into_inner(),
    };
    let previous_home = std::env::var_os("HOME");

    unsafe {
      std::env::set_var("HOME", home_dir);
    }

    let result = callback();

    match previous_home {
      Some(value) => unsafe {
        std::env::set_var("HOME", value);
      },
      None => unsafe {
        std::env::remove_var("HOME");
      },
    }

    result
  }

  #[test]
  fn builds_project_and_global_outputs() {
    let temp_dir = match TempDir::new() {
      Ok(dir) => dir,
      Err(error) => panic!("temp dir should be created: {error}"),
    };
    let workspace_dir = temp_dir.path().join("workspace");
    let home_dir = temp_dir.path().join("home");
    let project_root = workspace_dir.join("project-a");

    with_home_dir(&home_dir, || {
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
        global_memory: Some(create_global_memory(
          "global memory",
          &home_dir.to_string_lossy(),
        )),
        ..OutputContext::default()
      };

      let plan = match build_gemini_output_plan(&context) {
        Ok(plan) => plan,
        Err(error) => panic!("gemini plan should build: {error}"),
      };
      let output_paths = plan
        .output_files
        .iter()
        .map(|entry| entry.path.as_str())
        .collect::<Vec<_>>();

      assert!(output_paths.contains(&workspace_dir.join("GEMINI.md").to_string_lossy().as_ref()));
      assert!(output_paths.contains(&project_root.join("GEMINI.md").to_string_lossy().as_ref()));
      assert!(
        output_paths.contains(
          &project_root
            .join("commands")
            .join("GEMINI.md")
            .to_string_lossy()
            .as_ref()
        )
      );
      assert!(
        !output_paths.contains(
          &workspace_dir
            .join("aindex")
            .join("GEMINI.md")
            .to_string_lossy()
            .as_ref()
        )
      );
      assert!(
        output_paths.contains(
          &home_dir
            .join(".gemini")
            .join("GEMINI.md")
            .to_string_lossy()
            .as_ref()
        )
      );
    });
  }

  #[test]
  fn cleanup_keeps_prompt_source_targets_and_global_file() {
    let temp_dir = match TempDir::new() {
      Ok(dir) => dir,
      Err(error) => panic!("temp dir should be created: {error}"),
    };
    let workspace_dir = temp_dir.path().join("workspace");
    let home_dir = temp_dir.path().join("home");
    let prompt_source_root = workspace_dir.join("aindex");

    with_home_dir(&home_dir, || {
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
              is_prompt_source_project: Some(true),
              root_memory_prompt: Some(create_root_prompt("prompt source root")),
              child_memory_prompts: Some(vec![create_child_prompt(
                &prompt_source_root.to_string_lossy(),
                "commands",
                "prompt source child",
              )]),
              ..create_project(&workspace_dir.to_string_lossy(), "aindex")
            },
          ],
        }),
        ..OutputContext::default()
      };

      let plan = match build_gemini_output_plan(&context) {
        Ok(plan) => plan,
        Err(error) => panic!("gemini plan should build: {error}"),
      };
      let cleanup_paths = plan
        .cleanup
        .delete
        .iter()
        .map(|entry| entry.path.as_str())
        .collect::<Vec<_>>();

      assert!(cleanup_paths.contains(&workspace_dir.join("GEMINI.md").to_string_lossy().as_ref()));
      assert!(
        cleanup_paths.contains(
          &prompt_source_root
            .join("GEMINI.md")
            .to_string_lossy()
            .as_ref()
        )
      );
      assert!(
        cleanup_paths.contains(
          &prompt_source_root
            .join("commands")
            .join("GEMINI.md")
            .to_string_lossy()
            .as_ref()
        )
      );
      assert!(
        cleanup_paths.contains(
          &home_dir
            .join(".gemini")
            .join("GEMINI.md")
            .to_string_lossy()
            .as_ref()
        )
      );
      assert!(
        cleanup_paths.contains(
          &workspace_dir
            .join("**")
            .join("GEMINI.md")
            .to_string_lossy()
            .as_ref()
        )
      );
    });
  }
}
