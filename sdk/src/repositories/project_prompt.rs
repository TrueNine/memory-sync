use std::path::Path;

use serde::Deserialize;
use serde_json::Value;

use crate::domain::config;
use crate::domain::plugin_shared::{
  FilePathKind, Project, ProjectChildrenMemoryPrompt, ProjectRootMemoryPrompt, PromptKind,
  RelativePath, RootPath, Workspace,
};
use crate::repositories::prompt_artifact::read_prompt_artifact;

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectPromptInputOptions {
  workspace_dir: String,
  #[serde(default)]
  global_scope: Option<Value>,
  #[serde(default)]
  workspace: Option<Workspace>,
}

const SERIES_NAMES: &[&str] = config::DEFAULT_PROJECT_SERIES;
const PROJECT_MEMORY_FILE: &str = "agt.mdx";
const SCAN_SKIP_DIRECTORIES: &[&str] = &["node_modules", ".git"];

fn assert_no_residual_module_syntax(content: &str, file_path: &str) -> Result<(), String> {
  let code_fence_pattern = regex_lite::Regex::new(r"^\s*(```|~~~)").unwrap();
  let residual_patterns = [
    regex_lite::Regex::new(r"^\s*export\s+default\b").unwrap(),
    regex_lite::Regex::new(r"^\s*export\s+const\b").unwrap(),
    regex_lite::Regex::new(r"^\s*import\b").unwrap(),
  ];
  let mut active_fence: Option<&str> = None;
  for (index, line) in content.lines().enumerate() {
    if let Some(caps) = code_fence_pattern.captures(line) {
      let marker = caps.get(1).map(|m| m.as_str()).unwrap_or("");
      if active_fence.is_none() {
        active_fence = Some(marker);
      } else if active_fence == Some(marker) {
        active_fence = None;
      }
      continue;
    }
    if active_fence.is_some() {
      continue;
    }
    for pat in &residual_patterns {
      if pat.is_match(line) {
        return Err(format!(
          "Compiled prompt still contains residual module syntax at {}:{}: {}",
          file_path,
          index + 1,
          line.trim()
        ));
      }
    }
  }
  Ok(())
}

fn extract_front_matter(raw_mdx: &str) -> (Option<Value>, Option<String>) {
  let front_matter_regex =
    regex_lite::Regex::new(r"(?s)^---\r?\n(.*?)\r?\n---(?:(?:\r?\n){1,2}|$)").ok();
  if let Some(re) = front_matter_regex {
    if let Some(caps) = re.captures(raw_mdx) {
      let raw_fm = caps.get(1).map(|m| m.as_str().to_string());
      let yaml_json = raw_fm
        .as_deref()
        .and_then(|fm| serde_yml::from_str::<Value>(fm).ok());
      return (yaml_json, raw_fm);
    }
  }
  (None, None)
}

fn read_root_memory_prompt(
  project_path: &Path,
  global_scope_json: Option<&str>,
) -> Result<Option<ProjectRootMemoryPrompt>, crate::CliError> {
  let file_path = project_path.join(PROJECT_MEMORY_FILE);
  if !file_path.is_file() {
    return Ok(None);
  }
  let file_path_str = file_path.to_string_lossy().into_owned();

  let artifact = read_prompt_artifact(&file_path_str, "dist", global_scope_json)
    .map_err(|e| crate::CliError::ConfigError(e))?;

  assert_no_residual_module_syntax(&artifact.content, &file_path_str)
    .map_err(crate::CliError::ConfigError)?;

  let content = artifact.content;
  let length = content.len();
  let (yaml_front_matter, raw_front_matter) = extract_front_matter(&artifact.raw_mdx);

  Ok(Some(ProjectRootMemoryPrompt {
    prompt_type: PromptKind::ProjectRootMemory,
    content,
    length,
    file_path_kind: FilePathKind::Relative,
    dir: RootPath::new(""),
    yaml_front_matter,
    raw_front_matter,
    markdown_ast: None,
    markdown_contents: None,
  }))
}

