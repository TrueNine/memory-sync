use std::collections::HashMap;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Structs mirroring TypeScript InputCollectedContext shapes
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
  pub name: Option<String>,
  pub dir_from_workspace_path: Option<String>,
  pub is_prompt_source_project: Option<bool>,
  pub is_workspace_root_project: Option<bool>,
  pub project_type: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
  pub directory: String,
  pub projects: Vec<Project>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputCollectedContext {
  pub workspace: Option<Workspace>,
  pub vscode_config_files: Option<Vec<serde_json::Value>>,
  pub zed_config_files: Option<Vec<serde_json::Value>>,
  pub jetbrains_config_files: Option<Vec<serde_json::Value>>,
  pub editor_config_files: Option<Vec<serde_json::Value>>,
  pub commands: Option<Vec<serde_json::Value>>,
  pub sub_agents: Option<Vec<serde_json::Value>>,
  pub skills: Option<Vec<serde_json::Value>>,
  pub rules: Option<Vec<serde_json::Value>>,
  pub readme_prompts: Option<Vec<serde_json::Value>>,
  pub ai_agent_ignore_config_files: Option<Vec<serde_json::Value>>,
  pub global_memory: Option<serde_json::Value>,
  pub aindex_dir: Option<String>,
  pub global_git_ignore: Option<String>,
  pub shadow_git_exclude: Option<String>,
}

fn build_project_merge_key(project: &Project) -> String {
  if project.is_workspace_root_project == Some(true) {
    return format!("workspace-root:{}", project.name.as_deref().unwrap_or(""));
  }
  let project_type = project.project_type.as_deref().unwrap_or("workspace");
  format!("{}:{}", project_type, project.name.as_deref().unwrap_or(""))
}

fn merge_workspace(base: &Workspace, addition: &Workspace) -> Workspace {
  let mut project_map: HashMap<String, Project> = HashMap::new();
  for project in &base.projects {
    project_map.insert(build_project_merge_key(project), project.clone());
  }
  for project in &addition.projects {
    project_map.insert(build_project_merge_key(project), project.clone());
  }
  Workspace {
    directory: if addition.directory.is_empty() {
      base.directory.clone()
    } else {
      addition.directory.clone()
    },
    projects: project_map.into_values().collect(),
  }
}

fn merge_arrays(
  base: Option<&Vec<serde_json::Value>>,
  addition: Option<&Vec<serde_json::Value>>,
) -> Option<Vec<serde_json::Value>> {
  match (base, addition) {
    (None, None) => None,
    (None, Some(a)) => Some(a.clone()),
    (Some(b), None) => Some(b.clone()),
    (Some(b), Some(a)) => {
      let mut result = b.clone();
      result.extend(a.clone());
      Some(result)
    }
  }
}

/// Merge two partial InputCollectedContext objects.
pub fn merge_contexts(
  base: &InputCollectedContext,
  addition: &InputCollectedContext,
) -> InputCollectedContext {
  InputCollectedContext {
    workspace: match (&base.workspace, &addition.workspace) {
      (None, None) => None,
      (None, Some(w)) => Some(w.clone()),
      (Some(w), None) => Some(w.clone()),
      (Some(b), Some(a)) => Some(merge_workspace(b, a)),
    },
    vscode_config_files: merge_arrays(
      base.vscode_config_files.as_ref(),
      addition.vscode_config_files.as_ref(),
    ),
    zed_config_files: merge_arrays(
      base.zed_config_files.as_ref(),
      addition.zed_config_files.as_ref(),
    ),
    jetbrains_config_files: merge_arrays(
      base.jetbrains_config_files.as_ref(),
      addition.jetbrains_config_files.as_ref(),
    ),
    editor_config_files: merge_arrays(
      base.editor_config_files.as_ref(),
      addition.editor_config_files.as_ref(),
    ),
    commands: merge_arrays(base.commands.as_ref(), addition.commands.as_ref()),
    sub_agents: merge_arrays(base.sub_agents.as_ref(), addition.sub_agents.as_ref()),
    skills: merge_arrays(base.skills.as_ref(), addition.skills.as_ref()),
    rules: merge_arrays(base.rules.as_ref(), addition.rules.as_ref()),
    readme_prompts: merge_arrays(
      base.readme_prompts.as_ref(),
      addition.readme_prompts.as_ref(),
    ),
    ai_agent_ignore_config_files: merge_arrays(
      base.ai_agent_ignore_config_files.as_ref(),
      addition.ai_agent_ignore_config_files.as_ref(),
    ),
    global_memory: addition
      .global_memory
      .clone()
      .or_else(|| base.global_memory.clone()),
    aindex_dir: addition
      .aindex_dir
      .clone()
      .or_else(|| base.aindex_dir.clone()),
    global_git_ignore: addition
      .global_git_ignore
      .clone()
      .or_else(|| base.global_git_ignore.clone()),
    shadow_git_exclude: addition
      .shadow_git_exclude
      .clone()
      .or_else(|| base.shadow_git_exclude.clone()),
  }
}

