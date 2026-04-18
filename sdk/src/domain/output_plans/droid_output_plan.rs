use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::CliError;
use crate::policy::cleanup::{CleanupDeclarationsDto, CleanupTargetDto, CleanupTargetKindDto};
use crate::domain::config;
use crate::domain::plugin_shared::{
  CollectedInputContext, FastCommandPrompt, Project, RelativePath, RuleScope, SkillPrompt,
  SkillResourceEncoding, Workspace,
};

const DROID_PLUGIN_NAME: &str = "DroidCLIOutputAdaptor";
const DROID_MEMORY_FILE: &str = "AGENTS.md";
const DROID_GLOBAL_CONFIG_DIR: &str = ".factory";
const DROID_COMMANDS_SUBDIR: &str = "commands";
const DROID_SKILLS_SUBDIR: &str = "skills";
const PROJECT_SCOPE: &str = "project";
const GLOBAL_SCOPE: &str = "global";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DroidOutputFileDeclarationDto {
  pub path: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub scope: Option<String>,
  pub content: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub encoding: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DroidOutputPlanDto {
  pub plugin_name: String,
  #[serde(default)]
  pub output_files: Vec<DroidOutputFileDeclarationDto>,
  #[serde(default)]
  pub cleanup: CleanupDeclarationsDto,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OutputSelectionScope {
  Project,
  Global,
}

pub fn collect_droid_output_plan(context_json: &str) -> Result<String, CliError> {
  let context = serde_json::from_str::<CollectedInputContext>(context_json)?;
  let plan = build_droid_output_plan(&context)?;
  serde_json::to_string(&plan).map_err(CliError::from)
}

pub fn build_droid_output_plan(
  context: &CollectedInputContext,
) -> Result<DroidOutputPlanDto, CliError> {
  let workspace = context.workspace.as_ref().ok_or_else(|| {
    CliError::ExecutionError(
      "collectDroidOutputPlan requires collectedOutputContext.workspace".to_string(),
    )
  })?;

  Ok(DroidOutputPlanDto {
    plugin_name: DROID_PLUGIN_NAME.to_string(),
    output_files: build_output_files(workspace, context)?,
    cleanup: build_cleanup(workspace),
  })
}

fn build_output_files(
  workspace: &Workspace,
  context: &CollectedInputContext,
) -> Result<Vec<DroidOutputFileDeclarationDto>, CliError> {
  let mut output_files = Vec::new();

  for project in get_project_prompt_output_projects(workspace) {
    let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
      continue;
    };

    if let Some(root_prompt) = project.root_memory_prompt.as_ref() {
      output_files.push(create_text_output_file(
        project_root_dir.join(DROID_MEMORY_FILE),
        Some(PROJECT_SCOPE),
        root_prompt.content.clone(),
      ));
    }

    if let Some(child_prompts) = project.child_memory_prompts.as_ref() {
      for child_prompt in child_prompts {
        output_files.push(create_text_output_file(
          resolve_relative_path(&child_prompt.dir).join(DROID_MEMORY_FILE),
          Some(PROJECT_SCOPE),
          child_prompt.content.clone(),
        ));
      }
    }
  }

  append_command_output_files(&mut output_files, workspace, context)?;
  append_skill_output_files(&mut output_files, workspace, context)?;

  if let Some(global_memory) = context.global_memory.as_ref() {
    output_files.push(create_text_output_file(
      resolve_effective_home_dir()
        .join(DROID_GLOBAL_CONFIG_DIR)
        .join(DROID_MEMORY_FILE),
      Some(GLOBAL_SCOPE),
      global_memory.content.clone(),
    ));
  }

  Ok(output_files)
}

fn append_command_output_files(
  output_files: &mut Vec<DroidOutputFileDeclarationDto>,
  workspace: &Workspace,
  context: &CollectedInputContext,
) -> Result<(), CliError> {
  let commands = context.fast_commands.as_deref().unwrap_or(&[]);
  let Some(selected_scope) = select_single_scope(commands.iter().map(resolve_command_scope)) else {
    return Ok(());
  };

  match selected_scope {
    OutputSelectionScope::Project => {
      for project in get_project_output_projects(workspace) {
        let Some(project_config_dir) = resolve_project_config_dir(workspace, project) else {
          continue;
        };

        let filtered_commands =
          filter_commands_for_project(commands, project.project_config.as_ref(), selected_scope);
        for command in filtered_commands {
          output_files.push(create_text_output_file(
            project_config_dir
              .join(DROID_COMMANDS_SUBDIR)
              .join(transform_command_name(command)),
            Some(PROJECT_SCOPE),
            build_command_content(command)?,
          ));
        }
      }
    }
    OutputSelectionScope::Global => {
      let global_config_dir = resolve_effective_home_dir().join(DROID_GLOBAL_CONFIG_DIR);
      let prompt_source_project_config = resolve_prompt_source_project_config(workspace);
      let filtered_commands =
        filter_commands_for_project(commands, prompt_source_project_config, selected_scope);

      for command in filtered_commands {
        output_files.push(create_text_output_file(
          global_config_dir
            .join(DROID_COMMANDS_SUBDIR)
            .join(transform_command_name(command)),
          Some(GLOBAL_SCOPE),
          build_command_content(command)?,
        ));
      }
    }
  }

  Ok(())
}

fn append_skill_output_files(
  output_files: &mut Vec<DroidOutputFileDeclarationDto>,
  workspace: &Workspace,
  context: &CollectedInputContext,
) -> Result<(), CliError> {
  let skills = context.skills.as_deref().unwrap_or(&[]);
  let Some(selected_scope) = select_single_scope(skills.iter().map(resolve_skill_scope)) else {
    return Ok(());
  };

  match selected_scope {
    OutputSelectionScope::Project => {
      for project in get_project_output_projects(workspace) {
        let Some(project_config_dir) = resolve_project_config_dir(workspace, project) else {
          continue;
        };

        let filtered_skills =
          filter_skills_for_project(skills, project.project_config.as_ref(), selected_scope);
        append_skill_files_for_scope(
          output_files,
          project_config_dir,
          PROJECT_SCOPE,
          &filtered_skills,
        )?;
      }
    }
    OutputSelectionScope::Global => {
      let global_config_dir = resolve_effective_home_dir().join(DROID_GLOBAL_CONFIG_DIR);
      let prompt_source_project_config = resolve_prompt_source_project_config(workspace);
      let filtered_skills =
        filter_skills_for_project(skills, prompt_source_project_config, selected_scope);
      append_skill_files_for_scope(
        output_files,
        global_config_dir,
        GLOBAL_SCOPE,
        &filtered_skills,
      )?;
    }
  }

  Ok(())
}

fn append_skill_files_for_scope(
  output_files: &mut Vec<DroidOutputFileDeclarationDto>,
  base_dir: PathBuf,
  scope: &str,
  skills: &[&SkillPrompt],
) -> Result<(), CliError> {
  for skill in skills {
    let skill_dir = base_dir
      .join(DROID_SKILLS_SUBDIR)
      .join(resolve_skill_dir_name(skill));

    output_files.push(create_text_output_file(
      skill_dir.join("SKILL.md"),
      Some(scope),
      build_skill_main_content(skill)?,
    ));

    if let Some(child_docs) = skill.child_docs.as_ref() {
      for child_doc in child_docs {
        output_files.push(create_text_output_file(
          skill_dir.join(transform_child_doc_path(&child_doc.relative_path)),
          Some(scope),
          child_doc.content.clone(),
        ));
      }
    }

    if let Some(resources) = skill.resources.as_ref() {
      for resource in resources {
        output_files.push(create_resource_output_file(
          skill_dir.join(&resource.relative_path),
          Some(scope),
          resource.content.clone(),
          resource.encoding,
        ));
      }
    }
  }

  Ok(())
}

fn build_cleanup(workspace: &Workspace) -> CleanupDeclarationsDto {
  let mut delete = Vec::new();

  for project in get_project_output_projects(workspace) {
    let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
      continue;
    };

    delete.push(create_cleanup_target(
      project_root_dir.join(DROID_MEMORY_FILE),
      CleanupTargetKindDto::File,
      Some(PROJECT_SCOPE),
      Some("delete.project"),
    ));
    delete.push(create_cleanup_target(
      project_root_dir
        .join(DROID_GLOBAL_CONFIG_DIR)
        .join(DROID_COMMANDS_SUBDIR),
      CleanupTargetKindDto::Directory,
      Some(PROJECT_SCOPE),
      Some("delete.project"),
    ));
    delete.push(create_cleanup_target(
      project_root_dir
        .join(DROID_GLOBAL_CONFIG_DIR)
        .join(DROID_SKILLS_SUBDIR),
      CleanupTargetKindDto::Directory,
      Some(PROJECT_SCOPE),
      Some("delete.project"),
    ));
  }

  let global_config_dir = resolve_effective_home_dir().join(DROID_GLOBAL_CONFIG_DIR);
  delete.push(create_cleanup_target(
    global_config_dir.join(DROID_MEMORY_FILE),
    CleanupTargetKindDto::File,
    Some(GLOBAL_SCOPE),
    Some("delete.global"),
  ));
  delete.push(create_cleanup_target(
    global_config_dir.join(DROID_COMMANDS_SUBDIR),
    CleanupTargetKindDto::Directory,
    Some(GLOBAL_SCOPE),
    Some("delete.global"),
  ));
  delete.push(create_cleanup_target(
    global_config_dir.join(DROID_SKILLS_SUBDIR),
    CleanupTargetKindDto::Directory,
    Some(GLOBAL_SCOPE),
    Some("delete.global"),
  ));

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

fn get_concrete_projects(workspace: &Workspace) -> Vec<&Project> {
  workspace
    .projects
    .iter()
    .filter(|project| project.is_workspace_root_project != Some(true))
    .collect()
}

fn get_project_output_projects(workspace: &Workspace) -> Vec<&Project> {
  let mut projects = get_concrete_projects(workspace);

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

fn resolve_project_config_dir(workspace: &Workspace, project: &Project) -> Option<PathBuf> {
  let project_root_dir = resolve_project_root_dir(workspace, project)?;
  Some(project_root_dir.join(DROID_GLOBAL_CONFIG_DIR))
}

fn resolve_prompt_source_project_config(workspace: &Workspace) -> Option<&Value> {
  let concrete_projects = get_concrete_projects(workspace);
  concrete_projects
    .iter()
    .find(|project| project.is_prompt_source_project == Some(true))
    .and_then(|project| project.project_config.as_ref())
    .or_else(|| {
      concrete_projects
        .first()
        .and_then(|project| project.project_config.as_ref())
    })
}

fn resolve_relative_path(relative_path: &RelativePath) -> PathBuf {
  let raw_path = Path::new(&relative_path.path);
  if raw_path.is_absolute() {
    return raw_path.to_path_buf();
  }
  if relative_path.base_path.is_empty() {
    return raw_path.to_path_buf();
  }
  PathBuf::from(&relative_path.base_path).join(raw_path)
}

fn create_text_output_file(
  path: PathBuf,
  scope: Option<&str>,
  content: String,
) -> DroidOutputFileDeclarationDto {
  DroidOutputFileDeclarationDto {
    path: path.to_string_lossy().into_owned(),
    scope: scope.map(str::to_string),
    content,
    encoding: None,
  }
}

fn create_resource_output_file(
  path: PathBuf,
  scope: Option<&str>,
  content: String,
  encoding: SkillResourceEncoding,
) -> DroidOutputFileDeclarationDto {
  let encoding = match encoding {
    SkillResourceEncoding::Text => "text",
    SkillResourceEncoding::Base64 => "base64",
  };

  DroidOutputFileDeclarationDto {
    path: path.to_string_lossy().into_owned(),
    scope: scope.map(str::to_string),
    content,
    encoding: Some(encoding.to_string()),
  }
}

fn create_cleanup_target(
  path: PathBuf,
  kind: CleanupTargetKindDto,
  scope: Option<&str>,
  label: Option<&str>,
) -> CleanupTargetDto {
  CleanupTargetDto {
    path: path.to_string_lossy().into_owned(),
    kind,
    exclude_basenames: Vec::new(),
    protection_mode: None,
    scope: scope.map(str::to_string),
    label: label.map(str::to_string),
  }
}

fn select_single_scope(
  scopes: impl Iterator<Item = OutputSelectionScope>,
) -> Option<OutputSelectionScope> {
  let mut has_project = false;
  let mut has_global = false;

  for scope in scopes {
    match scope {
      OutputSelectionScope::Project => has_project = true,
      OutputSelectionScope::Global => has_global = true,
    }
  }

  if has_project {
    return Some(OutputSelectionScope::Project);
  }
  if has_global {
    return Some(OutputSelectionScope::Global);
  }
  None
}

fn filter_commands_for_project<'a>(
  commands: &'a [FastCommandPrompt],
  project_config: Option<&Value>,
  selected_scope: OutputSelectionScope,
) -> Vec<&'a FastCommandPrompt> {
  let effective_include_series = resolve_effective_include_series(project_config, "commands");

  commands
    .iter()
    .filter(|command| resolve_command_scope(command) == selected_scope)
    .filter(|command| {
      matches_command_series(command.seri_name.as_deref(), &effective_include_series)
    })
    .collect()
}