fn read_child_memory_prompt(
  shadow_project_path: &Path,
  shadow_child_dir: &Path,
  target_project_path: &str,
  global_scope_json: Option<&str>,
) -> Result<Option<ProjectChildrenMemoryPrompt>, crate::CliError> {
  let file_path = shadow_child_dir.join(PROJECT_MEMORY_FILE);
  if !file_path.is_file() {
    return Ok(None);
  }
  let file_path_str = file_path.to_string_lossy().into_owned();

  let artifact = read_prompt_artifact(&file_path_str, "dist", global_scope_json)
    .map_err(|e| crate::CliError::ConfigError(e))?;

  assert_no_residual_module_syntax(&artifact.content, &file_path_str)
    .map_err(crate::CliError::ConfigError)?;

  let relative_path = shadow_child_dir
    .strip_prefix(shadow_project_path)
    .unwrap_or(shadow_child_dir)
    .to_string_lossy()
    .into_owned();

  let content = artifact.content;
  let length = content.len();
  let (yaml_front_matter, raw_front_matter) = extract_front_matter(&artifact.raw_mdx);

  let dir = RelativePath::new(&relative_path, target_project_path);

  Ok(Some(ProjectChildrenMemoryPrompt {
    prompt_type: PromptKind::ProjectChildrenMemory,
    content,
    length,
    file_path_kind: FilePathKind::Relative,
    dir: dir.clone(),
    yaml_front_matter,
    raw_front_matter,
    markdown_ast: None,
    markdown_contents: None,
    working_child_directory_path: dir,
  }))
}

fn scan_child_memory_prompts(
  shadow_project_path: &Path,
  target_project_path: &str,
  global_scope_json: Option<&str>,
) -> Result<Vec<ProjectChildrenMemoryPrompt>, crate::CliError> {
  let mut prompts: Vec<ProjectChildrenMemoryPrompt> = Vec::new();
  scan_directory_recursive(
    shadow_project_path,
    shadow_project_path,
    target_project_path,
    &mut prompts,
    global_scope_json,
  )?;
  Ok(prompts)
}

fn scan_directory_recursive(
  shadow_project_path: &Path,
  current_dir: &Path,
  target_project_path: &str,
  prompts: &mut Vec<ProjectChildrenMemoryPrompt>,
  global_scope_json: Option<&str>,
) -> Result<(), crate::CliError> {
  let entries = match std::fs::read_dir(current_dir) {
    Ok(e) => e,
    Err(_) => return Ok(()),
  };

  for entry in entries.flatten() {
    if !entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
      continue;
    }
    let child_name = entry.file_name().to_string_lossy().into_owned();
    if SCAN_SKIP_DIRECTORIES.contains(&child_name.as_str()) {
      continue;
    }
    let child_dir = current_dir.join(&child_name);

    if let Some(prompt) = read_child_memory_prompt(
      shadow_project_path,
      &child_dir,
      target_project_path,
      global_scope_json,
    )? {
      prompts.push(prompt);
    }

    scan_directory_recursive(
      shadow_project_path,
      &child_dir,
      target_project_path,
      prompts,
      global_scope_json,
    )?;
  }

  Ok(())
}

fn resolve_workspace_root_project_config(projects: &[Project]) -> Option<Value> {
  let concrete_projects: Vec<_> = projects
    .iter()
    .filter(|p| p.is_workspace_root_project != Some(true))
    .collect();
  let prompt_source_project = concrete_projects
    .iter()
    .find(|p| p.is_prompt_source_project == Some(true));
  prompt_source_project
    .and_then(|p| p.project_config.clone())
    .or_else(|| {
      concrete_projects
        .first()
        .and_then(|p| p.project_config.clone())
    })
}

