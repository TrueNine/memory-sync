use std::path::PathBuf;

use serde_json::Value;

use crate::CliError;
use crate::domain::base_output_plans::{BaseOutputFileDeclarationDto, BaseOutputPluginPlanDto};
use crate::domain::cleanup::{CleanupDeclarationsDto, CleanupTargetDto, CleanupTargetKindDto};
use crate::domain::config;
use crate::domain::output_context::OutputContext;
use crate::domain::plugin_shared::{Project, RelativePath, Workspace};

const CLAUDE_CODE_PLUGIN_NAME: &str = "ClaudeCodeCLIOutputAdaptor";
const CLAUDE_CODE_MEMORY_FILE: &str = "CLAUDE.md";
const CLAUDE_CODE_SETTINGS_FILE: &str = "settings.json";
const CLAUDE_CODE_SETTINGS_LOCAL_FILE: &str = "settings.local.json";
const CLAUDE_CODE_GLOBAL_CONFIG_DIR: &str = ".claude";
const PROJECT_SCOPE: &str = "project";

pub fn collect_claude_code_output_plan(context_json: &str) -> Result<String, CliError> {
  let context = OutputContext::from_json(context_json)?;
  let plan = build_claude_code_output_plan(&context)?;
  serde_json::to_string(&plan).map_err(CliError::from)
}

pub fn build_claude_code_output_plan(
  context: &OutputContext,
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
  context: &OutputContext,
) -> Vec<BaseOutputFileDeclarationDto> {
  let mut output_files = Vec::new();
  let prompt_projects = get_project_prompt_output_projects(workspace);

  // 项目级 CLAUDE.md（根目录 + 子目录）
  // 工作区根 CLAUDE.md 需要同时携带全局 memory 和工作区 prompt，
  // 这样打包 CLI 在裸容器里安装后也能直接看到完整的 Claude 上下文。
  for project in &prompt_projects {
    let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
      continue;
    };

    if let Some(root_prompt) = project.root_memory_prompt.as_ref() {
      let content = if project.is_workspace_root_project == Some(true) {
        merge_workspace_root_memory(
          context
            .global_memory
            .as_ref()
            .map(|prompt| prompt.content.as_str()),
          &root_prompt.content,
        )
      } else {
        root_prompt.content.clone()
      };

      output_files.push(BaseOutputFileDeclarationDto {
        path: project_root_dir
          .join(CLAUDE_CODE_MEMORY_FILE)
          .to_string_lossy()
          .into_owned(),
        scope: Some(PROJECT_SCOPE.to_string()),
        content,
        encoding: None,
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
          encoding: None,
        });
      }
    }
  }

  let project_output_projects = get_project_output_projects(workspace);

  if let Some(rules) = context.rules.as_ref() {
    for project in &project_output_projects {
      let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
        continue;
      };
      let claude_rules_dir = project_root_dir.join(".claude").join("rules");
      for rule in rules {
        if rule.scope != crate::domain::plugin_shared::RuleScope::Project {
          continue;
        }
        let rule_file_name = if rule.series.is_empty() {
          format!("rule-{}.md", rule.rule_name)
        } else {
          format!("rule-{}-{}.md", rule.series, rule.rule_name)
        };
        output_files.push(BaseOutputFileDeclarationDto {
          path: claude_rules_dir
            .join(&rule_file_name)
            .to_string_lossy()
            .into_owned(),
          scope: Some(PROJECT_SCOPE.to_string()),
          content: build_rule_content(rule),
          encoding: None,
        });
      }
    }
  }

  if let Some(sub_agents) = context.sub_agents.as_ref() {
    for project in &project_output_projects {
      let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
        continue;
      };
      let claude_agents_dir = project_root_dir.join(".claude").join("agents");
      for sub_agent in sub_agents {
        let agent_file_name = format!("{}.md", sub_agent.canonical_name);
        output_files.push(BaseOutputFileDeclarationDto {
          path: claude_agents_dir
            .join(&agent_file_name)
            .to_string_lossy()
            .into_owned(),
          scope: Some(PROJECT_SCOPE.to_string()),
          content: build_agent_content(sub_agent),
          encoding: None,
        });
      }
    }
  }

  if let Some(skills) = context.skills.as_ref() {
    for project in &project_output_projects {
      let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
        continue;
      };
      let claude_skills_dir = project_root_dir.join(".claude").join("skills");
      for skill in skills {
        let skill_sub_dir = claude_skills_dir.join(&skill.skill_name);

        // Main SKILL.md with YAML front matter
        output_files.push(BaseOutputFileDeclarationDto {
          path: skill_sub_dir
            .join("SKILL.md")
            .to_string_lossy()
            .into_owned(),
          scope: Some(PROJECT_SCOPE.to_string()),
          content: build_skill_content(skill),
          encoding: None,
        });
      }
    }
  }

  if let Some(commands) = context.slash_commands.as_ref() {
    for project in &project_output_projects {
      let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
        continue;
      };
      let claude_commands_dir = project_root_dir.join(".claude").join("commands");
      for command in commands {
        let command_file_name = if let Some(prefix) = command.series.as_ref() {
          format!("{}-{}.md", prefix, command.command_name)
        } else {
          format!("{}.md", command.command_name)
        };
        output_files.push(BaseOutputFileDeclarationDto {
          path: claude_commands_dir
            .join(&command_file_name)
            .to_string_lossy()
            .into_owned(),
          scope: Some(PROJECT_SCOPE.to_string()),
          content: build_command_content(command),
          encoding: None,
        });
      }
    }
  }

  // Global CLAUDE.md
  if let Some(global_memory) = context.global_memory.as_ref() {
    output_files.push(BaseOutputFileDeclarationDto {
      path: resolve_effective_home_dir()
        .join(CLAUDE_CODE_GLOBAL_CONFIG_DIR)
        .join(CLAUDE_CODE_MEMORY_FILE)
        .to_string_lossy()
        .into_owned(),
      scope: Some("global".to_string()),
      content: global_memory.content.clone(),
      encoding: None,
    });
  }

  output_files
}

