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

#[cfg(feature = "napi")]
pub mod napi_binding {
  use napi_derive::napi;

  #[napi(object)]
  pub struct Project {
    pub name: Option<String>,
    #[napi(js_name = "dirFromWorkspacePath")]
    pub dir_from_workspace_path: Option<String>,
    #[napi(js_name = "isPromptSourceProject")]
    pub is_prompt_source_project: Option<bool>,
    #[napi(js_name = "isWorkspaceRootProject")]
    pub is_workspace_root_project: Option<bool>,
    #[napi(js_name = "projectType")]
    pub project_type: Option<String>,
  }

  impl From<Project> for super::Project {
    fn from(value: Project) -> Self {
      Self {
        name: value.name,
        dir_from_workspace_path: value.dir_from_workspace_path,
        is_prompt_source_project: value.is_prompt_source_project,
        is_workspace_root_project: value.is_workspace_root_project,
        project_type: value.project_type,
      }
    }
  }

  #[napi(object)]
  pub struct Workspace {
    pub directory: String,
    pub projects: Vec<Project>,
  }

  impl From<Workspace> for super::Workspace {
    fn from(value: Workspace) -> Self {
      Self {
        directory: value.directory,
        projects: value.projects.into_iter().map(Into::into).collect(),
      }
    }
  }

  #[napi(object)]
  pub struct InputCollectedContext {
    pub workspace: Option<Workspace>,
    #[napi(js_name = "vscodeConfigFiles")]
    pub vscode_config_files: Option<Vec<serde_json::Value>>,
    #[napi(js_name = "zedConfigFiles")]
    pub zed_config_files: Option<Vec<serde_json::Value>>,
    #[napi(js_name = "jetbrainsConfigFiles")]
    pub jetbrains_config_files: Option<Vec<serde_json::Value>>,
    #[napi(js_name = "editorConfigFiles")]
    pub editor_config_files: Option<Vec<serde_json::Value>>,
    pub commands: Option<Vec<serde_json::Value>>,
    #[napi(js_name = "subAgents")]
    pub sub_agents: Option<Vec<serde_json::Value>>,
    pub skills: Option<Vec<serde_json::Value>>,
    pub rules: Option<Vec<serde_json::Value>>,
    #[napi(js_name = "readmePrompts")]
    pub readme_prompts: Option<Vec<serde_json::Value>>,
    #[napi(js_name = "aiAgentIgnoreConfigFiles")]
    pub ai_agent_ignore_config_files: Option<Vec<serde_json::Value>>,
    #[napi(js_name = "globalMemory")]
    pub global_memory: Option<serde_json::Value>,
    #[napi(js_name = "aindexDir")]
    pub aindex_dir: Option<String>,
    #[napi(js_name = "globalGitIgnore")]
    pub global_git_ignore: Option<String>,
    #[napi(js_name = "shadowGitExclude")]
    pub shadow_git_exclude: Option<String>,
  }

  impl From<InputCollectedContext> for super::InputCollectedContext {
    fn from(value: InputCollectedContext) -> Self {
      Self {
        workspace: value.workspace.map(Into::into),
        vscode_config_files: value.vscode_config_files,
        zed_config_files: value.zed_config_files,
        jetbrains_config_files: value.jetbrains_config_files,
        editor_config_files: value.editor_config_files,
        commands: value.commands,
        sub_agents: value.sub_agents,
        skills: value.skills,
        rules: value.rules,
        readme_prompts: value.readme_prompts,
        ai_agent_ignore_config_files: value.ai_agent_ignore_config_files,
        global_memory: value.global_memory,
        aindex_dir: value.aindex_dir,
        global_git_ignore: value.global_git_ignore,
        shadow_git_exclude: value.shadow_git_exclude,
      }
    }
  }

  impl From<super::InputCollectedContext> for InputCollectedContext {
    fn from(value: super::InputCollectedContext) -> Self {
      Self {
        workspace: value.workspace.map(|w| Workspace {
          directory: w.directory,
          projects: w
            .projects
            .into_iter()
            .map(|p| Project {
              name: p.name,
              dir_from_workspace_path: p.dir_from_workspace_path,
              is_prompt_source_project: p.is_prompt_source_project,
              is_workspace_root_project: p.is_workspace_root_project,
              project_type: p.project_type,
            })
            .collect(),
        }),
        vscode_config_files: value.vscode_config_files,
        zed_config_files: value.zed_config_files,
        jetbrains_config_files: value.jetbrains_config_files,
        editor_config_files: value.editor_config_files,
        commands: value.commands,
        sub_agents: value.sub_agents,
        skills: value.skills,
        rules: value.rules,
        readme_prompts: value.readme_prompts,
        ai_agent_ignore_config_files: value.ai_agent_ignore_config_files,
        global_memory: value.global_memory,
        aindex_dir: value.aindex_dir,
        global_git_ignore: value.global_git_ignore,
        shadow_git_exclude: value.shadow_git_exclude,
      }
    }
  }

  #[napi(js_name = "mergeContexts")]
  pub fn merge_contexts_binding(
    base: InputCollectedContext,
    addition: InputCollectedContext,
  ) -> InputCollectedContext {
    let result = super::merge_contexts(&base.into(), &addition.into());
    result.into()
  }

  #[napi(js_name = "buildDependencyContext")]
  pub fn build_dependency_context_binding(
    deps: Vec<String>,
    outputs_by_plugin_json: String,
  ) -> napi::Result<InputCollectedContext> {
    let outputs_by_plugin: std::collections::HashMap<String, super::InputCollectedContext> =
      serde_json::from_str(&outputs_by_plugin_json)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    let result = super::build_dependency_context(&deps, &outputs_by_plugin);
    Ok(result.into())
  }
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