fn read_workspace_root_project_prompt(
  file_path: &Path,
  global_scope_json: Option<&str>,
  project_config: Option<Value>,
) -> Result<Option<Project>, crate::CliError> {
  if !file_path.is_file() {
    return Ok(None);
  }
  let file_path_str = file_path.to_string_lossy().into_owned();

  let artifact = read_prompt_artifact(&file_path_str, "dist", global_scope_json)
    .map_err(|e| crate::CliError::ConfigError(e))?;

  assert_no_residual_module_syntax(&artifact.content, &file_path_str)
    .map_err(crate::CliError::ConfigError)?;

  let content = artifact.content;
  let length = content.len();
  let (yaml_front_matter, raw_front_matter) = extract_front_matter(&artifact.raw_mdx);

  let root_memory_prompt = ProjectRootMemoryPrompt {
    prompt_type: PromptKind::ProjectRootMemory,
    content,
    length,
    file_path_kind: FilePathKind::Relative,
    dir: RootPath::new(""),
    yaml_front_matter,
    raw_front_matter,
    markdown_ast: None,
    markdown_contents: None,
  };

  Ok(Some(Project {
    name: Some("__workspace__".to_string()),
    is_workspace_root_project: Some(true),
    project_config,
    root_memory_prompt: Some(root_memory_prompt),
    ..Default::default()
  }))
}