fn merge_workspace_root_memory(global_memory: Option<&str>, workspace_prompt: &str) -> String {
  let global_memory = global_memory.unwrap_or("").trim();
  let workspace_prompt = workspace_prompt.trim();

  match (global_memory.is_empty(), workspace_prompt.is_empty()) {
    (true, true) => String::new(),
    (false, true) => global_memory.to_string(),
    (true, false) => workspace_prompt.to_string(),
    (false, false) => format!("{global_memory}\n\n{workspace_prompt}"),
  }
}

fn build_rule_content(rule: &crate::domain::plugin_shared::RulePrompt) -> String {
  let Some(ref yaml_fm) = rule.yaml_front_matter else {
    return rule.content.clone();
  };

  let mut metadata = match serde_json::to_value(yaml_fm) {
    Ok(Value::Object(map)) => map,
    _ => return rule.content.clone(),
  };

  // Add rule source identifier: aindex/rules/{series}/{rule_name}
  let rule_source = if rule.series.is_empty() {
    format!("aindex/rules/{}", rule.rule_name)
  } else {
    format!("aindex/rules/{}/{}", rule.series, rule.rule_name)
  };
  metadata.insert("rule".to_string(), Value::String(rule_source));

  // Filter out empty arrays
  metadata.retain(|_, v| !(v.is_array() && v.as_array().map(|a| a.is_empty()).unwrap_or(false)));

  wrap_yaml_front_matter(&metadata, &rule.content)
}

fn build_agent_content(agent: &crate::domain::plugin_shared::SubAgentPrompt) -> String {
  let mut metadata = if let Some(ref yaml_fm) = agent.yaml_front_matter {
    match serde_json::to_value(yaml_fm) {
      Ok(Value::Object(map)) => map,
      _ => serde_json::Map::new(),
    }
  } else {
    serde_json::Map::new()
  };

  // Add agent source identifier
  let agent_source = if let Some(ref prefix) = agent.agent_prefix {
    format!("aindex/subagents/{}/{}", prefix, agent.agent_name)
  } else {
    format!("aindex/subagents/{}", agent.agent_name)
  };
  metadata.insert("agent".to_string(), Value::String(agent_source));

  // Filter out empty arrays and null values
  metadata.retain(|_, v| {
    !(v.is_null() || v.is_array() && v.as_array().map(|a| a.is_empty()).unwrap_or(false))
  });

  if metadata.is_empty() {
    return agent.content.clone();
  }

  wrap_yaml_front_matter(&metadata, &agent.content)
}

