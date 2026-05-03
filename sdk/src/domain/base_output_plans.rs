use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::CliError;
use crate::domain::cleanup::{CleanupDeclarationsDto, CleanupTargetDto, CleanupTargetKindDto};
use crate::domain::output_context::OutputContext;
use crate::domain::plugin_shared::{
  IDEKind, Project, ProjectIDEConfigFile, RelativePath, Workspace,
};
use crate::infra::git_fs::{find_all_git_repos, resolve_git_info_dir};

const AGENTS_PLUGIN_NAME: &str = "AgentsOutputAdaptor";
const GIT_EXCLUDE_PLUGIN_NAME: &str = "GitExcludeOutputAdaptor";
const JETBRAINS_PLUGIN_NAME: &str = "JetBrainsIDECodeStyleConfigOutputAdaptor";
const VSCODE_PLUGIN_NAME: &str = "VisualStudioCodeIDEConfigOutputAdaptor";
const ZED_PLUGIN_NAME: &str = "ZedIDEConfigOutputAdaptor";
const README_PLUGIN_NAME: &str = "ReadmeMdConfigFileOutputAdaptor";

const PROJECT_SCOPE: &str = "project";
const PROJECT_MEMORY_FILE: &str = "AGENTS.md";
const IDEA_DIR: &str = ".idea";
const CODE_STYLES_DIR: &str = "codeStyles";
const VSCODE_DIR: &str = ".vscode";
const ZED_DIR: &str = ".zed";
const EDITOR_CONFIG_FILE: &str = ".editorconfig";

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BaseOutputFileDeclarationDto {
  pub path: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub scope: Option<String>,
  pub content: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub encoding: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BaseOutputPluginPlanDto {
  pub plugin_name: String,
  #[serde(default)]
  pub output_files: Vec<BaseOutputFileDeclarationDto>,
  #[serde(default)]
  pub cleanup: CleanupDeclarationsDto,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BaseOutputPlansDto {
  #[serde(default)]
  pub plugins: Vec<BaseOutputPluginPlanDto>,
}

pub fn collect_base_output_plans(context_json: &str) -> Result<String, CliError> {
  let context = OutputContext::from_json(context_json)?;
  let plans = build_base_output_plans(&context)?;
  serde_json::to_string(&plans).map_err(CliError::from)
}

pub fn build_base_output_plans(context: &OutputContext) -> Result<BaseOutputPlansDto, CliError> {
  let workspace = context.workspace.as_ref().ok_or_else(|| {
    CliError::ExecutionError(
      "collectBaseOutputPlans requires collectedOutputContext.workspace".to_string(),
    )
  })?;

  Ok(BaseOutputPlansDto {
    plugins: vec![
      build_agents_plugin_plan(workspace),
      build_git_exclude_plugin_plan(workspace, context),
      build_jetbrains_plugin_plan(workspace, context),
      build_vscode_plugin_plan(workspace, context),
      build_zed_plugin_plan(workspace, context),
      build_readme_plugin_plan(workspace, context),
    ],
  })
}

fn build_agents_plugin_plan(workspace: &Workspace) -> BaseOutputPluginPlanDto {
  let mut output_files = Vec::new();

  for project in get_agents_output_projects(workspace) {
    let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
      continue;
    };

    if let Some(root_prompt) = project.root_memory_prompt.as_ref() {
      output_files.push(create_output_file(
        project_root_dir.join(PROJECT_MEMORY_FILE),
        root_prompt.content.clone(),
      ));
    }

    if let Some(child_prompts) = project.child_memory_prompts.as_ref() {
      for child_prompt in child_prompts {
        output_files.push(create_output_file(
          resolve_relative_path(&child_prompt.dir).join(PROJECT_MEMORY_FILE),
          child_prompt.content.clone(),
        ));
      }
    }
  }

  BaseOutputPluginPlanDto {
    plugin_name: AGENTS_PLUGIN_NAME.to_string(),
    output_files,
    cleanup: build_agents_cleanup(workspace),
  }
}

fn build_agents_cleanup(workspace: &Workspace) -> CleanupDeclarationsDto {
  let mut delete = Vec::new();
  let mut seen_files = std::collections::HashSet::new();

  for project in get_agents_cleanup_projects(workspace) {
    let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
      continue;
    };

    delete.push(create_cleanup_target(
      project_root_dir.join("**").join(PROJECT_MEMORY_FILE),
      CleanupTargetKindDto::Glob,
      Some("delete.project.glob"),
    ));

    push_unique_cleanup_file(
      &mut delete,
      &mut seen_files,
      project_root_dir.join(PROJECT_MEMORY_FILE),
      "delete.project",
    );

    if let Some(child_prompts) = project.child_memory_prompts.as_ref() {
      for child_prompt in child_prompts {
        push_unique_cleanup_file(
          &mut delete,
          &mut seen_files,
          resolve_relative_path(&child_prompt.dir).join(PROJECT_MEMORY_FILE),
          "delete.project.child",
        );
      }
    }
  }

  CleanupDeclarationsDto {
    delete,
    ..CleanupDeclarationsDto::default()
  }
}

