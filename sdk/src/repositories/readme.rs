use std::collections::HashMap;
use std::path::Path;

use serde::Deserialize;

use crate::domain::config;
use crate::domain::plugin_shared::{PromptKind, ReadmePrompt, RelativePath};
use crate::repositories::prompt_artifact::read_prompt_artifact;

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReadmeInputOptions {
  workspace_dir: String,
}

struct SeriesConfig {
  name: &'static str,
  src: String,
  dist: String,
}

const README_FILE_KINDS: &[(&str, &str)] = &[
  ("Readme", "rdm.mdx"),
  ("CodeOfConduct", "coc.mdx"),
  ("Security", "security.mdx"),
];

fn get_series_configs() -> Vec<SeriesConfig> {
  config::DEFAULT_PROJECT_SERIES
    .iter()
    .map(|&name| {
      let (src, dist) = match name {
        config::DEFAULT_APP_DIR => (
          config::DEFAULT_APP_DIR.to_string(),
          format!("dist/{}", config::DEFAULT_APP_DIR),
        ),
        config::DEFAULT_EXT_DIR => (
          config::DEFAULT_EXT_DIR.to_string(),
          format!("dist/{}", config::DEFAULT_EXT_DIR),
        ),
        config::DEFAULT_ARCH_DIR => (
          config::DEFAULT_ARCH_DIR.to_string(),
          format!("dist/{}", config::DEFAULT_ARCH_DIR),
        ),
        config::DEFAULT_SOFTWARES_DIR => (
          config::DEFAULT_SOFTWARES_DIR.to_string(),
          format!("dist/{}", config::DEFAULT_SOFTWARES_DIR),
        ),
        _ => unreachable!(),
      };
      SeriesConfig { name, src, dist }
    })
    .collect()
}

fn detect_project_name_conflicts(
  aindex_dir: &Path,
  series_configs: &[SeriesConfig],
) -> Result<(), String> {
  let mut refs_by_project: HashMap<String, Vec<String>> = HashMap::new();

  for series in series_configs {
    let series_src_dir = aindex_dir.join(&series.src);
    if !series_src_dir.is_dir() {
      continue;
    }

    let entries = match std::fs::read_dir(&series_src_dir) {
      Ok(e) => e,
      Err(_) => continue,
    };

    for entry in entries.flatten() {
      if !entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
        continue;
      }
      let project_name = entry.file_name().to_string_lossy().into_owned();
      refs_by_project
        .entry(project_name)
        .or_default()
        .push(series.name.to_string());
    }
  }

  let conflicts: Vec<String> = refs_by_project
    .into_iter()
    .filter(|(_, series_names)| {
      let unique: std::collections::HashSet<_> = series_names.iter().collect();
      unique.len() > 1
    })
    .map(|(project_name, _)| project_name)
    .collect();

  if conflicts.is_empty() {
    Ok(())
  } else {
    let mut conflicts_sorted = conflicts;
    conflicts_sorted.sort();
    Err(format!(
      "Readme project series name conflict: {}",
      conflicts_sorted.join(", ")
    ))
  }
}

fn collect_readme_files_recursive(
  current_dir: &Path,
  project_name: &str,
  workspace_dir: &str,
  relative_path: &str,
  readme_prompts: &mut Vec<ReadmePrompt>,
  global_scope_json: Option<&str>,
) -> Result<(), crate::CliError> {
  let is_root = relative_path.is_empty();

  for (file_kind, src_file) in README_FILE_KINDS {
    let file_path = current_dir.join(src_file);
    if !file_path.is_file() {
      continue;
    }

    let file_path_str = file_path.to_string_lossy().into_owned();
    let artifact = read_prompt_artifact(&file_path_str, "dist", global_scope_json)
      .map_err(|e| crate::CliError::ConfigError(e))?;

    let content = artifact.content;
    let length = content.len();

    let target_path = if is_root {
      project_name.to_string()
    } else {
      format!("{}/{}", project_name, relative_path)
    };

    let dir = RelativePath::new(
      &file_path
        .parent()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default(),
      workspace_dir,
    );

    let target_dir = RelativePath::new(&target_path, workspace_dir);

    readme_prompts.push(ReadmePrompt {
      prompt_type: PromptKind::Readme,
      content,
      length,
      dir,
      project_name: project_name.to_string(),
      target_dir,
      is_root,
      file_kind: file_kind.to_string(),
      markdown_contents: Some(vec![]),
    });
  }

  let entries = match std::fs::read_dir(current_dir) {
    Ok(e) => e,
    Err(_) => return Ok(()),
  };

  for entry in entries.flatten() {
    if !entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
      continue;
    }
    let child_name = entry.file_name().to_string_lossy().into_owned();
    let child_dir = current_dir.join(&child_name);
    let child_relative = if is_root {
      child_name
    } else {
      format!("{}/{}", relative_path, child_name)
    };

    collect_readme_files_recursive(
      &child_dir,
      project_name,
      workspace_dir,
      &child_relative,
      readme_prompts,
      global_scope_json,
    )?;
  }

  Ok(())
}

