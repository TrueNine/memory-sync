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
use crate::domain::base_output_plans::{BaseOutputFileDeclarationDto, BaseOutputPluginPlanDto};
use crate::domain::cleanup::{CleanupDeclarationsDto, CleanupTargetDto, CleanupTargetKindDto};
use crate::domain::output_context::OutputContext;
use crate::domain::output_plans::shared::resolve_effective_home_dir;
use crate::domain::plugin_shared::{Project, RelativePath, Workspace};

const CODEX_PLUGIN_NAME: &str = "CodexCLIOutputAdaptor";
const CODEX_INSTRUCTIONS_FILE: &str = "AGENTS.md";
const CODEX_GLOBAL_CONFIG_DIR: &str = ".codex";
const CODEX_PROMPTS_DIR: &str = "prompts";
const CODEX_AGENTS_DIR: &str = "agents";
const CODEX_SKILLS_DIR: &str = "skills";
const PROJECT_SCOPE: &str = "project";

fn resolve_skill_dir_name(skill: &crate::domain::plugin_shared::SkillPrompt) -> String {
  if let Some(category_name) = skill.category_name.as_deref().map(str::trim)
    && !category_name.is_empty()
  {
    return format!("{category_name}-{}", skill.skill_name);
  }

  skill.skill_name.clone()
}