fn build_git_exclude_plugin_plan(
  workspace: &Workspace,
  context: &OutputContext,
) -> BaseOutputPluginPlanDto {
  let exclude_paths = collect_managed_exclude_paths(workspace);
  let managed_content = build_managed_git_exclude_content(
    context.global_git_ignore.as_deref(),
    context.shadow_git_exclude.as_deref(),
  );

  let output_files = if managed_content.is_empty() {
    Vec::new()
  } else {
    exclude_paths
      .iter()
      .map(|path| create_output_file(PathBuf::from(path), managed_content.clone()))
      .collect()
  };

  let cleanup = CleanupDeclarationsDto {
    delete: exclude_paths
      .into_iter()
      .map(|path| {
        create_cleanup_target(
          PathBuf::from(path),
          CleanupTargetKindDto::File,
          Some("delete.project"),
        )
      })
      .collect(),
    ..CleanupDeclarationsDto::default()
  };

  BaseOutputPluginPlanDto {
    plugin_name: GIT_EXCLUDE_PLUGIN_NAME.to_string(),
    output_files,
    cleanup,
  }
}

fn build_jetbrains_plugin_plan(
  workspace: &Workspace,
  context: &OutputContext,
) -> BaseOutputPluginPlanDto {
  let mut configs = context.jetbrains_config_files.clone().unwrap_or_default();
  configs.extend(context.editor_config_files.clone().unwrap_or_default());

  build_project_config_plugin_plan(
    workspace,
    JETBRAINS_PLUGIN_NAME,
    &configs,
    &[
      EDITOR_CONFIG_FILE,
      ".idea/codeStyles/Project.xml",
      ".idea/codeStyles/codeStyleConfig.xml",
      ".idea/.gitignore",
    ],
    resolve_jetbrains_target_relative_path,
  )
}

fn build_vscode_plugin_plan(
  workspace: &Workspace,
  context: &OutputContext,
) -> BaseOutputPluginPlanDto {
  let configs = context.vscode_config_files.as_deref().unwrap_or(&[]);

  build_project_config_plugin_plan(
    workspace,
    VSCODE_PLUGIN_NAME,
    configs,
    &[".vscode/settings.json", ".vscode/extensions.json"],
    resolve_vscode_target_relative_path,
  )
}

fn build_zed_plugin_plan(
  workspace: &Workspace,
  context: &OutputContext,
) -> BaseOutputPluginPlanDto {
  let configs = context.zed_config_files.as_deref().unwrap_or(&[]);

  build_project_config_plugin_plan(
    workspace,
    ZED_PLUGIN_NAME,
    configs,
    &[".zed/settings.json"],
    resolve_zed_target_relative_path,
  )
}

fn build_readme_plugin_plan(
  workspace: &Workspace,
  context: &OutputContext,
) -> BaseOutputPluginPlanDto {
  let mut output_files = Vec::new();

  if let Some(readme_prompts) = context.readme_prompts.as_ref() {
    for readme_prompt in readme_prompts {
      output_files.push(create_output_file(
        resolve_relative_path(&readme_prompt.target_dir)
          .join(resolve_readme_output_file_name(&readme_prompt.file_kind)),
        readme_prompt.content.clone(),
      ));
    }
  }

  if let Some(editor_config_files) = context.editor_config_files.as_ref() {
    for project in get_concrete_projects(workspace) {
      let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
        continue;
      };

      for editor_config in editor_config_files {
        output_files.push(create_output_file(
          project_root_dir.join(EDITOR_CONFIG_FILE),
          editor_config.content.clone(),
        ));
      }
    }
  }

  BaseOutputPluginPlanDto {
    plugin_name: README_PLUGIN_NAME.to_string(),
    output_files,
    cleanup: build_project_cleanup(
      workspace,
      &[
        "README.md",
        "CODE_OF_CONDUCT.md",
        "SECURITY.md",
        EDITOR_CONFIG_FILE,
      ],
    ),
  }
}