fn build_command_content(command: &crate::domain::plugin_shared::SlashCommandPrompt) -> String {
  let mut metadata = if let Some(ref yaml_fm) = command.yaml_front_matter {
    match serde_json::to_value(yaml_fm) {
      Ok(Value::Object(map)) => map,
      _ => serde_json::Map::new(),
    }
  } else {
    serde_json::Map::new()
  };

  // Add command source identifier
  let command_source = if let Some(ref series) = command.series {
    format!("aindex/commands/{}/{}", series, command.command_name)
  } else {
    format!("aindex/commands/{}", command.command_name)
  };
  metadata.insert("command".to_string(), Value::String(command_source));

  // Filter out empty arrays and null values
  metadata.retain(|_, v| {
    !(v.is_null() || v.is_array() && v.as_array().map(|a| a.is_empty()).unwrap_or(false))
  });

  if metadata.is_empty() {
    return command.content.clone();
  }

  wrap_yaml_front_matter(&metadata, &command.content)
}

fn build_skill_content(skill: &crate::domain::plugin_shared::SkillPrompt) -> String {
  let mut metadata = if let Some(ref yaml_fm) = skill.yaml_front_matter {
    match serde_json::to_value(yaml_fm) {
      Ok(Value::Object(map)) => map,
      _ => serde_json::Map::new(),
    }
  } else {
    serde_json::Map::new()
  };

  // Add skill source identifier
  metadata.insert(
    "skill".to_string(),
    Value::String(format!("aindex/skills/{}", skill.skill_name)),
  );

  // Filter out empty arrays and null values
  metadata.retain(|_, v| {
    !(v.is_null() || v.is_array() && v.as_array().map(|a| a.is_empty()).unwrap_or(false))
  });

  if metadata.is_empty() {
    return skill.content.clone();
  }

  wrap_yaml_front_matter(&metadata, &skill.content)
}

fn wrap_yaml_front_matter(metadata: &serde_json::Map<String, Value>, content: &str) -> String {
  if metadata.is_empty() {
    return content.to_string();
  }

  let yaml = match serde_yml::to_string(&Value::Object(metadata.clone())) {
    Ok(y) => y,
    Err(_) => return content.to_string(),
  };

  // serde_yml outputs unindented list items ("keywords:\n- foo").
  // Indent them so they read as values of the preceding key ("keywords:\n  - foo").
  let indented = indent_yaml_list_items(&yaml);

  format!("---\n{}\n---\n\n{}", indented, content)
}

/// Indent every line that starts with a YAML list item marker ("- ")
/// by two spaces, turning serde_yml's flat sequences into indented ones.
fn indent_yaml_list_items(yaml: &str) -> String {
  yaml
    .lines()
    .map(|line| {
      if line.starts_with("- ") {
        format!("  {}", line)
      } else {
        line.to_string()
      }
    })
    .collect::<Vec<_>>()
    .join("\n")
}

#[cfg(test)]
#[allow(clippy::items_after_test_module)]
mod tests {
  use super::*;
  use serde_json::json;

  #[test]
  fn wrap_yaml_front_matter_indents_list_items() {
    let mut metadata = serde_json::Map::new();
    metadata.insert("description".to_string(), json!("A test"));
    metadata.insert("keywords".to_string(), json!(["gradle", "kotlin", "build"]));
    metadata.insert("skill".to_string(), json!("aindex/skills/test"));

    let result = wrap_yaml_front_matter(&metadata, "# Content");

    // Must start with front-matter delimiter
    assert!(result.starts_with("---\n"), "should start with '---'");

    // List items must be indented under their parent key
    assert!(
      result.contains("keywords:\n  - gradle\n"),
      "list items should be indented, got:\n{}",
      result
    );
    assert!(
      result.contains("  - kotlin\n"),
      "list items should be indented, got:\n{}",
      result
    );
    assert!(
      result.contains("  - build\n"),
      "list items should be indented, got:\n{}",
      result
    );

    // Non-list lines must NOT be indented
    assert!(
      result.contains("description: A test\n"),
      "scalar lines should not be indented, got:\n{}",
      result
    );
    assert!(
      result.contains("skill: aindex/skills/test\n"),
      "scalar lines should not be indented, got:\n{}",
      result
    );
  }

