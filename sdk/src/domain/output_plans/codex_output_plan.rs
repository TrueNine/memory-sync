//! Codex CLI output plan.
//!
//! Generates files for OpenAI Codex CLI.
//!
//! **Note**: The official custom prompts documentation
//! (<https://developers.openai.com/codex/custom-prompts>) is **outdated**.
//! The Codex CLI has since moved to a TOML-based agent configuration format.
//! This module retains the legacy `.md` prompts output for backward compatibility
//! while also emitting the newer `.toml` agents.
//!
//! Output structure:
//! - `~/.codex/AGENTS.md` — global instructions
//! - `~/.codex/prompts/*.md` — legacy custom prompts
//! - `~/.codex/agents/*.toml` — sub-agent definitions (current format)
//! - `{project}/.codex/skills/**` — project-level skills
//! - `{project}/.codex/agents/*.toml` — project-level agents

use std::path::PathBuf;

use crate::CliError;
use crate::context::OutputContext;
use crate::domain::base_output_plans::{BaseOutputFileDeclarationDto, BaseOutputPluginPlanDto};
use crate::domain::config;
use crate::domain::plugin_shared::{Project, RelativePath, Workspace};
use crate::policy::cleanup::{CleanupDeclarationsDto, CleanupTargetDto, CleanupTargetKindDto};

const CODEX_PLUGIN_NAME: &str = "CodexCLIOutputAdaptor";
const CODEX_INSTRUCTIONS_FILE: &str = "AGENTS.md";
const CODEX_GLOBAL_CONFIG_DIR: &str = ".codex";
const CODEX_PROMPTS_DIR: &str = "prompts";
const CODEX_AGENTS_DIR: &str = "agents";
const CODEX_SKILLS_DIR: &str = "skills";
const PROJECT_SCOPE: &str = "project";

pub fn collect_codex_output_plan(context_json: &str) -> Result<String, CliError> {
  let context = OutputContext::from_json(context_json)?;
  let plan = build_codex_output_plan(&context)?;
  serde_json::to_string(&plan).map_err(CliError::from)
}

pub fn build_codex_output_plan(
  context: &OutputContext,
) -> Result<BaseOutputPluginPlanDto, CliError> {
  let workspace = context.workspace.as_ref().ok_or_else(|| {
    CliError::ExecutionError(
      "collectCodexOutputPlan requires collectedOutputContext.workspace".to_string(),
    )
  })?;

  Ok(BaseOutputPluginPlanDto {
    plugin_name: CODEX_PLUGIN_NAME.to_string(),
    output_files: build_output_files(workspace, context),
    cleanup: build_cleanup(workspace),
  })
}