fn build_skill_source_identifier(skill: &crate::domain::plugin_shared::SkillPrompt) -> String {
  if let Some(category_name) = skill.category_name.as_deref().map(str::trim)
    && !category_name.is_empty()
  {
    return format!("aindex/skills/{category_name}/{}", skill.skill_name);
  }

  format!("aindex/skills/{}", skill.skill_name)
}

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
  let prompt_projects = get_project_prompt_output_projects(workspace);
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

  // Fixes #379 historical note: that issue incorrectly attributed global
  // memory to project AGENTS.md files while AgentsOutputAdaptor is active.
  // Fixes #389: aindex/global.mdx belongs only in ~/.codex/AGENTS.md.
  for project in &prompt_projects {
    let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
      continue;
    };

    if let Some(root_prompt) = project.root_memory_prompt.as_ref() {
      output_files.push(BaseOutputFileDeclarationDto {
        path: project_root_dir
          .join(CODEX_INSTRUCTIONS_FILE)
          .to_string_lossy()
          .into_owned(),
        scope: Some(PROJECT_SCOPE.to_string()),
        content: root_prompt.content.clone(),
        encoding: None,
      });
    }

    if let Some(child_prompts) = project.child_memory_prompts.as_ref() {
      // Fixes #380: Codex must emit nested AGENTS.md files for child memory prompts.
      for child_prompt in child_prompts {
        output_files.push(BaseOutputFileDeclarationDto {
          path: resolve_relative_path(&child_prompt.dir)
            .join(CODEX_INSTRUCTIONS_FILE)
            .to_string_lossy()
            .into_owned(),
          scope: Some(PROJECT_SCOPE.to_string()),
          content: child_prompt.content.clone(),
          encoding: None,
        });
      }
    }
  }

  // Global ~/.codex/prompts/ (from commands)
  if let Some(commands) = context.slash_commands.as_ref() {
    let codex_prompts_dir = resolve_effective_home_dir()
      .join(CODEX_GLOBAL_CONFIG_DIR)
      .join(CODEX_PROMPTS_DIR);
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
    let codex_agents_dir = resolve_effective_home_dir()
      .join(CODEX_GLOBAL_CONFIG_DIR)
      .join(CODEX_AGENTS_DIR);
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
      let codex_skills_dir = project_root_dir
        .join(CODEX_GLOBAL_CONFIG_DIR)
        .join(CODEX_SKILLS_DIR);
      for skill in skills {
        let skill_sub_dir = codex_skills_dir.join(resolve_skill_dir_name(skill));

        output_files.push(BaseOutputFileDeclarationDto {
          path: skill_sub_dir
            .join("SKILL.md")
            .to_string_lossy()
            .into_owned(),
          scope: Some(PROJECT_SCOPE.to_string()),
          content: build_skill_content(skill),
          encoding: None,
        });

        append_skill_supporting_files(&mut output_files, &skill_sub_dir, skill);
      }
    }
  }

  // Project-level .codex/agents/ (copy from global agents)
  if let Some(sub_agents) = context.sub_agents.as_ref() {
    for project in &project_output_projects {
      let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
        continue;
      };
      let codex_agents_dir = project_root_dir
        .join(CODEX_GLOBAL_CONFIG_DIR)
        .join(CODEX_AGENTS_DIR);
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

  crate::infra::md_compiler::build_codex_agent_toml(
    &agent.canonical_name,
    Some(description),
    &agent.content,
  )
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

fn build_command_content(command: &crate::domain::plugin_shared::SlashCommandPrompt) -> String {
  let metadata = if let Some(ref yaml_fm) = command.yaml_front_matter {
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
      !(v.is_null() || v.is_array() && v.as_array().map(|a| a.is_empty()).unwrap_or(false))
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
    serde_json::Value::String(build_skill_source_identifier(skill)),
  );
  metadata.insert(
    "name".to_string(),
    serde_json::Value::String(resolve_skill_dir_name(skill)),
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

fn append_skill_supporting_files(
  output_files: &mut Vec<BaseOutputFileDeclarationDto>,
  skill_sub_dir: &std::path::Path,
  skill: &crate::domain::plugin_shared::SkillPrompt,
) {
  if let Some(child_docs) = skill.child_docs.as_ref() {
    for child_doc in child_docs {
      output_files.push(BaseOutputFileDeclarationDto {
        path: skill_sub_dir
          .join(resolve_child_doc_output_relative_path(
            &child_doc.relative_path,
          ))
          .to_string_lossy()
          .into_owned(),
        scope: Some(PROJECT_SCOPE.to_string()),
        content: child_doc.content.clone(),
        encoding: None,
      });
    }
  }

  if let Some(resources) = skill.resources.as_ref() {
    for resource in resources {
      output_files.push(BaseOutputFileDeclarationDto {
        path: skill_sub_dir
          .join(&resource.relative_path)
          .to_string_lossy()
          .into_owned(),
        scope: Some(PROJECT_SCOPE.to_string()),
        content: resource.content.clone(),
        encoding: match resource.encoding {
          crate::domain::plugin_shared::SkillResourceEncoding::Base64 => Some("base64".to_string()),
          crate::domain::plugin_shared::SkillResourceEncoding::Text => None,
        },
      });
    }
  }

  if let Some(mcp_config) = skill.mcp_config.as_ref() {
    output_files.push(BaseOutputFileDeclarationDto {
      path: skill_sub_dir
        .join("mcp.json")
        .to_string_lossy()
        .into_owned(),
      scope: Some(PROJECT_SCOPE.to_string()),
      content: mcp_config.raw_content.clone(),
      encoding: None,
    });
  }
}

fn resolve_child_doc_output_relative_path(relative_path: &str) -> String {
  if let Some(stripped) = relative_path.strip_suffix(".mdx") {
    return format!("{stripped}.md");
  }

  relative_path.to_string()
}

fn wrap_yaml_front_matter(
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
          let inner = &trimmed[1..trimmed.len() - 1];
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
      path: global_codex_dir
        .join(sub_dir)
        .to_string_lossy()
        .into_owned(),
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

    delete.push(CleanupTargetDto {
      path: project_root_dir
        .join(CODEX_INSTRUCTIONS_FILE)
        .to_string_lossy()
        .into_owned(),
      kind: CleanupTargetKindDto::File,
      exclude_basenames: Vec::new(),
      protection_mode: None,
      scope: Some(PROJECT_SCOPE.to_string()),
      label: Some("delete.project".to_string()),
    });

    if let Some(prompt_project) = get_project_prompt_output_projects(workspace)
      .into_iter()
      .find(|candidate| {
        resolve_project_root_dir(workspace, candidate)
          .as_ref()
          .is_some_and(|candidate_root_dir| candidate_root_dir == &project_root_dir)
      })
      && let Some(child_prompts) = prompt_project.child_memory_prompts.as_ref()
    {
      for child_prompt in child_prompts {
        let child_codex_path =
          resolve_relative_path(&child_prompt.dir).join(CODEX_GLOBAL_CONFIG_DIR);
        delete.push(CleanupTargetDto {
          path: child_codex_path.to_string_lossy().into_owned(),
          kind: CleanupTargetKindDto::Directory,
          exclude_basenames: Vec::new(),
          protection_mode: None,
          scope: Some(PROJECT_SCOPE.to_string()),
          label: Some("delete.legacyChildCodexDirectory".to_string()),
        });
        delete.push(CleanupTargetDto {
          path: child_codex_path.to_string_lossy().into_owned(),
          kind: CleanupTargetKindDto::File,
          exclude_basenames: Vec::new(),
          protection_mode: None,
          scope: Some(PROJECT_SCOPE.to_string()),
          label: Some("delete.legacyChildCodexFile".to_string()),
        });
      }
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
  use super::*;
  use crate::domain::plugin_shared::*;
  use crate::infra::path_types::*;

  fn make_test_skill(name: &str) -> SkillPrompt {
    SkillPrompt {
      prompt_type: PromptKind::Skill,
      content: "body".to_string(),
      length: 4,
      skill_name: name.to_string(),
      category_name: None,
      dir: RelativePath::new(name, "/workspace/aindex/skills"),
      yaml_front_matter: Some(SkillYAMLFrontMatter {
        description: Some("desc".to_string()),
        ..SkillYAMLFrontMatter::default()
      }),
      child_docs: Some(vec![
        SkillChildDoc {
          prompt_type: PromptKind::SkillChildDoc,
          content: "guide".to_string(),
          length: 5,
          file_path_kind: FilePathKind::Relative,
          relative_path: "guide.mdx".to_string(),
          dir: RelativePath::new("guide.mdx", "/workspace/aindex/skills/test"),
          raw_front_matter: None,
          markdown_ast: None,
          markdown_contents: None,
        },
        SkillChildDoc {
          prompt_type: PromptKind::SkillChildDoc,
          content: "linux-wsl".to_string(),
          length: 9,
          file_path_kind: FilePathKind::Relative,
          relative_path: "references/linux-wsl.mdx".to_string(),
          dir: RelativePath::new("references/linux-wsl.mdx", "/workspace/aindex/skills/test"),
          raw_front_matter: None,
          markdown_ast: None,
          markdown_contents: None,
        },
      ]),
      resources: Some(vec![
        SkillResource {
          prompt_type: PromptKind::SkillResource,
          extension: "txt".to_string(),
          file_name: "notes.txt".to_string(),
          relative_path: "assets/notes.txt".to_string(),
          content: "notes".to_string(),
          encoding: SkillResourceEncoding::Text,
          length: 5,
          mime_type: None,
        },
        SkillResource {
          prompt_type: PromptKind::SkillResource,
          extension: "sh".to_string(),
          file_name: "capture-workflow.sh".to_string(),
          relative_path: "templates/capture-workflow.sh".to_string(),
          content: "#!/usr/bin/env bash\necho capture\n".to_string(),
          encoding: SkillResourceEncoding::Text,
          length: 32,
          mime_type: None,
        },
        SkillResource {
          prompt_type: PromptKind::SkillResource,
          extension: "bin".to_string(),
          file_name: "blob.bin".to_string(),
          relative_path: "assets/blob.bin".to_string(),
          content: "AAEC".to_string(),
          encoding: SkillResourceEncoding::Base64,
          length: 3,
          mime_type: Some("application/octet-stream".to_string()),
        },
      ]),
      mcp_config: Some(SkillMcpConfig {
        prompt_type: PromptKind::SkillMcpConfig,
        mcp_servers: std::collections::HashMap::new(),
        raw_content: "{}".to_string(),
      }),
      markdown_contents: None,
    }
  }

  #[test]
  fn skill_output_includes_child_docs_resources_and_mcp_config() {
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

    let plan = build_codex_output_plan(&context).unwrap();
    let skill_paths: Vec<String> = plan
      .output_files
      .iter()
      .map(|f| f.path.replace('\\', "/"))
      .filter(|p| p.contains(".codex/skills/test-skill"))
      .collect();

    assert_eq!(
      skill_paths.len(),
      7,
      "skill output should include main doc, child docs, resources, and mcp config, got: {:?}",
      skill_paths
    );
    assert!(skill_paths.iter().any(|path| path.ends_with("SKILL.md")));
    assert!(skill_paths.iter().any(|path| path.ends_with("guide.md")));
    assert!(
      skill_paths
        .iter()
        .any(|path| path.ends_with("references/linux-wsl.md"))
    );
    assert!(
      skill_paths
        .iter()
        .any(|path| path.ends_with("assets/notes.txt"))
    );
    assert!(
      skill_paths
        .iter()
        .any(|path| path.ends_with("templates/capture-workflow.sh"))
    );
    assert!(
      skill_paths
        .iter()
        .any(|path| path.ends_with("assets/blob.bin"))
    );
    assert!(skill_paths.iter().any(|path| path.ends_with("mcp.json")));

    let binary_resource = plan
      .output_files
      .iter()
      .find(|file| file.path.replace('\\', "/").ends_with("assets/blob.bin"))
      .unwrap();
    assert_eq!(binary_resource.encoding.as_deref(), Some("base64"));
  }

  #[test]
  fn categorized_skill_uses_prefixed_directory_and_source_identifier() {
    let mut skill = make_test_skill("reverse-engineering");
    skill.category_name = Some("dev-tools".to_string());
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

    let plan = build_codex_output_plan(&context).unwrap();
    let skill_file = plan
      .output_files
      .iter()
      .find(|file| {
        file
          .path
          .replace('\\', "/")
          .contains(".codex/skills/dev-tools-reverse-engineering/SKILL.md")
      })
      .unwrap();

    assert!(
      skill_file
        .content
        .contains("name: dev-tools-reverse-engineering")
    );
    assert!(
      skill_file
        .content
        .contains("skill: aindex/skills/dev-tools/reverse-engineering")
    );
  }
}