fn filter_skills_for_project<'a>(
  skills: &'a [SkillPrompt],
  project_config: Option<&Value>,
  selected_scope: OutputSelectionScope,
) -> Vec<&'a SkillPrompt> {
  let effective_include_series = resolve_effective_include_series(project_config, "skills");

  skills
    .iter()
    .filter(|skill| resolve_skill_scope(skill) == selected_scope)
    .filter(|skill| {
      matches_series_value(
        resolve_skill_extra_value(skill, "seriName"),
        &effective_include_series,
      )
    })
    .collect()
}

fn resolve_command_scope(command: &FastCommandPrompt) -> OutputSelectionScope {
  if command.global_only == Some(true) {
    return OutputSelectionScope::Global;
  }

  match command
    .yaml_front_matter
    .as_ref()
    .and_then(|front_matter| front_matter.scope)
  {
    Some(RuleScope::Global) => OutputSelectionScope::Global,
    _ => OutputSelectionScope::Project,
  }
}

fn resolve_skill_scope(skill: &SkillPrompt) -> OutputSelectionScope {
  match resolve_skill_extra_value(skill, "scope").and_then(Value::as_str) {
    Some("global") => OutputSelectionScope::Global,
    _ => OutputSelectionScope::Project,
  }
}

fn resolve_effective_include_series(
  project_config: Option<&Value>,
  topic_key: &str,
) -> Vec<String> {
  let mut merged = Vec::new();
  let mut seen = HashSet::new();

  for value in collect_string_values(project_config.and_then(|config| config.get("includeSeries")))
  {
    if seen.insert(value.clone()) {
      merged.push(value);
    }
  }

  for value in collect_string_values(
    project_config
      .and_then(|config| config.get(topic_key))
      .and_then(|type_config| type_config.get("includeSeries")),
  ) {
    if seen.insert(value.clone()) {
      merged.push(value);
    }
  }

  merged
}