fn build_project_config_plugin_plan(
  workspace: &Workspace,
  plugin_name: &str,
  configs: &[ProjectIDEConfigFile],
  cleanup_files: &[&str],
  target_relative_path: impl Fn(&ProjectIDEConfigFile) -> String,
) -> BaseOutputPluginPlanDto {
  let mut output_files = Vec::new();

  for project in get_concrete_projects(workspace) {
    let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
      continue;
    };

    for config in configs {
      output_files.push(create_output_file(
        project_root_dir.join(target_relative_path(config)),
        config.content.clone(),
      ));
    }
  }

  BaseOutputPluginPlanDto {
    plugin_name: plugin_name.to_string(),
    output_files,
    cleanup: build_project_cleanup(workspace, cleanup_files),
  }
}

fn build_project_cleanup(workspace: &Workspace, relative_paths: &[&str]) -> CleanupDeclarationsDto {
  let mut delete = Vec::new();

  for project in get_concrete_projects(workspace) {
    let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
      continue;
    };

    for relative_path in relative_paths {
      delete.push(create_cleanup_target(
        project_root_dir.join(relative_path),
        CleanupTargetKindDto::File,
        Some("delete.project"),
      ));
    }
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

fn get_agents_cleanup_projects(workspace: &Workspace) -> Vec<&Project> {
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

fn get_agents_output_projects(workspace: &Workspace) -> Vec<&Project> {
  get_agents_cleanup_projects(workspace)
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
  let raw_path = Path::new(&relative_path.path);
  let candidate = if raw_path.is_absolute() || relative_path.base_path.is_empty() {
    raw_path.to_path_buf()
  } else {
    PathBuf::from(&relative_path.base_path).join(raw_path)
  };

  normalize_path(&candidate)
}

fn resolve_jetbrains_target_relative_path(config: &ProjectIDEConfigFile) -> String {
  let source_path = &config.dir.path;

  if config.ide_type == IDEKind::EditorConfig {
    return EDITOR_CONFIG_FILE.to_string();
  }

  if config.ide_type != IDEKind::IntellijIDEA {
    return file_name(source_path);
  }

  if let Some(index) = source_path.find(IDEA_DIR) {
    return source_path[index..].to_string();
  }

  Path::new(IDEA_DIR)
    .join(CODE_STYLES_DIR)
    .join(file_name(source_path))
    .to_string_lossy()
    .into_owned()
}

fn resolve_vscode_target_relative_path(config: &ProjectIDEConfigFile) -> String {
  let source_path = &config.dir.path;

  if config.ide_type != IDEKind::VSCode {
    return file_name(source_path);
  }

  if let Some(index) = source_path.find(VSCODE_DIR) {
    return source_path[index..].to_string();
  }

  Path::new(VSCODE_DIR)
    .join(file_name(source_path))
    .to_string_lossy()
    .into_owned()
}

fn resolve_zed_target_relative_path(config: &ProjectIDEConfigFile) -> String {
  let source_path = &config.dir.path;

  if config.ide_type != IDEKind::Zed {
    return file_name(source_path);
  }

  if let Some(index) = source_path.find(ZED_DIR) {
    return source_path[index..].to_string();
  }

  Path::new(ZED_DIR)
    .join("settings.json")
    .to_string_lossy()
    .into_owned()
}

fn resolve_readme_output_file_name(file_kind: &str) -> &'static str {
  match file_kind {
    "CodeOfConduct" => "CODE_OF_CONDUCT.md",
    "Security" => "SECURITY.md",
    _ => "README.md",
  }
}

fn collect_managed_exclude_paths(workspace: &Workspace) -> Vec<String> {
  let mut repo_roots = Vec::new();
  let mut seen_repo_roots = std::collections::HashSet::new();
  push_unique_pathbuf(
    &mut repo_roots,
    &mut seen_repo_roots,
    PathBuf::from(&workspace.directory.path),
  );

  for project in &workspace.projects {
    if let Some(project_root_dir) = resolve_project_root_dir(workspace, project) {
      push_unique_pathbuf(&mut repo_roots, &mut seen_repo_roots, project_root_dir);
    }
  }

  let mut exclude_paths = Vec::new();
  let mut seen_exclude_paths = std::collections::HashSet::new();

  for repo_root in repo_roots {
    let mut repo_dirs = vec![repo_root.clone()];
    repo_dirs.extend(find_all_git_repos(&repo_root, 5));

    for repo_dir in repo_dirs {
      let Some(git_info_dir) = resolve_git_info_dir(&repo_dir) else {
        continue;
      };
      push_unique_path(
        &mut exclude_paths,
        &mut seen_exclude_paths,
        git_info_dir.join("exclude"),
      );
    }
  }

  exclude_paths
}

fn build_managed_git_exclude_content(
  global_git_ignore: Option<&str>,
  shadow_git_exclude: Option<&str>,
) -> String {
  let mut parts = Vec::new();

  if let Some(content) = global_git_ignore.filter(|value| !value.trim().is_empty()) {
    let sanitized = sanitize_git_exclude_content(content);
    if !sanitized.is_empty() {
      parts.push(sanitized);
    }
  }

  if let Some(content) = shadow_git_exclude.filter(|value| !value.trim().is_empty()) {
    let sanitized = sanitize_git_exclude_content(content);
    if !sanitized.is_empty() {
      parts.push(sanitized);
    }
  }

  if parts.is_empty() {
    return String::new();
  }

  let joined = parts.join("\n");
  let trimmed = joined.trim();
  if trimmed.is_empty() {
    return String::new();
  }

  format!("{trimmed}\n")
}

fn sanitize_git_exclude_content(content: &str) -> String {
  let normalized = content.replace("\r\n", "\n");
  let filtered = normalized
    .split('\n')
    .filter(|line| {
      let trimmed = line.trim();
      if trimmed.is_empty() {
        return true;
      }
      !trimmed.starts_with('#') || trimmed.starts_with("\\#")
    })
    .collect::<Vec<_>>()
    .join("\n");

  filtered.trim().to_string()
}

fn create_output_file(path: PathBuf, content: String) -> BaseOutputFileDeclarationDto {
  BaseOutputFileDeclarationDto {
    path: path.to_string_lossy().into_owned(),
    scope: Some(PROJECT_SCOPE.to_string()),
    content,
    encoding: None,
  }
}

fn create_cleanup_target(
  path: PathBuf,
  kind: CleanupTargetKindDto,
  label: Option<&str>,
) -> CleanupTargetDto {
  CleanupTargetDto {
    path: path.to_string_lossy().into_owned(),
    kind,
    exclude_basenames: Vec::new(),
    protection_mode: None,
    scope: Some(PROJECT_SCOPE.to_string()),
    label: label.map(ToOwned::to_owned),
  }
}

fn push_unique_cleanup_file(
  delete: &mut Vec<CleanupTargetDto>,
  seen_files: &mut std::collections::HashSet<String>,
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
    scope: Some(PROJECT_SCOPE.to_string()),
    label: Some(label.to_string()),
  });
}