  #[test]
  fn wrap_yaml_front_matter_empty_metadata_returns_content_unchanged() {
    let empty = serde_json::Map::new();
    let result = wrap_yaml_front_matter(&empty, "Just content.");
    assert_eq!(result, "Just content.");
  }

  #[test]
  fn merge_workspace_root_memory_includes_global_and_workspace_content() {
    let merged = merge_workspace_root_memory(
      Some("Global memory from aindex"),
      "Workspace root prompt from aindex",
    );

    assert_eq!(
      merged,
      "Global memory from aindex\n\nWorkspace root prompt from aindex"
    );
  }

  fn make_test_skill(name: &str) -> crate::domain::plugin_shared::SkillPrompt {
    use crate::domain::plugin_shared::*;
    SkillPrompt {
      prompt_type: PromptKind::Skill,
      content: "body".to_string(),
      length: 4,
      skill_name: name.to_string(),
      dir: crate::infra::path_types::RelativePath::new(name, "/workspace/aindex/skills"),
      yaml_front_matter: Some(SkillYAMLFrontMatter {
        description: Some("desc".to_string()),
        ..SkillYAMLFrontMatter::default()
      }),
      child_docs: Some(vec![SkillChildDoc {
        prompt_type: PromptKind::SkillChildDoc,
        content: "guide".to_string(),
        length: 5,
        file_path_kind: crate::infra::path_types::FilePathKind::Relative,
        relative_path: "guide.mdx".to_string(),
        dir: crate::infra::path_types::RelativePath::new(
          "guide.mdx",
          "/workspace/aindex/skills/test",
        ),
        raw_front_matter: None,
        markdown_ast: None,
        markdown_contents: None,
      }]),
      resources: Some(vec![SkillResource {
        prompt_type: PromptKind::SkillResource,
        extension: "txt".to_string(),
        file_name: "notes.txt".to_string(),
        relative_path: "assets/notes.txt".to_string(),
        content: "notes".to_string(),
        encoding: SkillResourceEncoding::Text,
        length: 5,
        mime_type: None,
      }]),
      mcp_config: Some(SkillMcpConfig {
        prompt_type: PromptKind::SkillMcpConfig,
        mcp_servers: std::collections::HashMap::new(),
        raw_content: "{}".to_string(),
      }),
      markdown_contents: None,
    }
  }

  #[test]
  fn skill_output_only_contains_skill_md() {
    use crate::domain::plugin_shared::*;

    let skill = make_test_skill("test-skill");
    let context = OutputContext {
      workspace: Some(Workspace {
        directory: RootPath::new("/workspace"),
        projects: vec![Project {
          name: Some("__workspace__".to_string()),
          is_workspace_root_project: Some(true),
          root_memory_prompt: Some(ProjectRootMemoryPrompt {
            prompt_type: PromptKind::ProjectRootMemory,
            content: "root".to_string(),
            length: 4,
            file_path_kind: FilePathKind::Root,
            dir: RootPath::new("/workspace"),
            yaml_front_matter: None,
            raw_front_matter: None,
            markdown_ast: None,
            markdown_contents: None,
          }),
          ..Project::default()
        }],
      }),
      skills: Some(vec![skill]),
      ..OutputContext::default()
    };

    let plan = build_claude_code_output_plan(&context).unwrap();
    let skill_paths: Vec<&str> = plan
      .output_files
      .iter()
      .map(|f| f.path.as_str())
      .filter(|p| p.contains(".claude/skills/test-skill"))
      .collect();

    assert_eq!(
      skill_paths.len(),
      1,
      "should only have SKILL.md, got: {:?}",
      skill_paths
    );
    assert!(
      skill_paths[0].ends_with("SKILL.md"),
      "output should be SKILL.md, got: {}",
      skill_paths[0]
    );
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

  // Global CLAUDE.md cleanup
  delete.push(CleanupTargetDto {
    path: resolve_effective_home_dir()
      .join(CLAUDE_CODE_GLOBAL_CONFIG_DIR)
      .join(CLAUDE_CODE_MEMORY_FILE)
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