fn collect_string_values(value: Option<&Value>) -> Vec<String> {
  match value {
    Some(Value::Array(values)) => values
      .iter()
      .filter_map(|entry| entry.as_str().map(str::to_string))
      .collect(),
    _ => Vec::new(),
  }
}

fn matches_command_series(seri_name: Option<&str>, effective_include_series: &[String]) -> bool {
  match seri_name {
    None => true,
    Some(_) if effective_include_series.is_empty() => true,
    Some(series) => effective_include_series.iter().any(|entry| entry == series),
  }
}

fn matches_series_value(value: Option<&Value>, effective_include_series: &[String]) -> bool {
  let Some(value) = value else {
    return true;
  };
  if effective_include_series.is_empty() {
    return true;
  }

  match value {
    Value::String(series) => effective_include_series.iter().any(|entry| entry == series),
    Value::Array(values) => values.iter().any(|entry| {
      entry.as_str().is_some_and(|series| {
        effective_include_series
          .iter()
          .any(|candidate| candidate == series)
      })
    }),
    _ => true,
  }
}

fn resolve_skill_extra_value<'a>(skill: &'a SkillPrompt, key: &str) -> Option<&'a Value> {
  skill
    .yaml_front_matter
    .as_ref()
    .and_then(|front_matter| front_matter.extra.get(key))
}