fn push_unique_path(
  paths: &mut Vec<String>,
  seen_paths: &mut std::collections::HashSet<String>,
  path: PathBuf,
) {
  let path_string = path.to_string_lossy().into_owned();
  if !seen_paths.insert(path_string.clone()) {
    return;
  }
  paths.push(path_string);
}

fn push_unique_pathbuf(
  paths: &mut Vec<PathBuf>,
  seen_paths: &mut std::collections::HashSet<String>,
  path: PathBuf,
) {
  let path_string = path.to_string_lossy().into_owned();
  if !seen_paths.insert(path_string) {
    return;
  }
  paths.push(path);
}

fn file_name(path: &str) -> String {
  Path::new(path)
    .file_name()
    .map(|file_name| file_name.to_string_lossy().into_owned())
    .unwrap_or_else(|| path.to_string())
}

fn normalize_path(path: &Path) -> PathBuf {
  let mut normalized = PathBuf::new();

  for component in path.components() {
    match component {
      Component::Prefix(prefix) => normalized.push(prefix.as_os_str()),
      Component::RootDir => normalized.push(Path::new(std::path::MAIN_SEPARATOR_STR)),
      Component::CurDir => {}
      Component::ParentDir => {
        if !normalized.pop() && !path.is_absolute() {
          normalized.push("..");
        }
      }
      Component::Normal(segment) => normalized.push(segment),
    }
  }

  if normalized.as_os_str().is_empty() {
    if path.is_absolute() {
      return PathBuf::from(std::path::MAIN_SEPARATOR_STR);
    }
    return PathBuf::from(".");
  }

  normalized
}

