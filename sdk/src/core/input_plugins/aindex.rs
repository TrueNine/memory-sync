use std::collections::HashMap;
use std::path::Path;

use serde::Deserialize;
use serde_json::Value;

use crate::core::config;
use crate::core::plugin_shared::{Project, RelativePath, RootPath, Workspace};

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AindexInputOptions {
  workspace_dir: String,
  #[serde(default)]
  aindex: Option<AindexAindexInput>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AindexAindexInput {
  #[serde(default)]
  dir: Option<String>,
  #[serde(default)]
  app: Option<SeriesPair>,
  #[serde(default)]
  ext: Option<SeriesPair>,
  #[serde(default)]
  arch: Option<SeriesPair>,
  #[serde(default)]
  softwares: Option<SeriesPair>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SeriesPair {
  #[serde(default)]
  src: Option<String>,
  #[serde(default)]
  dist: Option<String>,
}

struct SeriesConfig {
  name: &'static str,
  src: String,
  dist: String,
}

const SERIES_NAMES: &[&str] = &["app", "ext", "arch", "softwares"];

fn get_series_configs(aindex: &Option<AindexAindexInput>) -> Vec<SeriesConfig> {
  SERIES_NAMES
    .iter()
    .map(|name| {
      let (src, dist) = match *name {
        "app" => (
          aindex
            .as_ref()
            .and_then(|a| a.app.as_ref().and_then(|p| p.src.clone()))
            .unwrap_or_else(|| "app".to_string()),
          aindex
            .as_ref()
            .and_then(|a| a.app.as_ref().and_then(|p| p.dist.clone()))
            .unwrap_or_else(|| "dist/app".to_string()),
        ),
        "ext" => (
          aindex
            .as_ref()
            .and_then(|a| a.ext.as_ref().and_then(|p| p.src.clone()))
            .unwrap_or_else(|| "ext".to_string()),
          aindex
            .as_ref()
            .and_then(|a| a.ext.as_ref().and_then(|p| p.dist.clone()))
            .unwrap_or_else(|| "dist/ext".to_string()),
        ),
        "arch" => (
          aindex
            .as_ref()
            .and_then(|a| a.arch.as_ref().and_then(|p| p.src.clone()))
            .unwrap_or_else(|| "arch".to_string()),
          aindex
            .as_ref()
            .and_then(|a| a.arch.as_ref().and_then(|p| p.dist.clone()))
            .unwrap_or_else(|| "dist/arch".to_string()),
        ),
        "softwares" => (
          aindex
            .as_ref()
            .and_then(|a| a.softwares.as_ref().and_then(|p| p.src.clone()))
            .unwrap_or_else(|| "softwares".to_string()),
          aindex
            .as_ref()
            .and_then(|a| a.softwares.as_ref().and_then(|p| p.dist.clone()))
            .unwrap_or_else(|| "dist/softwares".to_string()),
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
      "Aindex project series name conflict: {}",
      conflicts_sorted.join(", ")
    ))
  }
}

fn load_project_config(project_name: &str, config_path: &Path) -> Result<Option<Value>, String> {
  if !config_path.is_file() {
    return Ok(None);
  }

  let raw = std::fs::read_to_string(config_path)
    .map_err(|e| format!("Failed to load project.json5 for {project_name}: {e}"))?;

  match json5::from_str::<Value>(&raw) {
    Ok(v) => Ok(Some(v)),
    Err(e) => Err(format!(
      "AINDEX_PROJECT_JSON5_INVALID: Failed to parse project.json5 for {project_name}: {e}"
    )),
  }
}

fn load_fallback_project_config(
  project_name: &str,
  aindex_dir: &Path,
  series_configs: &[SeriesConfig],
) -> Option<Value> {
  for series in series_configs {
    let config_path = aindex_dir
      .join(&series.src)
      .join(project_name)
      .join("project.json5");
    if let Ok(Some(config)) = load_project_config(project_name, &config_path) {
      return Some(config);
    }
  }
  None
}

pub fn collect_aindex(options_json: &str) -> Result<String, crate::CliError> {
  let options: AindexInputOptions =
    serde_json::from_str(options_json).map_err(|e| crate::CliError::ConfigError(e.to_string()))?;

  let workspace_dir = config::resolve_workspace_dir(&options.workspace_dir);
  let workspace_dir_str = workspace_dir.to_string_lossy().into_owned();

  let aindex_dir_name = options
    .aindex
    .as_ref()
    .and_then(|a| a.dir.clone())
    .unwrap_or_else(|| "aindex".to_string());
  let aindex_dir = Path::new(&workspace_dir_str).join(aindex_dir_name);
  let aindex_name = aindex_dir
    .file_name()
    .and_then(|s| s.to_str())
    .unwrap_or("aindex")
    .to_string();

  let series_configs = get_series_configs(&options.aindex);

  detect_project_name_conflicts(&aindex_dir, &series_configs)
    .map_err(crate::CliError::ConfigError)?;

  let mut projects: Vec<Project> = Vec::new();
  let mut diagnostics: Vec<crate::core::plugin_shared::Diagnostic> = Vec::new();

  for series in &series_configs {
    let dist_dir = aindex_dir.join(&series.dist);
    if !dist_dir.is_dir() {
      continue;
    }

    let mut entries: Vec<String> = match std::fs::read_dir(&dist_dir) {
      Ok(e) => e
        .flatten()
        .filter(|entry| entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect(),
      Err(_) => continue,
    };

    entries.sort();

    for project_name in entries {
      let is_prompt_source_project = project_name == aindex_name;
      let config_path = aindex_dir
        .join(&series.src)
        .join(&project_name)
        .join("project.json5");
      let project_config = match load_project_config(&project_name, &config_path) {
        Ok(c) => c,
        Err(e) => {
          if e.starts_with("AINDEX_PROJECT_JSON5_INVALID:") {
            diagnostics.push(crate::core::plugin_shared::Diagnostic {
              level: "warn".to_string(),
              code: "AINDEX_PROJECT_JSON5_INVALID".to_string(),
              title: format!("Failed to parse project.json5 for {}", project_name),
              exact_fix: Some(vec![
                "Fix the JSON5 syntax in project.json5 and rerun tnmsc.".to_string(),
              ]),
            });
          }
          None
        }
      };

      projects.push(Project {
        name: Some(project_name.clone()),
        prompt_series: Some(series.name.to_string()),
        dir_from_workspace_path: Some(RelativePath::new(&project_name, &workspace_dir_str)),
        is_prompt_source_project: if is_prompt_source_project {
          Some(true)
        } else {
          None
        },
        project_config,
        ..Default::default()
      });
    }
  }

  // Fallback: scan workspace directory if no aindex projects found
  if projects.is_empty() && workspace_dir.is_dir() {
    let entries = match std::fs::read_dir(&workspace_dir) {
      Ok(e) => e
        .flatten()
        .filter(|entry| entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| !name.starts_with('.'))
        .collect::<Vec<_>>(),
      Err(_) => vec![],
    };

    let mut sorted: Vec<String> = entries;
    sorted.sort();

    for project_name in sorted {
      let is_prompt_source_project = project_name == aindex_name;
      let project_config =
        load_fallback_project_config(&project_name, &aindex_dir, &series_configs);

      projects.push(Project {
        name: Some(project_name.clone()),
        dir_from_workspace_path: Some(RelativePath::new(&project_name, &workspace_dir_str)),
        is_prompt_source_project: if is_prompt_source_project {
          Some(true)
        } else {
          None
        },
        project_config,
        ..Default::default()
      });
    }
  }

  let workspace = Workspace {
    directory: RootPath::new(&workspace_dir_str),
    projects,
  };

  #[derive(Debug, Clone, serde::Serialize)]
  #[serde(rename_all = "camelCase")]
  struct AindexResult {
    workspace: Workspace,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    diagnostics: Vec<crate::core::plugin_shared::Diagnostic>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    debug_logs: Vec<crate::core::plugin_shared::DebugLog>,
  }

  let result = AindexResult {
    workspace,
    diagnostics,
    debug_logs: vec![],
  };
  serde_json::to_string(&result).map_err(crate::CliError::SerializationError)
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;
  use std::path::PathBuf;
  use tempfile::TempDir;

  fn create_aindex_project(temp_workspace: &Path, project_name: &str, series: &str) {
    let dist = temp_workspace
      .join("aindex")
      .join("dist")
      .join(series)
      .join(project_name);
    let src = temp_workspace
      .join("aindex")
      .join(series)
      .join(project_name);
    fs::create_dir_all(&dist).unwrap();
    fs::create_dir_all(&src).unwrap();
  }

  #[test]
  fn collect_aindex_loads_project_json5() {
    let tmp = TempDir::new().unwrap();
    let src = tmp.path().join("aindex").join("app").join("project-a");
    fs::create_dir_all(&src).unwrap();
    let dist = tmp
      .path()
      .join("aindex")
      .join("dist")
      .join("app")
      .join("project-a");
    fs::create_dir_all(&dist).unwrap();
    fs::write(
      src.join("project.json5"),
      "{\n  // comment\n  includeSeries: ['alpha'],\n  subSeries: { skills: ['ship-*'] }\n}\n",
    )
    .unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_aindex(&options.to_string()).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
    let project = &parsed["workspace"]["projects"][0];
    assert_eq!(project["name"], "project-a");
    assert_eq!(
      project["projectConfig"]["includeSeries"],
      serde_json::json!(["alpha"])
    );
  }

  #[test]
  fn collect_aindex_ignores_project_jsonc() {
    let tmp = TempDir::new().unwrap();
    let src = tmp.path().join("aindex").join("app").join("project-b");
    fs::create_dir_all(&src).unwrap();
    let dist = tmp
      .path()
      .join("aindex")
      .join("dist")
      .join("app")
      .join("project-b");
    fs::create_dir_all(&dist).unwrap();
    fs::write(
      src.join("project.jsonc"),
      "{\"includeSeries\":[\"legacy\"]}\n",
    )
    .unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_aindex(&options.to_string()).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
    let project = &parsed["workspace"]["projects"][0];
    assert_eq!(project["name"], "project-b");
    assert!(project["projectConfig"].is_null());
  }

  #[test]
  fn collect_aindex_emits_error_for_invalid_json5() {
    let tmp = TempDir::new().unwrap();
    let src = tmp.path().join("aindex").join("app").join("project-c");
    fs::create_dir_all(&src).unwrap();
    let dist = tmp
      .path()
      .join("aindex")
      .join("dist")
      .join("app")
      .join("project-c");
    fs::create_dir_all(&dist).unwrap();
    fs::write(
      src.join("project.json5"),
      "{includeSeries: ['broken',]} trailing",
    )
    .unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_aindex(&options.to_string()).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
    let project = &parsed["workspace"]["projects"][0];
    assert_eq!(project["name"], "project-c");
    assert!(project["projectConfig"].is_null());
    let diagnostics = parsed["diagnostics"].as_array().unwrap();
    assert!(
      diagnostics
        .iter()
        .any(|d| d["code"] == "AINDEX_PROJECT_JSON5_INVALID")
    );
  }

  #[test]
  fn collect_aindex_collects_all_series() {
    let tmp = TempDir::new().unwrap();
    create_aindex_project(tmp.path(), "project-a", "app");
    create_aindex_project(tmp.path(), "plugin-a", "ext");
    create_aindex_project(tmp.path(), "system-a", "arch");
    create_aindex_project(tmp.path(), "tool-a", "softwares");

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_aindex(&options.to_string()).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
    let projects = parsed["workspace"]["projects"].as_array().unwrap();
    let ids: Vec<String> = projects
      .iter()
      .map(|p| {
        format!(
          "{}:{}",
          p["promptSeries"].as_str().unwrap(),
          p["name"].as_str().unwrap()
        )
      })
      .collect();
    assert_eq!(
      ids,
      vec![
        "app:project-a",
        "ext:plugin-a",
        "arch:system-a",
        "softwares:tool-a"
      ]
    );
  }

  #[test]
  fn collect_aindex_detects_conflict() {
    let tmp = TempDir::new().unwrap();
    create_aindex_project(tmp.path(), "project-a", "app");
    create_aindex_project(tmp.path(), "project-a", "softwares");

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_aindex(&options.to_string());
    assert!(result.is_err());
    assert!(
      result
        .unwrap_err()
        .to_string()
        .contains("Aindex project series name conflict")
    );
  }

  #[test]
  fn collect_aindex_expands_tilde_workspace_dir() {
    let home_dir = crate::core::config::resolve_tilde("~");
    if home_dir == PathBuf::from("~") {
      return;
    }
    let tmp = tempfile::Builder::new()
      .prefix("tnmsc-aindex-tilde-")
      .tempdir_in(&home_dir)
      .unwrap();
    create_aindex_project(tmp.path(), "project-a", "app");
    let relative_workspace = tmp
      .path()
      .strip_prefix(&home_dir)
      .unwrap_or(tmp.path())
      .to_string_lossy()
      .replace('\\', "/");
    let tilde_workspace = format!(
      "~{}{}",
      std::path::MAIN_SEPARATOR,
      relative_workspace.trim_start_matches(['/', '\\'])
    )
    .replace('\\', "/");

    let options = serde_json::json!({
      "workspaceDir": tilde_workspace,
    });

    let result = collect_aindex(&options.to_string()).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
    let workspace_dir = parsed["workspace"]["directory"]["path"]
      .as_str()
      .map(PathBuf::from)
      .unwrap();

    assert_eq!(workspace_dir, tmp.path().canonicalize().unwrap());
  }
}