fn transform_command_name(command: &FastCommandPrompt) -> String {
  match command.series.as_deref() {
    Some(series) if !series.is_empty() => format!("{series}-{}.md", command.command_name),
    _ => format!("{}.md", command.command_name),
  }
}

fn resolve_skill_dir_name(skill: &SkillPrompt) -> String {
  if !skill.skill_name.trim().is_empty() {
    return skill.skill_name.clone();
  }

  skill.dir.get_directory_name()
}

fn transform_child_doc_path(relative_path: &str) -> String {
  match relative_path.strip_suffix(".mdx") {
    Some(prefix) => format!("{prefix}.md"),
    None => relative_path.to_string(),
  }
}

fn build_command_content(command: &FastCommandPrompt) -> Result<String, CliError> {
  let front_matter = command
    .yaml_front_matter
    .as_ref()
    .map(serde_json::to_value)
    .transpose()?;

  build_markdown_with_front_matter(front_matter, command.content.clone())
}

fn build_skill_main_content(skill: &SkillPrompt) -> Result<String, CliError> {
  let Some(front_matter) = skill.yaml_front_matter.as_ref() else {
    return Ok(skill.content.clone());
  };

  let mut simplified = Map::new();
  simplified.insert(
    "name".to_string(),
    Value::String(resolve_skill_dir_name(skill)),
  );

  if let Some(description) = front_matter.description.as_ref() {
    simplified.insert(
      "description".to_string(),
      Value::String(description.clone()),
    );
  }

  build_markdown_with_front_matter(Some(Value::Object(simplified)), skill.content.clone())
}