#[cfg(test)]
mod tests {
  use std::fs;

  use tempfile::TempDir;

  use super::*;
  use crate::domain::plugin_shared::{
    FilePathKind, ProjectChildrenMemoryPrompt, ProjectRootMemoryPrompt, PromptKind, ReadmePrompt,
    RootPath,
  };

  fn workspace_root(temp_dir: &TempDir) -> String {
    temp_dir.path().to_string_lossy().into_owned()
  }

  fn create_relative_path(base_path: &str, path: &str) -> RelativePath {
    RelativePath::new(path, base_path)
  }

  fn create_project_root_prompt(content: &str) -> ProjectRootMemoryPrompt {
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

  fn create_child_memory_prompt(
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

  fn create_ide_config(
    ide_type: IDEKind,
    source_path: &str,
    content: &str,
  ) -> ProjectIDEConfigFile {
    ProjectIDEConfigFile {
      ide_type,
      content: content.to_string(),
      length: content.len(),
      dir: RelativePath {
        path_kind: FilePathKind::Absolute,
        path: source_path.to_string(),
        base_path: String::new(),
        absolute_path: Some(source_path.to_string()),
        directory_name: Path::new(source_path)
          .parent()
          .map(|dir| dir.to_string_lossy().into_owned()),
      },
      file_path_kind: FilePathKind::Absolute,
    }
  }

  fn create_readme_prompt(
    target_root: &str,
    relative_dir: &str,
    file_kind: &str,
    content: &str,
  ) -> ReadmePrompt {
    ReadmePrompt {
      prompt_type: PromptKind::Readme,
      content: content.to_string(),
      length: content.len(),
      dir: create_relative_path(target_root, relative_dir),
      project_name: "memory-sync".to_string(),
      target_dir: create_relative_path(target_root, relative_dir),
      is_root: relative_dir == ".",
      file_kind: file_kind.to_string(),
      markdown_contents: None,
    }
  }

  fn find_plan<'a>(
    plans: &'a BaseOutputPlansDto,
    plugin_name: &str,
  ) -> &'a BaseOutputPluginPlanDto {
    plans
      .plugins
      .iter()
      .find(|plan| plan.plugin_name == plugin_name)
      .unwrap_or_else(|| panic!("expected plugin plan for {plugin_name}"))
  }

  #[test]
  fn builds_agents_plan_without_prompt_source_outputs() {
    let temp_dir = match TempDir::new() {
      Ok(dir) => dir,
      Err(error) => panic!("temp dir should be created: {error}"),
    };
    let workspace_dir = workspace_root(&temp_dir);
    let prompt_source_root = Path::new(&workspace_dir).join("aindex");
    let project_root = Path::new(&workspace_dir).join("project-a");

    let context = OutputContext {
      workspace: Some(Workspace {
        directory: RootPath::new(&workspace_dir),
        projects: vec![
          Project {
            name: Some("__workspace__".to_string()),
            is_workspace_root_project: Some(true),
            root_memory_prompt: Some(create_project_root_prompt("workspace root")),
            ..Project::default()
          },
          Project {
            is_prompt_source_project: Some(true),
            root_memory_prompt: Some(create_project_root_prompt("prompt source root")),
            child_memory_prompts: Some(vec![create_child_memory_prompt(
              &prompt_source_root.to_string_lossy(),
              "commands",
              "prompt source child",
            )]),
            ..create_project(&workspace_dir, "aindex")
          },
          Project {
            root_memory_prompt: Some(create_project_root_prompt("project root")),
            child_memory_prompts: Some(vec![create_child_memory_prompt(
              &project_root.to_string_lossy(),
              "commands",
              "project child",
            )]),
            ..create_project(&workspace_dir, "project-a")
          },
        ],
      }),
      ..OutputContext::default()
    };

    let plans = match build_base_output_plans(&context) {
      Ok(plans) => plans,
      Err(error) => panic!("base output plans should be built: {error}"),
    };
    let agents_plan = find_plan(&plans, AGENTS_PLUGIN_NAME);
    let output_paths = agents_plan
      .output_files
      .iter()
      .map(|entry| entry.path.as_str())
      .collect::<Vec<_>>();
    let cleanup_paths = agents_plan
      .cleanup
      .delete
      .iter()
      .map(|entry| entry.path.as_str())
      .collect::<Vec<_>>();

    assert!(
      output_paths.contains(
        &Path::new(&workspace_dir)
          .join("AGENTS.md")
          .to_string_lossy()
          .as_ref()
      )
    );
    assert!(output_paths.contains(&project_root.join("AGENTS.md").to_string_lossy().as_ref()));
    assert!(
      output_paths.contains(
        &project_root
          .join("commands")
          .join("AGENTS.md")
          .to_string_lossy()
          .as_ref()
      )
    );
    assert!(
      !output_paths.contains(
        &prompt_source_root
          .join("AGENTS.md")
          .to_string_lossy()
          .as_ref()
      )
    );
    assert!(
      !output_paths.contains(
        &prompt_source_root
          .join("commands")
          .join("AGENTS.md")
          .to_string_lossy()
          .as_ref()
      )
    );

    assert!(
      cleanup_paths.contains(
        &prompt_source_root
          .join("AGENTS.md")
          .to_string_lossy()
          .as_ref()
      )
    );
    assert!(
      cleanup_paths.contains(
        &prompt_source_root
          .join("commands")
          .join("AGENTS.md")
          .to_string_lossy()
          .as_ref()
      )
    );
  }