fn build_output_files(
  workspace: &Workspace,
  context: &OutputContext,
) -> Vec<BaseOutputFileDeclarationDto> {
  let mut output_files = Vec::new();
  let project_output_projects = get_project_output_projects(workspace);

  // Global ~/.codex/AGENTS.md (use raw content to match aindex/global.mdx)
  if let Some(global_memory) = context.global_memory.as_ref() {
    let content = global_memory
      .raw_content
      .as_ref()
      .unwrap_or(&global_memory.content)
      .clone();
    output_files.push(BaseOutputFileDeclarationDto {
      path: resolve_effective_home_dir()
        .join(CODEX_GLOBAL_CONFIG_DIR)
        .join(CODEX_INSTRUCTIONS_FILE)
        .to_string_lossy()
        .into_owned(),
      scope: Some("global".to_string()),
      content,
      encoding: None,
    });
  }

  // Global ~/.codex/prompts/ (from commands)
  if let Some(commands) = context.fast_commands.as_ref() {
    let codex_prompts_dir = resolve_effective_home_dir().join(CODEX_GLOBAL_CONFIG_DIR).join(CODEX_PROMPTS_DIR);
    for command in commands {
      let command_file_name = if let Some(prefix) = command.series.as_ref() {
        format!("{}-{}.md", prefix, command.command_name)
      } else {
        format!("{}.md", command.command_name)
      };
      output_files.push(BaseOutputFileDeclarationDto {
        path: codex_prompts_dir
          .join(&command_file_name)
          .to_string_lossy()
          .into_owned(),
        scope: Some("global".to_string()),
        content: build_command_content(command),
        encoding: None,
      });
    }
  }

  // Global ~/.codex/agents/ (from subagents, as .toml)
  if let Some(sub_agents) = context.sub_agents.as_ref() {
    let codex_agents_dir = resolve_effective_home_dir().join(CODEX_GLOBAL_CONFIG_DIR).join(CODEX_AGENTS_DIR);
    for sub_agent in sub_agents {
      let agent_file_name = format!("{}.toml", sub_agent.canonical_name);
      let toml_content = build_agent_toml_content(sub_agent);
      output_files.push(BaseOutputFileDeclarationDto {
        path: codex_agents_dir
          .join(&agent_file_name)
          .to_string_lossy()
          .into_owned(),
        scope: Some("global".to_string()),
        content: toml_content,
        encoding: None,
      });
    }
  }

  // Project-level .codex/skills/
  if let Some(skills) = context.skills.as_ref() {
    for project in &project_output_projects {
      let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
        continue;
      };
      let codex_skills_dir = project_root_dir.join(CODEX_GLOBAL_CONFIG_DIR).join(CODEX_SKILLS_DIR);
      for skill in skills {
        let skill_sub_dir = codex_skills_dir.join(&skill.skill_name);

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

        // Child docs
        if let Some(child_docs) = skill.child_docs.as_ref() {
          for child_doc in child_docs {
            let child_path = child_doc
              .relative_path
              .replace(".mdx", ".md")
              .replace(".src.md", ".md");
            output_files.push(BaseOutputFileDeclarationDto {
              path: skill_sub_dir
                .join(&child_path)
                .to_string_lossy()
                .into_owned(),
              scope: Some(PROJECT_SCOPE.to_string()),
              content: child_doc.content.clone(),
              encoding: None,
            });
          }
        }

        // Resources
        if let Some(resources) = skill.resources.as_ref() {
          for resource in resources {
            let encoding = match resource.encoding {
              crate::domain::plugin_shared::SkillResourceEncoding::Base64 => {
                Some("base64".to_string())
              }
              crate::domain::plugin_shared::SkillResourceEncoding::Text => None,
            };
            output_files.push(BaseOutputFileDeclarationDto {
              path: skill_sub_dir
                .join(&resource.relative_path)
                .to_string_lossy()
                .into_owned(),
              scope: Some(PROJECT_SCOPE.to_string()),
              content: resource.content.clone(),
              encoding,
            });
          }
        }

        // MCP config
        if let Some(mcp_config) = skill.mcp_config.as_ref() {
          output_files.push(BaseOutputFileDeclarationDto {
            path: skill_sub_dir.join("mcp.json").to_string_lossy().into_owned(),
            scope: Some(PROJECT_SCOPE.to_string()),
            content: mcp_config.raw_content.clone(),
            encoding: None,
          });
        }
      }
    }
  }

  // Project-level .codex/agents/ (copy from global agents)
  if let Some(sub_agents) = context.sub_agents.as_ref() {
    for project in &project_output_projects {
      let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
        continue;
      };
      let codex_agents_dir = project_root_dir.join(CODEX_GLOBAL_CONFIG_DIR).join(CODEX_AGENTS_DIR);
      for sub_agent in sub_agents {
        let agent_file_name = format!("{}.toml", sub_agent.canonical_name);
        let toml_content = build_agent_toml_content(sub_agent);
        output_files.push(BaseOutputFileDeclarationDto {
          path: codex_agents_dir
            .join(&agent_file_name)
            .to_string_lossy()
            .into_owned(),
          scope: Some(PROJECT_SCOPE.to_string()),
          content: toml_content,
          encoding: None,
        });
      }
    }
  }

  output_files
}