fn build_markdown_with_front_matter(
  front_matter: Option<Value>,
  content: String,
) -> Result<String, CliError> {
  let Some(Value::Object(front_matter_map)) = front_matter else {
    return Ok(content);
  };

  let cleaned: Map<String, Value> = front_matter_map
    .into_iter()
    .filter(|(_, value)| !value.is_null())
    .collect();

  if cleaned.is_empty() {
    return Ok(content);
  }

  let yaml_content = serde_yml::to_string(&Value::Object(cleaned))
    .map_err(|error| CliError::ExecutionError(error.to_string()))?;
  let yaml_trimmed = yaml_content.trim_end();

  Ok(format!("---\n{yaml_trimmed}\n---\n\n{content}"))
}

#[cfg(test)]
mod tests {
  use std::collections::HashMap;

  use tempfile::TempDir;

  use super::*;
  use crate::domain::plugin_shared::{
    FastCommandYAMLFrontMatter, FilePathKind, GlobalMemoryPrompt, ProjectChildrenMemoryPrompt,
    ProjectRootMemoryPrompt, PromptKind, RootPath, SkillChildDoc, SkillResource,
    SkillYAMLFrontMatter,
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
      dir: create_relative_path(home_dir, DROID_GLOBAL_CONFIG_DIR),
      raw_front_matter: None,
      markdown_contents: None,
      parent_directory_path: None,
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

  fn create_project_command(
    project_root: &str,
    name: &str,
    series: &str,
    content: &str,
  ) -> FastCommandPrompt {
    FastCommandPrompt {
      prompt_type: PromptKind::FastCommand,
      content: content.to_string(),
      length: content.len(),
      dir: create_relative_path(project_root, &format!("commands/{name}.mdx")),
      command_name: name.to_string(),
      series: Some(series.to_string()),
      seri_name: Some(series.to_string()),
      global_only: None,
      yaml_front_matter: Some(FastCommandYAMLFrontMatter {
        description: Some(format!("{name} description")),
        ..FastCommandYAMLFrontMatter::default()
      }),
      raw_mdx_content: None,
      markdown_contents: None,
    }
  }

  fn create_global_command(project_root: &str, name: &str, content: &str) -> FastCommandPrompt {
    FastCommandPrompt {
      prompt_type: PromptKind::FastCommand,
      content: content.to_string(),
      length: content.len(),
      dir: create_relative_path(project_root, &format!("commands/{name}.mdx")),
      command_name: name.to_string(),
      series: None,
      seri_name: None,
      global_only: Some(true),
      yaml_front_matter: Some(FastCommandYAMLFrontMatter {
        description: Some(format!("{name} description")),
        scope: Some(RuleScope::Global),
        ..FastCommandYAMLFrontMatter::default()
      }),
      raw_mdx_content: None,
      markdown_contents: None,
    }
  }

  fn create_skill(
    project_root: &str,
    name: &str,
    scope: &str,
    seri_name: Option<&str>,
  ) -> SkillPrompt {
    let mut extra = HashMap::new();
    extra.insert("scope".to_string(), Value::String(scope.to_string()));
    if let Some(series) = seri_name {
      extra.insert("seriName".to_string(), Value::String(series.to_string()));
    }

    SkillPrompt {
      prompt_type: PromptKind::Skill,
      content: "Skill body".to_string(),
      length: "Skill body".len(),
      skill_name: name.to_string(),
      dir: create_relative_path(project_root, name),
      yaml_front_matter: Some(SkillYAMLFrontMatter {
        description: Some("Skill description".to_string()),
        extra,
        ..SkillYAMLFrontMatter::default()
      }),
      mcp_config: None,
      child_docs: Some(vec![SkillChildDoc {
        prompt_type: PromptKind::SkillChildDoc,
        content: "Guide body".to_string(),
        length: "Guide body".len(),
        file_path_kind: FilePathKind::Relative,
        relative_path: "guide.mdx".to_string(),
        dir: create_relative_path(project_root, name),
        raw_front_matter: None,
        markdown_ast: None,
        markdown_contents: None,
      }]),
      resources: Some(vec![SkillResource {
        prompt_type: PromptKind::SkillResource,
        extension: ".bin".to_string(),
        file_name: "blob.bin".to_string(),
        relative_path: "assets/blob.bin".to_string(),
        content: "aGVsbG8=".to_string(),
        encoding: SkillResourceEncoding::Base64,
        length: 8,
        mime_type: None,
      }]),
      markdown_contents: None,
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
  fn builds_project_outputs_and_preserves_droid_skill_rendering() {
    let temp_dir = TempDir::new().unwrap();
    let workspace_dir = temp_dir.path().join("workspace");
    let home_dir = temp_dir.path().join("home");
    let project_root = workspace_dir.join("project-a");
    let prompt_source_root = workspace_dir.join("aindex");

    with_home_dir(&home_dir, || {
      let context = CollectedInputContext {
        workspace: Some(Workspace {
          directory: RootPath::new(&workspace_dir.to_string_lossy()),
          projects: vec![
            Project {
              name: Some("__workspace__".to_string()),
              is_workspace_root_project: Some(true),
              root_memory_prompt: Some(create_root_prompt("workspace root")),
              project_config: Some(serde_json::json!({
                "includeSeries": ["shared"],
                "skills": {"includeSeries": ["shared"]}
              })),
              ..Project::default()
            },
            Project {
              is_prompt_source_project: Some(true),
              root_memory_prompt: Some(create_root_prompt("prompt source root")),
              project_config: Some(serde_json::json!({
                "includeSeries": ["shared"],
                "skills": {"includeSeries": ["shared"]}
              })),
              ..create_project(&workspace_dir.to_string_lossy(), "aindex")
            },
            Project {
              root_memory_prompt: Some(create_root_prompt("project root")),
              child_memory_prompts: Some(vec![create_child_prompt(
                &project_root.to_string_lossy(),
                "commands",
                "project child",
              )]),
              project_config: Some(serde_json::json!({
                "includeSeries": ["shared"],
                "skills": {"includeSeries": ["shared"]}
              })),
              ..create_project(&workspace_dir.to_string_lossy(), "project-a")
            },
          ],
        }),
        fast_commands: Some(vec![
          create_project_command(
            &prompt_source_root.to_string_lossy(),
            "build",
            "shared",
            "Run build",
          ),
          create_global_command(
            &prompt_source_root.to_string_lossy(),
            "doctor",
            "Run doctor",
          ),
        ]),
        skills: Some(vec![create_skill(
          &prompt_source_root.to_string_lossy(),
          "ship",
          "project",
          Some("shared"),
        )]),
        global_memory: Some(create_global_memory(
          "global memory",
          &home_dir.to_string_lossy(),
        )),
        ..CollectedInputContext::default()
      };

      let plan = build_droid_output_plan(&context).unwrap();
      let output_paths = plan
        .output_files
        .iter()
        .map(|entry| entry.path.as_str())
        .collect::<Vec<_>>();

      assert!(output_paths.contains(&workspace_dir.join("AGENTS.md").to_string_lossy().as_ref()));
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
        output_paths.contains(
          &workspace_dir
            .join(DROID_GLOBAL_CONFIG_DIR)
            .join(DROID_COMMANDS_SUBDIR)
            .join("shared-build.md")
            .to_string_lossy()
            .as_ref()
        )
      );
      assert!(
        !output_paths.contains(
          &home_dir
            .join(DROID_GLOBAL_CONFIG_DIR)
            .join(DROID_COMMANDS_SUBDIR)
            .join("doctor.md")
            .to_string_lossy()
            .as_ref()
        )
      );
      assert!(
        output_paths.contains(
          &project_root
            .join(DROID_GLOBAL_CONFIG_DIR)
            .join(DROID_SKILLS_SUBDIR)
            .join("ship")
            .join("SKILL.md")
            .to_string_lossy()
            .as_ref()
        )
      );

      let skill_main = plan
        .output_files
        .iter()
        .find(|entry| {
          entry
            .path
            .ends_with("project-a/.factory/skills/ship/SKILL.md")
        })
        .unwrap();
      let skill_resource = plan
        .output_files
        .iter()
        .find(|entry| {
          entry
            .path
            .ends_with("project-a/.factory/skills/ship/assets/blob.bin")
        })
        .unwrap();

      assert_eq!(
        skill_main.content,
        "---\nname: ship\ndescription: Skill description\n---\n\nSkill body"
      );
      assert_eq!(skill_resource.encoding.as_deref(), Some("base64"));
      assert!(
        output_paths.contains(
          &home_dir
            .join(DROID_GLOBAL_CONFIG_DIR)
            .join(DROID_MEMORY_FILE)
            .to_string_lossy()
            .as_ref()
        )
      );
    });
  }

  #[test]
  fn falls_back_to_global_scope_when_only_global_commands_and_skills_exist() {
    let temp_dir = TempDir::new().unwrap();
    let workspace_dir = temp_dir.path().join("workspace");
    let home_dir = temp_dir.path().join("home");
    let prompt_source_root = workspace_dir.join("aindex");

    with_home_dir(&home_dir, || {
      let context = CollectedInputContext {
        workspace: Some(Workspace {
          directory: RootPath::new(&workspace_dir.to_string_lossy()),
          projects: vec![
            Project {
              is_prompt_source_project: Some(true),
              project_config: Some(serde_json::json!({
                "includeSeries": ["global-only"],
                "skills": {"includeSeries": ["global-only"]}
              })),
              ..create_project(&workspace_dir.to_string_lossy(), "aindex")
            },
            create_project(&workspace_dir.to_string_lossy(), "project-a"),
          ],
        }),
        fast_commands: Some(vec![create_global_command(
          &prompt_source_root.to_string_lossy(),
          "doctor",
          "Run doctor",
        )]),
        skills: Some(vec![create_skill(
          &prompt_source_root.to_string_lossy(),
          "ship",
          "global",
          Some("global-only"),
        )]),
        ..CollectedInputContext::default()
      };

      let plan = build_droid_output_plan(&context).unwrap();
      let output_paths = plan
        .output_files
        .iter()
        .map(|entry| entry.path.as_str())
        .collect::<Vec<_>>();

      assert!(
        output_paths.contains(
          &home_dir
            .join(DROID_GLOBAL_CONFIG_DIR)
            .join(DROID_COMMANDS_SUBDIR)
            .join("doctor.md")
            .to_string_lossy()
            .as_ref()
        )
      );
      assert!(
        output_paths.contains(
          &home_dir
            .join(DROID_GLOBAL_CONFIG_DIR)
            .join(DROID_SKILLS_SUBDIR)
            .join("ship")
            .join("SKILL.md")
            .to_string_lossy()
            .as_ref()
        )
      );
      assert!(
        !output_paths.contains(
          &workspace_dir
            .join("project-a")
            .join(DROID_GLOBAL_CONFIG_DIR)
            .join(DROID_COMMANDS_SUBDIR)
            .join("doctor.md")
            .to_string_lossy()
            .as_ref()
        )
      );
    });
  }

  #[test]
  fn cleanup_matches_droid_declarative_targets() {
    let temp_dir = TempDir::new().unwrap();
    let workspace_dir = temp_dir.path().join("workspace");
    let home_dir = temp_dir.path().join("home");

    with_home_dir(&home_dir, || {
      let workspace = Workspace {
        directory: RootPath::new(&workspace_dir.to_string_lossy()),
        projects: vec![
          Project {
            is_workspace_root_project: Some(true),
            ..Project::default()
          },
          create_project(&workspace_dir.to_string_lossy(), "aindex"),
          create_project(&workspace_dir.to_string_lossy(), "project-a"),
        ],
      };

      let cleanup = build_cleanup(&workspace);
      let delete_paths = cleanup
        .delete
        .iter()
        .map(|target| target.path.replace('\\', "/"))
        .collect::<Vec<_>>();

      assert!(
        delete_paths.contains(
          &workspace_dir
            .join("AGENTS.md")
            .to_string_lossy()
            .replace('\\', "/")
        )
      );
      assert!(
        delete_paths.contains(
          &workspace_dir
            .join("project-a")
            .join(".factory")
            .join("commands")
            .to_string_lossy()
            .replace('\\', "/")
        )
      );
      assert!(
        delete_paths.contains(
          &home_dir
            .join(".factory")
            .join("skills")
            .to_string_lossy()
            .replace('\\', "/")
        )
      );
      assert!(
        !delete_paths
          .iter()
          .any(|path| path.ends_with("/commands/AGENTS.md"))
      );
    });
  }
}