  #[test]
  fn builds_git_exclude_plan_for_workspace_and_project_repos() {
    let temp_dir = match TempDir::new() {
      Ok(dir) => dir,
      Err(error) => panic!("temp dir should be created: {error}"),
    };
    let workspace_dir = temp_dir.path();
    let project_dir = workspace_dir.join("packages").join("app");
    if let Err(error) = fs::create_dir_all(workspace_dir.join(".git").join("info")) {
      panic!("workspace git dir should be created: {error}");
    }
    if let Err(error) = fs::create_dir_all(project_dir.join(".git").join("info")) {
      panic!("project git dir should be created: {error}");
    }

    let context = OutputContext {
      workspace: Some(Workspace {
        directory: RootPath::new(&workspace_dir.to_string_lossy()),
        projects: vec![create_project(
          &workspace_dir.to_string_lossy(),
          "packages/app",
        )],
      }),
      global_git_ignore: Some("dist/\n# comment\n\\#literal\n".to_string()),
      shadow_git_exclude: Some(".idea/\n".to_string()),
      ..OutputContext::default()
    };

    let plans = match build_base_output_plans(&context) {
      Ok(plans) => plans,
      Err(error) => panic!("base output plans should be built: {error}"),
    };
    let git_exclude_plan = find_plan(&plans, GIT_EXCLUDE_PLUGIN_NAME);
    let output_paths = git_exclude_plan
      .output_files
      .iter()
      .map(|entry| entry.path.as_str())
      .collect::<Vec<_>>();
    let expected_content = "dist/\n\\#literal\n.idea/\n";

    assert_eq!(
      git_exclude_plan
        .output_files
        .first()
        .map(|entry| entry.content.as_str()),
      Some(expected_content)
    );
    assert!(
      output_paths.contains(
        &workspace_dir
          .join(".git")
          .join("info")
          .join("exclude")
          .to_string_lossy()
          .as_ref()
      )
    );
    assert!(
      output_paths.contains(
        &project_dir
          .join(".git")
          .join("info")
          .join("exclude")
          .to_string_lossy()
          .as_ref()
      )
    );
    assert_eq!(
      git_exclude_plan.cleanup.delete.len(),
      2,
      "cleanup should cover the same git exclude targets"
    );
  }