fn build_agent_toml_content(agent: &crate::domain::plugin_shared::SubAgentPrompt) -> String {
  let description = agent
    .yaml_front_matter
    .as_ref()
    .and_then(|fm| fm.description.as_deref())
    .unwrap_or("");

  crate::infra::md_compiler::build_codex_agent_toml(&agent.canonical_name, Some(description), &agent.content)
    .unwrap_or_else(|_| {
      // Fallback: simple toml
      format!(
        "name = {}\ndescription = {}\ndeveloper_instructions = {}\n",
        serde_json::to_string(&agent.canonical_name).unwrap_or_default(),
        serde_json::to_string(description).unwrap_or_default(),
        serde_json::to_string(&agent.content).unwrap_or_default()
      )
    })
}

fn build_command_content(command: &crate::domain::plugin_shared::FastCommandPrompt) -> String {
  let mut metadata = if let Some(ref yaml_fm) = command.yaml_front_matter {
    match serde_json::to_value(yaml_fm) {
      Ok(serde_json::Value::Object(map)) => map,
      _ => serde_json::Map::new(),
    }
  } else {
    serde_json::Map::new()
  };

  // NOTE: Do NOT add "command" field for codex prompts - it causes compatibility issues
  // Codex prompts should only have description and argument-hint (optional)

  // Convert camelCase keys to kebab-case for codex prompts
  // e.g., argumentHint -> argument-hint, allowTools -> allow-tools
  let metadata: serde_json::Map<String, serde_json::Value> = metadata
    .into_iter()
    .map(|(key, value)| (camel_to_kebab(&key), value))
    .collect();

  // Filter out empty arrays, null values, and unsupported fields for codex prompts
  let metadata: serde_json::Map<String, serde_json::Value> = metadata
    .into_iter()
    .filter(|(k, v)| {
      // Codex only supports description and argument-hint
      !v.is_null() 
        && !(v.is_array() && v.as_array().map(|a| a.is_empty()).unwrap_or(false))
        && (k == "description" || k == "argument-hint")
    })
    .collect();

  if metadata.is_empty() {
    return command.content.clone();
  }

  wrap_yaml_front_matter_quoted(&metadata, &command.content)
}

fn build_skill_content(skill: &crate::domain::plugin_shared::SkillPrompt) -> String {
  let mut metadata = if let Some(ref yaml_fm) = skill.yaml_front_matter {
    match serde_json::to_value(yaml_fm) {
      Ok(serde_json::Value::Object(map)) => map,
      _ => serde_json::Map::new(),
    }
  } else {
    serde_json::Map::new()
  };

  // Add skill source identifier
  metadata.insert(
    "skill".to_string(),
    serde_json::Value::String(format!("aindex/skills/{}", skill.skill_name)),
  );

  // Filter out empty arrays and null values
  metadata.retain(|_, v| {
    !v.is_null() && !(v.is_array() && v.as_array().map(|a| a.is_empty()).unwrap_or(false))
  });

  if metadata.is_empty() {
    return skill.content.clone();
  }

  wrap_yaml_front_matter(&metadata, &skill.content)
}

fn wrap_yaml_front_matter(metadata: &serde_json::Map<String, serde_json::Value>, content: &str) -> String {
  if metadata.is_empty() {
    return content.to_string();
  }

  let yaml = match serde_yml::to_string(&serde_json::Value::Object(metadata.clone())) {
    Ok(y) => y,
    Err(_) => return content.to_string(),
  };

  // serde_yml outputs unindented list items ("keywords:\n- foo").
  // Indent them so they read as values of the preceding key ("keywords:\n  - foo").
  let indented = indent_yaml_list_items(&yaml);

  format!("---\n{}\n---\n\n{}", indented, content)
}

/// Wrap metadata with YAML front matter, forcing all values to be quoted.
/// This ensures codex compatibility where field values must be enclosed in "".
fn wrap_yaml_front_matter_quoted(
  metadata: &serde_json::Map<String, serde_json::Value>,
  content: &str,
) -> String {
  if metadata.is_empty() {
    return content.to_string();
  }

  let yaml = match serde_yml::to_string(&serde_json::Value::Object(metadata.clone())) {
    Ok(y) => y,
    Err(_) => return content.to_string(),
  };

  let indented = indent_yaml_list_items(&yaml);
  let quoted = force_yaml_values_quoted(&indented);

  format!("---\n{}\n---\n\n{}", quoted, content)
}