pub fn collect_readme(options_json: &str) -> Result<String, crate::CliError> {
  let options: ReadmeInputOptions =
    serde_json::from_str(options_json).map_err(|e| crate::CliError::ConfigError(e.to_string()))?;

  let workspace_dir = config::resolve_workspace_dir(&options.workspace_dir);
  let workspace_dir_str = workspace_dir.to_string_lossy().into_owned();
  let aindex_dir = config::resolve_workspace_aindex_dir(&workspace_dir_str);
  let series_configs = get_series_configs();

  if let Err(e) = detect_project_name_conflicts(&aindex_dir, &series_configs) {
    return Err(crate::CliError::ConfigError(e));
  }

  let mut readme_prompts: Vec<ReadmePrompt> = Vec::new();

  let global_scope_json = options_json
    .parse::<serde_json::Value>()
    .ok()
    .and_then(|v| v.get("globalScope").map(|g| g.to_string()));

  for series in &series_configs {
    let dist_dir = aindex_dir.join(&series.dist);
    if !dist_dir.is_dir() {
      continue;
    }

    let mut project_entries: Vec<String> = match std::fs::read_dir(&dist_dir) {
      Ok(entries) => entries
        .flatten()
        .filter(|e| e.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect(),
      Err(_) => continue,
    };

    project_entries.sort();

    for project_name in project_entries {
      let project_dir = dist_dir.join(&project_name);
      collect_readme_files_recursive(
        &project_dir,
        &project_name,
        &workspace_dir_str,
        "",
        &mut readme_prompts,
        global_scope_json.as_deref(),
      )?;
    }
  }

  readme_prompts.sort_by(|a, b| {
    a.project_name
      .cmp(&b.project_name)
      .then_with(|| a.target_dir.path.cmp(&b.target_dir.path))
      .then_with(|| a.file_kind.cmp(&b.file_kind))
  });

  #[derive(Debug, Clone, serde::Serialize)]
  #[serde(rename_all = "camelCase")]
  struct ReadmeResult {
    readme_prompts: Vec<ReadmePrompt>,
  }

  let result = ReadmeResult { readme_prompts };
  serde_json::to_string(&result).map_err(crate::CliError::SerializationError)
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;
  use tempfile::TempDir;

  #[test]
  fn collect_readme_empty_when_no_dist() {
    let tmp = TempDir::new().unwrap();
    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_readme(&options.to_string()).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
    let prompts = parsed["readmePrompts"].as_array().unwrap();
    assert!(prompts.is_empty());
  }

  #[test]
  fn collect_readme_detects_conflict() {
    let tmp = TempDir::new().unwrap();
    let aindex = tmp.path().join("aindex");
    fs::create_dir_all(aindex.join("app").join("project-a")).unwrap();
    fs::create_dir_all(aindex.join("softwares").join("project-a")).unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_readme(&options.to_string());
    assert!(result.is_err());
    assert!(
      result
        .unwrap_err()
        .to_string()
        .contains("Readme project series name conflict")
    );
  }

  #[test]
  fn collect_readme_reads_project_files() {
    let tmp = TempDir::new().unwrap();
    let dist_app = tmp
      .path()
      .join("aindex")
      .join("dist")
      .join("app")
      .join("demo");
    fs::create_dir_all(&dist_app).unwrap();
    fs::write(dist_app.join("rdm.mdx"), "# Demo README").unwrap();
    fs::write(dist_app.join("coc.mdx"), "# CoC").unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_readme(&options.to_string()).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
    let prompts = parsed["readmePrompts"].as_array().unwrap();
    assert_eq!(prompts.len(), 2);

    let kinds: Vec<&str> = prompts
      .iter()
      .map(|p| p["fileKind"].as_str().unwrap())
      .collect();
    assert!(kinds.contains(&"CodeOfConduct"));
    assert!(kinds.contains(&"Readme"));

    let readme = prompts.iter().find(|p| p["fileKind"] == "Readme").unwrap();
    assert_eq!(readme["projectName"], "demo");
    assert_eq!(readme["isRoot"], true);
  }

  #[test]
  fn collect_readme_reads_nested_project_files() {
    let tmp = TempDir::new().unwrap();
    let dist_app = tmp
      .path()
      .join("aindex")
      .join("dist")
      .join("app")
      .join("demo")
      .join("docs");
    fs::create_dir_all(&dist_app).unwrap();
    fs::write(dist_app.join("security.mdx"), "# Security").unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_readme(&options.to_string()).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
    let prompts = parsed["readmePrompts"].as_array().unwrap();
    assert_eq!(prompts.len(), 1);
    assert_eq!(prompts[0]["fileKind"], "Security");
    assert_eq!(prompts[0]["isRoot"], false);
    assert!(
      prompts[0]["targetDir"]["path"]
        .as_str()
        .unwrap()
        .contains("docs")
    );
  }
}
