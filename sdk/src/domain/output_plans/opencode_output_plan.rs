use std::path::PathBuf;

use serde_json::Value;

use crate::CliError;
use crate::context::OutputContext;
use crate::domain::base_output_plans::{BaseOutputFileDeclarationDto, BaseOutputPluginPlanDto};
use crate::domain::config;
use crate::domain::plugin_shared::{Project, RelativePath, Workspace};
use crate::policy::cleanup::{CleanupDeclarationsDto, CleanupTargetDto, CleanupTargetKindDto};

const OPENCODE_PLUGIN_NAME: &str = "OpencodeCLIOutputAdaptor";
const OPENCODE_MEMORY_FILE: &str = "AGENTS.md";
const OPENCODE_PROJECT_CONFIG_DIR: &str = ".opencode";
const OPENCODE_GLOBAL_CONFIG_DIR: &str = ".config/opencode";
const PROJECT_SCOPE: &str = "project";

pub fn collect_opencode_output_plan(context_json: &str) -> Result<String, CliError> {
  let context = serde_json::from_str::<OutputContext>(context_json)?;
  let plan = build_opencode_output_plan(&context)?;
  serde_json::to_string(&plan).map_err(CliError::from)
}

pub fn build_opencode_output_plan(
  context: &OutputContext,
) -> Result<BaseOutputPluginPlanDto, CliError> {
  let workspace = context.workspace.as_ref().ok_or_else(|| {
    CliError::ExecutionError(
      "collectOpencodeOutputPlan requires collectedOutputContext.workspace".to_string(),
    )
  })?;

  Ok(BaseOutputPluginPlanDto {
    plugin_name: OPENCODE_PLUGIN_NAME.to_string(),
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
          .join(OPENCODE_PROJECT_CONFIG_DIR)
          .join(OPENCODE_MEMORY_FILE)
          .to_string_lossy()
          .into_owned(),
        scope: Some(PROJECT_SCOPE.to_string()),
        content: combined_content,
        encoding: None,
      });
    }
  }

  let project_output_projects = get_project_output_projects(workspace);

  if let Some(rules) = context.rules.as_ref() {
    for project in &project_output_projects {
      let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
        continue;
      };
      let opencode_rules_dir = project_root_dir
        .join(OPENCODE_PROJECT_CONFIG_DIR)
        .join("rules");
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
          path: opencode_rules_dir
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
      let opencode_agents_dir = project_root_dir
        .join(OPENCODE_PROJECT_CONFIG_DIR)
        .join("agents");
      for sub_agent in sub_agents {
        let agent_file_name = format!("{}.md", sub_agent.canonical_name);
        output_files.push(BaseOutputFileDeclarationDto {
          path: opencode_agents_dir
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
      let opencode_skills_dir = project_root_dir
        .join(OPENCODE_PROJECT_CONFIG_DIR)
        .join("skills");
      for skill in skills {
        let skill_sub_dir = opencode_skills_dir.join(&skill.skill_name);

        output_files.push(BaseOutputFileDeclarationDto {
          path: skill_sub_dir
            .join("SKILL.md")
            .to_string_lossy()
            .into_owned(),
          scope: Some(PROJECT_SCOPE.to_string()),
          content: build_skill_content(skill),
          encoding: None,
        });

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
    }
  }

  if let Some(commands) = context.fast_commands.as_ref() {
    for project in &project_output_projects {
      let Some(project_root_dir) = resolve_project_root_dir(workspace, project) else {
        continue;
      };
      let opencode_commands_dir = project_root_dir
        .join(OPENCODE_PROJECT_CONFIG_DIR)
        .join("commands");
      for command in commands {
        let command_file_name = if let Some(prefix) = command.series.as_ref() {
          format!("{}-{}.md", prefix, command.command_name)
        } else {
          format!("{}.md", command.command_name)
        };
        output_files.push(BaseOutputFileDeclarationDto {
          path: opencode_commands_dir
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

  // Global AGENTS.md
  if let Some(global_memory) = context.global_memory.as_ref() {
    output_files.push(BaseOutputFileDeclarationDto {
      path: resolve_effective_home_dir()
        .join(OPENCODE_GLOBAL_CONFIG_DIR)
        .join(OPENCODE_MEMORY_FILE)
        .to_string_lossy()
        .into_owned(),
      scope: Some("global".to_string()),
      content: global_memory.content.clone(),
      encoding: None,
    });
  }

  output_files
}

fn build_rule_content(rule: &crate::domain::plugin_shared::RulePrompt) -> String {
  let Some(ref yaml_fm) = rule.yaml_front_matter else {
    return rule.content.clone();
  };

  let mut metadata = match serde_json::to_value(yaml_fm) {
    Ok(Value::Object(map)) => map,
    _ => return rule.content.clone(),
  };

  let rule_source = if rule.series.is_empty() {
    format!("aindex/rules/{}", rule.rule_name)
  } else {
    format!("aindex/rules/{}/{}", rule.series, rule.rule_name)
  };
  metadata.insert("rule".to_string(), Value::String(rule_source));

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

  let agent_source = if let Some(ref prefix) = agent.agent_prefix {
    format!("aindex/subagents/{}/{}", prefix, agent.agent_name)
  } else {
    format!("aindex/subagents/{}", agent.agent_name)
  };
  metadata.insert("agent".to_string(), Value::String(agent_source));
  // opencode requires an explicit subagent mode marker here.
  // Without this field, the generated entry is treated as a main agent instead of a subagent.
  metadata.insert("mode".to_string(), Value::String("subagent".to_string()));

  // NOTE: `model` is a future feature for per-agent model override.
  // It is intentionally stripped from output until the feature is designed and implemented.
  metadata.remove("model");

  metadata.retain(|_, v| {
    !v.is_null() && !(v.is_array() && v.as_array().map(|a| a.is_empty()).unwrap_or(false))
  });

  if metadata.is_empty() {
    return agent.content.clone();
  }

  wrap_yaml_front_matter(&metadata, &agent.content)
}

fn build_command_content(command: &crate::domain::plugin_shared::FastCommandPrompt) -> String {
  let mut metadata = if let Some(ref yaml_fm) = command.yaml_front_matter {
    match serde_json::to_value(yaml_fm) {
      Ok(Value::Object(map)) => map,
      _ => serde_json::Map::new(),
    }
  } else {
    serde_json::Map::new()
  };

  let command_source = if let Some(ref series) = command.series {
    format!("aindex/commands/{}/{}", series, command.command_name)
  } else {
    format!("aindex/commands/{}", command.command_name)
  };
  metadata.insert("command".to_string(), Value::String(command_source));

  metadata.retain(|_, v| {
    !v.is_null() && !(v.is_array() && v.as_array().map(|a| a.is_empty()).unwrap_or(false))
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

  metadata.insert(
    "skill".to_string(),
    Value::String(format!("aindex/skills/{}", skill.skill_name)),
  );

  metadata.retain(|_, v| {
    !v.is_null() && !(v.is_array() && v.as_array().map(|a| a.is_empty()).unwrap_or(false))
  });

  if metadata.is_empty() {
    return skill.content.clone();
  }

  wrap_yaml_front_matter(&metadata, &skill.content)
}

fn wrap_yaml_front_matter(metadata: &serde_json::Map<String, Value>, content: &str) -> String {
  let mut metadata = metadata.clone();
  normalize_color(&mut metadata);

  if metadata.is_empty() {
    return content.to_string();
  }

  let yaml = match serde_yml::to_string(&Value::Object(metadata)) {
    Ok(y) => y,
    Err(_) => return content.to_string(),
  };

  let indented = indent_yaml_list_items(&yaml);

  format!("---\n{}\n---\n\n{}", indented, content)
}

/// Normalize the `color` field in metadata to 6-digit hex format (`#RRGGBB`).
///
/// - If the color is already a valid hex, leave it as-is.
/// - If it is a recognized CSS named color, convert it to hex.
/// - Otherwise, remove the `color` key to avoid opencode schema validation errors.
fn normalize_color(metadata: &mut serde_json::Map<String, Value>) {
  let Some(Value::String(color)) = metadata.get("color").cloned() else {
    return;
  };

  if is_valid_hex_color(&color) {
    return;
  }

  if let Some(hex) = css_color_name_to_hex(&color) {
    metadata.insert("color".to_string(), Value::String(hex.to_string()));
  } else {
    metadata.remove("color");
  }
}

/// Convert a CSS named color (case-insensitive) to its 6-digit hex equivalent.
fn css_color_name_to_hex(name: &str) -> Option<&'static str> {
  let lowered = name.trim().to_ascii_lowercase();
  let hex = match lowered.as_str() {
    "black" => "#000000",
    "white" => "#FFFFFF",
    "red" => "#FF0000",
    "green" => "#008000",
    "blue" => "#0000FF",
    "yellow" => "#FFFF00",
    "cyan" => "#00FFFF",
    "magenta" => "#FF00FF",
    "orange" => "#FFA500",
    "purple" => "#800080",
    "pink" => "#FFC0CB",
    "brown" => "#A52A2A",
    "gray" | "grey" => "#808080",
    "lightgray" | "lightgrey" => "#D3D3D3",
    "darkgray" | "darkgrey" => "#A9A9A9",
    "lime" => "#00FF00",
    "navy" => "#000080",
    "teal" => "#008080",
    "olive" => "#808000",
    "maroon" => "#800000",
    "silver" => "#C0C0C0",
    "gold" => "#FFD700",
    "indigo" => "#4B0082",
    "violet" => "#EE82EE",
    "coral" => "#FF7F50",
    "salmon" => "#FA8072",
    "tomato" => "#FF6347",
    "khaki" => "#F0E68C",
    "plum" => "#DDA0DD",
    "orchid" => "#DA70D6",
    "crimson" => "#DC143C",
    "azure" => "#F0FFFF",
    "beige" => "#F5F5DC",
    "ivory" => "#FFFFF0",
    "linen" => "#FAF0E6",
    "snow" => "#FFFAFA",
    "wheat" => "#F5DEB3",
    _ => return None,
  };
  Some(hex)
}

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
        .join(OPENCODE_PROJECT_CONFIG_DIR)
        .join(OPENCODE_MEMORY_FILE)
        .to_string_lossy()
        .into_owned(),
      kind: CleanupTargetKindDto::File,
      exclude_basenames: Vec::new(),
      protection_mode: None,
      scope: Some(PROJECT_SCOPE.to_string()),
      label: Some("delete.project".to_string()),
    });

    // 清理旧版本错误生成的嵌套 .opencode/AGENTS.md（回归保护）
    delete.push(CleanupTargetDto {
      path: project_root_dir
        .join("**")
        .join(OPENCODE_PROJECT_CONFIG_DIR)
        .join(OPENCODE_MEMORY_FILE)
        .to_string_lossy()
        .into_owned(),
      kind: CleanupTargetKindDto::Glob,
      exclude_basenames: Vec::new(),
      protection_mode: None,
      scope: Some(PROJECT_SCOPE.to_string()),
      label: Some("delete.project.nested.glob".to_string()),
    });

    let config_dir = project_root_dir.join(OPENCODE_PROJECT_CONFIG_DIR);
    for sub_dir in &["rules", "commands", "agents", "skills"] {
      delete.push(CleanupTargetDto {
        path: config_dir.join(sub_dir).to_string_lossy().into_owned(),
        kind: CleanupTargetKindDto::Directory,
        exclude_basenames: Vec::new(),
        protection_mode: None,
        scope: Some(PROJECT_SCOPE.to_string()),
        label: Some("delete.directory".to_string()),
      });
    }
  }

  // Global AGENTS.md cleanup
  delete.push(CleanupTargetDto {
    path: resolve_effective_home_dir()
      .join(OPENCODE_GLOBAL_CONFIG_DIR)
      .join(OPENCODE_MEMORY_FILE)
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

fn is_valid_hex_color(s: &str) -> bool {
  if s.len() != 7 {
    return false;
  }
  let bytes = s.as_bytes();
  if bytes[0] != b'#' {
    return false;
  }
  bytes[1..].iter().all(|&b| b.is_ascii_hexdigit())
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

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn hex_color_valid_cases() {
    assert!(is_valid_hex_color("#000000"));
    assert!(is_valid_hex_color("#FFFFFF"));
    assert!(is_valid_hex_color("#ff5733"));
    assert!(is_valid_hex_color("#A1B2C3"));
    assert!(is_valid_hex_color("#0000FF"));
  }

  #[test]
  fn hex_color_invalid_cases() {
    assert!(
      !is_valid_hex_color("blue"),
      "CSS named color must be rejected"
    );
    assert!(
      !is_valid_hex_color("red"),
      "CSS named color must be rejected"
    );
    assert!(!is_valid_hex_color("#FFF"), "3-digit hex must be rejected");
    assert!(
      !is_valid_hex_color("#FFFFFFAA"),
      "8-digit hex must be rejected"
    );
    assert!(
      !is_valid_hex_color("FFFFFF"),
      "missing # prefix must be rejected"
    );
    assert!(
      !is_valid_hex_color("#GGGGGG"),
      "non-hex digits must be rejected"
    );
    assert!(!is_valid_hex_color(""), "empty string must be rejected");
    assert!(
      !is_valid_hex_color("#12345"),
      "5-digit hex must be rejected"
    );
  }

  fn make_test_agent(color: Option<String>) -> crate::domain::plugin_shared::SubAgentPrompt {
    crate::domain::plugin_shared::SubAgentPrompt {
      prompt_type: crate::domain::plugin_shared::PromptKind::SubAgent,
      content: "body".to_string(),
      length: 4,
      dir: crate::domain::plugin_shared::RelativePath::new("pe/compile.mdx", "/workspace/aindex"),
      agent_name: "compile".to_string(),
      agent_prefix: Some("pe".to_string()),
      canonical_name: "pe-compile".to_string(),
      yaml_front_matter: Some(crate::domain::plugin_shared::SubAgentYAMLFrontMatter {
        color,
        description: Some("test".to_string()),
        ..Default::default()
      }),
      raw_mdx_content: None,
      markdown_contents: None,
    }
  }

  #[test]
  fn build_agent_content_converts_named_color_to_hex() {
    let agent = make_test_agent(Some("blue".to_string()));
    let result = build_agent_content(&agent);
    assert!(
      result.contains("mode: subagent") || result.contains("mode: \"subagent\""),
      "subagent mode should always be emitted, got:\n{result}"
    );
    assert!(
      result.contains("color: '#0000FF'"),
      "named color 'blue' should be converted to hex, got:\n{result}"
    );
    assert!(
      result.contains("description:"),
      "other front matter fields must be preserved"
    );
  }

  #[test]
  fn build_agent_content_strips_unknown_color() {
    let agent = make_test_agent(Some("notacolor".to_string()));
    let result = build_agent_content(&agent);
    assert!(
      !result.contains("color:"),
      "unknown color must be stripped from output, got:\n{result}"
    );
  }

  #[test]
  fn build_agent_content_preserves_hex_color() {
    let agent = make_test_agent(Some("#0000FF".to_string()));
    let result = build_agent_content(&agent);
    assert!(
      result.contains("mode: subagent") || result.contains("mode: \"subagent\""),
      "subagent mode should always be emitted, got:\n{result}"
    );
    assert!(
      result.contains("color: '#0000FF'"),
      "valid hex color must be preserved in output, got:\n{result}"
    );
  }

  /// Regression guard: opencode must see generated entries as subagents.
  /// Without `mode: "subagent"`, opencode treats the generated file as a main agent.
  #[test]
  fn build_agent_content_forces_subagent_mode() {
    let agent = make_test_agent(None);
    let result = build_agent_content(&agent);
    assert!(
      result.contains("mode: subagent") || result.contains("mode: \"subagent\""),
      "subagent mode should always be emitted, got:\n{result}"
    );
  }

  #[test]
  fn css_color_name_to_hex_basic_colors() {
    assert_eq!(css_color_name_to_hex("red"), Some("#FF0000"));
    assert_eq!(css_color_name_to_hex("green"), Some("#008000"));
    assert_eq!(css_color_name_to_hex("blue"), Some("#0000FF"));
    assert_eq!(css_color_name_to_hex("yellow"), Some("#FFFF00"));
    assert_eq!(css_color_name_to_hex("black"), Some("#000000"));
    assert_eq!(css_color_name_to_hex("white"), Some("#FFFFFF"));
  }

  #[test]
  fn css_color_name_to_hex_case_insensitive() {
    assert_eq!(css_color_name_to_hex("RED"), Some("#FF0000"));
    assert_eq!(css_color_name_to_hex("Red"), Some("#FF0000"));
    assert_eq!(css_color_name_to_hex("Blue"), Some("#0000FF"));
    assert_eq!(css_color_name_to_hex("BLUE"), Some("#0000FF"));
  }

  #[test]
  fn css_color_name_to_hex_unknown_returns_none() {
    assert_eq!(css_color_name_to_hex("notacolor"), None);
    assert_eq!(css_color_name_to_hex(""), None);
    assert_eq!(css_color_name_to_hex("#FF0000"), None);
  }

  #[test]
  fn css_color_name_to_hex_grey_variants() {
    assert_eq!(css_color_name_to_hex("gray"), Some("#808080"));
    assert_eq!(css_color_name_to_hex("grey"), Some("#808080"));
    assert_eq!(css_color_name_to_hex("lightgray"), Some("#D3D3D3"));
    assert_eq!(css_color_name_to_hex("lightgrey"), Some("#D3D3D3"));
    assert_eq!(css_color_name_to_hex("darkgray"), Some("#A9A9A9"));
    assert_eq!(css_color_name_to_hex("darkgrey"), Some("#A9A9A9"));
  }
}