  #[test]
  fn builds_ide_and_readme_plans_for_prompt_source_projects() {
    let temp_dir = match TempDir::new() {
      Ok(dir) => dir,
      Err(error) => panic!("temp dir should be created: {error}"),
    };
    let workspace_dir = workspace_root(&temp_dir);
    let aindex_public = Path::new(&workspace_dir).join("aindex").join("public");
    let memory_sync_root = Path::new(&workspace_dir).join("memory-sync");

    let context = OutputContext {
      workspace: Some(Workspace {
        directory: RootPath::new(&workspace_dir),
        projects: vec![
          Project {
            is_prompt_source_project: Some(true),
            ..create_project(&workspace_dir, "aindex")
          },
          create_project(&workspace_dir, "memory-sync"),
        ],
      }),
      editor_config_files: Some(vec![create_ide_config(
        IDEKind::EditorConfig,
        &aindex_public.join(".editorconfig").to_string_lossy(),
        "root = true\n",
      )]),
      vscode_config_files: Some(vec![
        create_ide_config(
          IDEKind::VSCode,
          &aindex_public
            .join(".vscode")
            .join("settings.json")
            .to_string_lossy(),
          "{}\n",
        ),
        create_ide_config(
          IDEKind::VSCode,
          &aindex_public
            .join(".vscode")
            .join("extensions.json")
            .to_string_lossy(),
          "{\n}\n",
        ),
      ]),
      zed_config_files: Some(vec![create_ide_config(
        IDEKind::Zed,
        &aindex_public
          .join(".zed")
          .join("settings.json")
          .to_string_lossy(),
        "{\"tab_size\":2}\n",
      )]),
      jetbrains_config_files: Some(vec![
        create_ide_config(
          IDEKind::IntellijIDEA,
          &aindex_public
            .join(".idea")
            .join(".gitignore")
            .to_string_lossy(),
          "/workspace.xml\n",
        ),
        create_ide_config(
          IDEKind::IntellijIDEA,
          &aindex_public
            .join(".idea")
            .join("codeStyles")
            .join("Project.xml")
            .to_string_lossy(),
          "<project />\n",
        ),
      ]),
      readme_prompts: Some(vec![
        create_readme_prompt(
          &memory_sync_root.to_string_lossy(),
          ".",
          "Readme",
          "# README\n",
        ),
        create_readme_prompt(
          &memory_sync_root.to_string_lossy(),
          ".",
          "CodeOfConduct",
          "# COC\n",
        ),
      ]),
      ..OutputContext::default()
    };

    let plans = match build_base_output_plans(&context) {
      Ok(plans) => plans,
      Err(error) => panic!("base output plans should be built: {error}"),
    };

    let vscode_plan = find_plan(&plans, VSCODE_PLUGIN_NAME);
    assert!(vscode_plan.output_files.iter().any(|entry| {
      entry.path
        == Path::new(&workspace_dir)
          .join("aindex")
          .join(".vscode")
          .join("settings.json")
          .to_string_lossy()
    }));
    assert!(vscode_plan.output_files.iter().any(|entry| {
      entry.path
        == Path::new(&workspace_dir)
          .join("memory-sync")
          .join(".vscode")
          .join("extensions.json")
          .to_string_lossy()
    }));

    let zed_plan = find_plan(&plans, ZED_PLUGIN_NAME);
    assert!(zed_plan.output_files.iter().any(|entry| {
      entry.path
        == Path::new(&workspace_dir)
          .join("aindex")
          .join(".zed")
          .join("settings.json")
          .to_string_lossy()
    }));

    let jetbrains_plan = find_plan(&plans, JETBRAINS_PLUGIN_NAME);
    assert!(jetbrains_plan.output_files.iter().any(|entry| {
      entry.path
        == Path::new(&workspace_dir)
          .join("memory-sync")
          .join(".idea")
          .join("codeStyles")
          .join("Project.xml")
          .to_string_lossy()
    }));
    assert!(jetbrains_plan.output_files.iter().any(|entry| {
      entry.path
        == Path::new(&workspace_dir)
          .join("aindex")
          .join(".editorconfig")
          .to_string_lossy()
    }));

    let readme_plan = find_plan(&plans, README_PLUGIN_NAME);
    assert!(readme_plan.output_files.iter().any(|entry| {
      entry.path == memory_sync_root.join("README.md").to_string_lossy()
        && entry.content == "# README\n"
    }));
    assert!(readme_plan.output_files.iter().any(|entry| {
      entry.path
        == memory_sync_root
          .join("CODE_OF_CONDUCT.md")
          .to_string_lossy()
        && entry.content == "# COC\n"
    }));
    assert!(readme_plan.output_files.iter().any(|entry| {
      entry.path == memory_sync_root.join(".editorconfig").to_string_lossy()
        && entry.content == "root = true\n"
    }));
  }
}