/// Build dependency context from plugin outputs.
pub fn build_dependency_context(
  deps: &[String],
  outputs_by_plugin: &HashMap<String, InputCollectedContext>,
) -> InputCollectedContext {
  let mut merged = InputCollectedContext::default();
  let mut visited = std::collections::HashSet::new();
  for dep_name in deps {
    if visited.contains(dep_name) {
      continue;
    }
    visited.insert(dep_name.clone());
    if let Some(dep_output) = outputs_by_plugin.get(dep_name) {
      merged = merge_contexts(&merged, dep_output);
    }
  }
  merged
}

#[cfg(test)]
mod tests {
  use super::*;

  fn project(name: &str, project_type: Option<&str>, is_root: bool) -> Project {
    Project {
      name: Some(name.to_string()),
      dir_from_workspace_path: None,
      is_prompt_source_project: None,
      is_workspace_root_project: Some(is_root),
      project_type: project_type.map(|s| s.to_string()),
    }
  }

  #[test]
  fn merge_contexts_concatenates_arrays() {
    let base = InputCollectedContext {
      commands: Some(vec![serde_json::json!("a")]),
      ..Default::default()
    };
    let addition = InputCollectedContext {
      commands: Some(vec![serde_json::json!("b")]),
      ..Default::default()
    };
    let merged = merge_contexts(&base, &addition);
    assert_eq!(
      merged.commands.unwrap(),
      vec![serde_json::json!("a"), serde_json::json!("b")]
    );
  }

  #[test]
  fn merge_contexts_overrides_scalar() {
    let base = InputCollectedContext {
      global_git_ignore: Some("base".to_string()),
      ..Default::default()
    };
    let addition = InputCollectedContext {
      global_git_ignore: Some("addition".to_string()),
      ..Default::default()
    };
    let merged = merge_contexts(&base, &addition);
    assert_eq!(merged.global_git_ignore, Some("addition".to_string()));
  }

  #[test]
  fn merge_contexts_merges_workspace_projects() {
    let base = InputCollectedContext {
      workspace: Some(Workspace {
        directory: "/base".to_string(),
        projects: vec![project("p1", Some("app"), false)],
      }),
      ..Default::default()
    };
    let addition = InputCollectedContext {
      workspace: Some(Workspace {
        directory: "/addition".to_string(),
        projects: vec![
          project("p1", Some("ext"), false),
          project("p2", Some("app"), false),
        ],
      }),
      ..Default::default()
    };
    let merged = merge_contexts(&base, &addition);
    let ws = merged.workspace.unwrap();
    assert_eq!(ws.directory, "/addition");
    // p1 app and p1 ext have different merge keys, so both are kept;
    // later projects with the same merge key replace earlier ones.
    assert_eq!(ws.projects.len(), 3);
  }

  #[test]
  fn build_dependency_context_skips_missing_plugins() {
    let mut outputs = HashMap::new();
    outputs.insert(
      "a".to_string(),
      InputCollectedContext {
        commands: Some(vec![serde_json::json!("cmd")]),
        ..Default::default()
      },
    );
    let result = build_dependency_context(&["a".to_string(), "missing".to_string()], &outputs);
    assert_eq!(result.commands.unwrap().len(), 1);
  }
}