pub fn collect_project_prompt(options_json: &str) -> Result<String, crate::CliError> {
  let options: ProjectPromptInputOptions =
    serde_json::from_str(options_json).map_err(|e| crate::CliError::ConfigError(e.to_string()))?;

  let workspace_dir = config::resolve_workspace_dir(&options.workspace_dir);
  let workspace_dir_str = workspace_dir.to_string_lossy().into_owned();

  let global_scope_json = options.global_scope.as_ref().map(|v| v.to_string());

  let dependency_workspace = options.workspace.unwrap_or_else(|| Workspace {
    directory: RootPath::new(&workspace_dir_str),
    projects: vec![],
  });

  let mut enhanced_projects: Vec<Project> = Vec::new();

  for project in dependency_workspace.projects {
    let project_name = match project.name.as_ref() {
      Some(n) => n,
      None => {
        enhanced_projects.push(project);
        continue;
      }
    };

    if project.is_workspace_root_project == Some(true) {
      enhanced_projects.push(project);
      continue;
    }

    let series_configs: Vec<String> = if project.project_type.is_some() {
      vec![project.project_type.clone().unwrap()]
    } else {
      SERIES_NAMES.iter().map(|&s| s.to_string()).collect()
    };

    let matching_series = series_configs.iter().find(|series_name| {
      let shadow_path =
        config::resolve_workspace_aindex_dist_series_dir(&workspace_dir_str, series_name)
          .join(project_name);
      shadow_path.is_dir()
    });

    if matching_series.is_none() {
      enhanced_projects.push(project);
      continue;
    }

    let series_name = matching_series.unwrap();
    let shadow_project_path =
      config::resolve_workspace_aindex_dist_series_dir(&workspace_dir_str, series_name)
        .join(project_name);

    let target_project_path = project
      .dir_from_workspace_path
      .as_ref()
      .map(|rp| rp.get_absolute_path());

    let root_memory_prompt =
      read_root_memory_prompt(&shadow_project_path, global_scope_json.as_deref())?;
    let child_memory_prompts = if let Some(ref tp) = target_project_path {
      scan_child_memory_prompts(&shadow_project_path, tp, global_scope_json.as_deref())?
    } else {
      vec![]
    };

    let mut enhanced_project = project;
    if enhanced_project.project_type.is_none() {
      enhanced_project.project_type = Some(series_name.clone());
    }
    if root_memory_prompt.is_some() {
      enhanced_project.root_memory_prompt = root_memory_prompt;
    }
    if !child_memory_prompts.is_empty() {
      enhanced_project.child_memory_prompts = Some(child_memory_prompts);
    }
    enhanced_projects.push(enhanced_project);
  }

  let workspace_prompt_file =
    config::resolve_workspace_aindex_workspace_prompt_dist_file(&workspace_dir_str);

  let workspace_root_project = read_workspace_root_project_prompt(
    &workspace_prompt_file,
    global_scope_json.as_deref(),
    resolve_workspace_root_project_config(&enhanced_projects),
  )?;

  let final_projects = if let Some(wrp) = workspace_root_project {
    let mut pts = enhanced_projects;
    pts.push(wrp);
    pts
  } else {
    enhanced_projects
  };

  let result_workspace = Workspace {
    directory: dependency_workspace.directory,
    projects: final_projects,
  };

  #[derive(Debug, Clone, serde::Serialize)]
  #[serde(rename_all = "camelCase")]
  struct ProjectPromptResult {
    workspace: Workspace,
  }

  let result = ProjectPromptResult {
    workspace: result_workspace,
  };
  serde_json::to_string(&result).map_err(crate::CliError::SerializationError)
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;
  use tempfile::TempDir;

  fn create_project(name: &str, base_path: &str) -> Project {
    Project {
      name: Some(name.to_string()),
      dir_from_workspace_path: Some(RelativePath::new(name, base_path)),
      ..Default::default()
    }
  }

  fn create_workspace(base_path: &str, projects: Vec<Project>) -> Workspace {
    Workspace {
      directory: RootPath::new(base_path),
      projects,
    }
  }

  #[test]
  fn collect_project_prompt_injects_workspace_root_project() {
    let tmp = TempDir::new().unwrap();
    let dist_dir = tmp.path().join("aindex").join("dist");
    fs::create_dir_all(&dist_dir).unwrap();
    fs::write(
      dist_dir.join("workspace.mdx"),
      "---\ndescription: workspace\n---\nWorkspace prompt body",
    )
    .unwrap();

    let workspace = create_workspace(&tmp.path().to_string_lossy().to_string(), vec![]);
    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
      "workspace": workspace,
    });

    let result = collect_project_prompt(&options.to_string()).unwrap();
    let parsed: Value = serde_json::from_str(&result).unwrap();
    let projects = parsed["workspace"]["projects"].as_array().unwrap();
    let workspace_project = projects
      .iter()
      .find(|p| p["isWorkspaceRootProject"] == true);
    assert!(workspace_project.is_some());
    assert_eq!(workspace_project.unwrap()["name"], "__workspace__");
    assert_eq!(
      workspace_project.unwrap()["rootMemoryPrompt"]["content"],
      "Workspace prompt body"
    );
  }

  #[test]
  fn collect_project_prompt_does_not_fall_back_outside_aindex() {
    let tmp = TempDir::new().unwrap();
    let wrong_dist = tmp.path().join("dist");
    fs::create_dir_all(&wrong_dist).unwrap();
    fs::write(wrong_dist.join("workspace.mdx"), "Wrong workspace prompt").unwrap();

    let workspace = create_workspace(&tmp.path().to_string_lossy().to_string(), vec![]);
    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
      "workspace": workspace,
    });

    let result = collect_project_prompt(&options.to_string()).unwrap();
    let parsed: Value = serde_json::from_str(&result).unwrap();
    let projects = parsed["workspace"]["projects"].as_array().unwrap();
    assert!(!projects.iter().any(|p| p["isWorkspaceRootProject"] == true));
  }

  #[test]
  fn collect_project_prompt_inherits_prompt_source_config() {
    let tmp = TempDir::new().unwrap();
    let dist_dir = tmp.path().join("aindex").join("dist");
    fs::create_dir_all(&dist_dir).unwrap();
    fs::write(dist_dir.join("workspace.mdx"), "Workspace prompt body").unwrap();

    let base = tmp.path().to_string_lossy().to_string();
    let workspace = create_workspace(
      &base,
      vec![
        create_project("project-a", &base),
        Project {
          name: Some("project-b".to_string()),
          is_prompt_source_project: Some(true),
          project_config: Some(serde_json::json!({"includeSeries": ["prompt-source-series"]})),
          dir_from_workspace_path: Some(RelativePath::new("project-b", &base)),
          ..Default::default()
        },
      ],
    );

    let options = serde_json::json!({
      "workspaceDir": base,
      "workspace": workspace,
    });

    let result = collect_project_prompt(&options.to_string()).unwrap();
    let parsed: Value = serde_json::from_str(&result).unwrap();
    let projects = parsed["workspace"]["projects"].as_array().unwrap();
    let workspace_project = projects
      .iter()
      .find(|p| p["isWorkspaceRootProject"] == true)
      .unwrap();
    assert_eq!(
      workspace_project["projectConfig"]["includeSeries"],
      serde_json::json!(["prompt-source-series"])
    );
  }

  #[test]
  fn collect_project_prompt_loads_series_project_prompts() {
    let tmp = TempDir::new().unwrap();
    let ext_root = tmp
      .path()
      .join("aindex")
      .join("dist")
      .join("ext")
      .join("plugin-a");
    let arch_root = tmp
      .path()
      .join("aindex")
      .join("dist")
      .join("arch")
      .join("system-a");
    let software_root = tmp
      .path()
      .join("aindex")
      .join("dist")
      .join("softwares")
      .join("tool-a");

    fs::create_dir_all(ext_root.join("docs")).unwrap();
    fs::create_dir_all(arch_root.join("design")).unwrap();
    fs::create_dir_all(software_root.join("manual")).unwrap();

    fs::write(ext_root.join("agt.mdx"), "Ext root prompt").unwrap();
    fs::write(ext_root.join("docs").join("agt.mdx"), "Ext child prompt").unwrap();
    fs::write(arch_root.join("agt.mdx"), "Arch root prompt").unwrap();
    fs::write(
      arch_root.join("design").join("agt.mdx"),
      "Arch child prompt",
    )
    .unwrap();
    fs::write(software_root.join("agt.mdx"), "Software root prompt").unwrap();
    fs::write(
      software_root.join("manual").join("agt.mdx"),
      "Software child prompt",
    )
    .unwrap();

    let base = tmp.path().to_string_lossy().to_string();
    let workspace = create_workspace(
      &base,
      vec![
        Project {
          name: Some("plugin-a".to_string()),
          project_type: Some("ext".to_string()),
          dir_from_workspace_path: Some(RelativePath::new("plugin-a", &base)),
          ..Default::default()
        },
        Project {
          name: Some("system-a".to_string()),
          project_type: Some("arch".to_string()),
          dir_from_workspace_path: Some(RelativePath::new("system-a", &base)),
          ..Default::default()
        },
        Project {
          name: Some("tool-a".to_string()),
          project_type: Some("softwares".to_string()),
          dir_from_workspace_path: Some(RelativePath::new("tool-a", &base)),
          ..Default::default()
        },
      ],
    );

    let options = serde_json::json!({
      "workspaceDir": base,
      "workspace": workspace,
    });

    let result = collect_project_prompt(&options.to_string()).unwrap();
    let parsed: Value = serde_json::from_str(&result).unwrap();
    let projects = parsed["workspace"]["projects"].as_array().unwrap();

    let ext_project = projects.iter().find(|p| p["name"] == "plugin-a").unwrap();
    assert_eq!(
      ext_project["rootMemoryPrompt"]["content"],
      "Ext root prompt"
    );
    assert_eq!(
      ext_project["childMemoryPrompts"][0]["content"],
      "Ext child prompt"
    );

    let arch_project = projects.iter().find(|p| p["name"] == "system-a").unwrap();
    assert_eq!(
      arch_project["rootMemoryPrompt"]["content"],
      "Arch root prompt"
    );
    assert_eq!(
      arch_project["childMemoryPrompts"][0]["content"],
      "Arch child prompt"
    );

    let software_project = projects.iter().find(|p| p["name"] == "tool-a").unwrap();
    assert_eq!(
      software_project["rootMemoryPrompt"]["content"],
      "Software root prompt"
    );
    assert_eq!(
      software_project["childMemoryPrompts"][0]["content"],
      "Software child prompt"
    );
  }
}
