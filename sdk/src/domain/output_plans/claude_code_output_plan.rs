use std::path::PathBuf;

use crate::domain::base_output_plans::{BaseOutputFileDeclarationDto, BaseOutputPluginPlanDto};
use crate::domain::plugin_shared::{CollectedInputContext, Project, RelativePath, Workspace};
use crate::policy::cleanup::{CleanupDeclarationsDto, CleanupTargetDto, CleanupTargetKindDto};
use crate::CliError;

const CLAUDE_CODE_PLUGIN_NAME: &str = "ClaudeCodeCLIOutputAdaptor";
const CLAUDE_CODE_MEMORY_FILE: &str = "CLAUDE.md";
const CLAUDE_CODE_SETTINGS_FILE: &str = "settings.json";
const CLAUDE_CODE_SETTINGS_LOCAL_FILE: &str = "settings.local.json";
const AGENTS_OUTPUT_ADAPTOR: &str = "AgentsOutputAdaptor";
const PROJECT_SCOPE: &str = "project";

pub fn collect_claude_code_output_plan(context_json: &str) -> Result<String, CliError> {
  let context = serde_json::from_str::<CollectedInputContext>(context_json)?;
  let plan = build_claude_code_output_plan(&context)?;
  serde_json::to_string(&plan).map_err(CliError::from)
}

pub fn build_claude_code_output_plan(
  context: &CollectedInputContext,
) -> Result<BaseOutputPluginPlanDto, CliError> {
  let workspace = context.workspace.as_ref().ok_or_else(|| {
    CliError::ExecutionError(
      "collectClaudeCodeOutputPlan requires collectedOutputContext.workspace".to_string(),
    )
  })?;

  Ok(BaseOutputPluginPlanDto {
    plugin_name: CLAUDE_CODE_PLUGIN_NAME.to_string(),
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
          path: project_root_dir
            .join(CLAUDE_CODE_MEMORY_FILE)
            .to_string_lossy()
            .into_owned(),
          scope: Some(PROJECT_SCOPE.to_string()),
          content: global_memory.content.clone(),
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
            .join(CLAUDE_CODE_MEMORY_FILE)
            .to_string_lossy()
            .into_owned(),
          scope: Some(PROJECT_SCOPE.to_string()),
          content: combined_content,
        });
      }

      if let Some(child_prompts) = project.child_memory_prompts.as_ref() {
        for child_prompt in child_prompts {
          output_files.push(BaseOutputFileDeclarationDto {
            path: resolve_relative_path(&child_prompt.dir)
              .join(CLAUDE_CODE_MEMORY_FILE)
              .to_string_lossy()
              .into_owned(),
            scope: Some(PROJECT_SCOPE.to_string()),
            content: child_prompt.content.clone(),
          });
        }
      }
    }
  }

  if let Some(rules) = context.rules.as_ref() {
    for rule in rules {
      if rule.scope != crate::domain::plugin_shared::RuleScope::Project {
        continue;
      }
      let rule_dir = resolve_relative_path(&rule.dir);
      let rule_file_name = format!("{}.md", rule.rule_name);
      output_files.push(BaseOutputFileDeclarationDto {
        path: rule_dir
          .join(&rule_file_name)
          .to_string_lossy()
          .into_owned(),
        scope: Some(PROJECT_SCOPE.to_string()),
        content: rule.content.clone(),
      });
    }
  }

  if let Some(sub_agents) = context.sub_agents.as_ref() {
    for sub_agent in sub_agents {
      let agent_dir = resolve_relative_path(&sub_agent.dir);
      let agent_file_name = format!("{}.md", sub_agent.canonical_name);
      output_files.push(BaseOutputFileDeclarationDto {
        path: agent_dir
          .join(&agent_file_name)
          .to_string_lossy()
          .into_owned(),
        scope: Some(PROJECT_SCOPE.to_string()),
        content: sub_agent.content.clone(),
      });
    }
  }

  if let Some(skills) = context.skills.as_ref() {
    for skill in skills {
      let skill_dir = resolve_relative_path(&skill.dir);
      let skill_file_name = format!("{}.md", skill.skill_name);
      output_files.push(BaseOutputFileDeclarationDto {
        path: skill_dir
          .join(&skill_file_name)
          .to_string_lossy()
          .into_owned(),
        scope: Some(PROJECT_SCOPE.to_string()),
        content: skill.content.clone(),
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
        .join(CLAUDE_CODE_MEMORY_FILE)
        .to_string_lossy()
        .into_owned(),
      kind: CleanupTargetKindDto::File,
      exclude_basenames: Vec::new(),
      protection_mode: None,
      scope: Some(PROJECT_SCOPE.to_string()),
      label: Some("delete.project".to_string()),
    });

    let settings_dir = project_root_dir.join(".claude");
    delete.push(CleanupTargetDto {
      path: settings_dir
        .join(CLAUDE_CODE_SETTINGS_FILE)
        .to_string_lossy()
        .into_owned(),
      kind: CleanupTargetKindDto::File,
      exclude_basenames: Vec::new(),
      protection_mode: None,
      scope: Some(PROJECT_SCOPE.to_string()),
      label: Some("delete.settings".to_string()),
    });

    delete.push(CleanupTargetDto {
      path: settings_dir
        .join(CLAUDE_CODE_SETTINGS_LOCAL_FILE)
        .to_string_lossy()
        .into_owned(),
      kind: CleanupTargetKindDto::File,
      exclude_basenames: Vec::new(),
      protection_mode: None,
      scope: Some(PROJECT_SCOPE.to_string()),
      label: Some("delete.settingsLocal".to_string()),
    });

    for sub_dir in &["rules", "commands", "agents", "skills"] {
      delete.push(CleanupTargetDto {
        path: settings_dir.join(sub_dir).to_string_lossy().into_owned(),
        kind: CleanupTargetKindDto::Directory,
        exclude_basenames: Vec::new(),
        protection_mode: None,
        scope: Some(PROJECT_SCOPE.to_string()),
        label: Some("delete.directory".to_string()),
      });
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