/// Force all YAML scalar values to be quoted strings.
/// Parses each "key: value" line and wraps the value in double quotes.
fn force_yaml_values_quoted(yaml: &str) -> String {
  yaml
    .lines()
    .map(|line| {
      // Only process lines that look like "key: value"
      if let Some(pos) = line.find(": ") {
        let key = &line[..pos];
        let value = &line[pos + 2..];

        // Skip if it's a list item
        if key.trim_start().starts_with("-") {
          return line.to_string();
        }

        let trimmed = value.trim();

        // Handle empty values
        if trimmed.is_empty() {
          return format!("{}: \"\"", key);
        }

        // If already double-quoted, keep as-is
        if trimmed.starts_with('"') && trimmed.ends_with('"') && trimmed.len() > 1 {
          return line.to_string();
        }

        // If single-quoted, convert to double-quoted
        if trimmed.starts_with('\'') && trimmed.ends_with('\'') && trimmed.len() > 1 {
          let inner = &trimmed[1..trimmed.len()-1];
          let escaped = inner.replace('\\', "\\\\").replace('"', "\\\"");
          return format!("{}: \"{}\"", key, escaped);
        }

        // Force quote the value with double quotes
        let escaped = trimmed.replace('\\', "\\\\").replace('"', "\\\"");
        format!("{}: \"{}\"", key, escaped)
      } else {
        line.to_string()
      }
    })
    .collect::<Vec<_>>()
    .join("\n")
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

/// Convert camelCase string to kebab-case.
/// e.g., "argumentHint" -> "argument-hint", "allowTools" -> "allow-tools"
fn camel_to_kebab(s: &str) -> String {
  let mut result = String::new();
  let mut prev_was_upper = false;
  
  for (i, c) in s.chars().enumerate() {
    if c.is_uppercase() {
      if i > 0 && !prev_was_upper {
        result.push('-');
      }
      result.push(c.to_lowercase().next().unwrap_or(c));
      prev_was_upper = true;
    } else {
      result.push(c);
      prev_was_upper = false;
    }
  }
  
  result
}

fn build_cleanup(workspace: &Workspace) -> CleanupDeclarationsDto {
  let mut delete = Vec::new();

  // Global cleanup
  let global_codex_dir = resolve_effective_home_dir().join(CODEX_GLOBAL_CONFIG_DIR);
  delete.push(CleanupTargetDto {
    path: global_codex_dir
      .join(CODEX_INSTRUCTIONS_FILE)
      .to_string_lossy()
      .into_owned(),
    kind: CleanupTargetKindDto::File,
    exclude_basenames: Vec::new(),
    protection_mode: None,
    scope: Some("global".to_string()),
    label: Some("delete.global".to_string()),
  });

  for sub_dir in &[CODEX_PROMPTS_DIR, CODEX_AGENTS_DIR] {
    delete.push(CleanupTargetDto {
      path: global_codex_dir.join(sub_dir).to_string_lossy().into_owned(),
      kind: CleanupTargetKindDto::Directory,
      exclude_basenames: Vec::new(),
      protection_mode: None,
      scope: Some("global".to_string()),
      label: Some("delete.global.directory".to_string()),
    });
  }

  // Project-level cleanup
  for project in get_project_output_projects(workspace) {
    let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
      continue;
    };

    let codex_dir = project_root_dir.join(CODEX_GLOBAL_CONFIG_DIR);

    delete.push(CleanupTargetDto {
      path: codex_dir
        .join(CODEX_AGENTS_DIR)
        .to_string_lossy()
        .into_owned(),
      kind: CleanupTargetKindDto::Directory,
      exclude_basenames: Vec::new(),
      protection_mode: None,
      scope: Some(PROJECT_SCOPE.to_string()),
      label: Some("delete.directory".to_string()),
    });

    delete.push(CleanupTargetDto {
      path: codex_dir
        .join(CODEX_SKILLS_DIR)
        .to_string_lossy()
        .into_owned(),
      kind: CleanupTargetKindDto::Directory,
      exclude_basenames: Vec::new(),
      protection_mode: None,
      scope: Some(PROJECT_SCOPE.to_string()),
      label: Some("delete.directory".to_string()),
    });
  }

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
