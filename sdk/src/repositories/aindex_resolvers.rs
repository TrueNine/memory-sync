use std::collections::HashSet;
use std::path::Path;

use serde::Deserialize;
use serde_json::Value;

use crate::domain::config;
use crate::domain::plugin_shared::Diagnostic;
use crate::domain::plugin_shared::{Project, RelativePath, RootPath, Workspace};
use crate::infra::deno_runtime::DenoRuntime;

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AindexInputOptions {
  workspace_dir: String,
}

struct SeriesConfig {
  name: &'static str,
}

fn get_series_configs() -> Vec<SeriesConfig> {
  config::DEFAULT_PROJECT_SERIES
    .iter()
    .map(|&name| SeriesConfig { name })
    .collect()
}

fn detect_project_name_conflicts(
  aindex_dir: &Path,
  series_configs: &[SeriesConfig],
) -> Result<(), String> {
  let series_names: Vec<&str> = series_configs.iter().map(|s| s.name).collect();
  crate::repositories::series_conflict::detect_project_name_conflicts(
    aindex_dir,
    &series_names,
    "Aindex project series name conflict",
  )
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

fn push_project_config_diagnostic(diagnostics: &mut Vec<Diagnostic>, code: &str, title: String) {
  diagnostics.push(Diagnostic {
    level: "warn".to_string(),
    code: code.to_string(),
    title,
    exact_fix: Some(vec![
      "Fix the project config script or JSON5 file and rerun tnmsc.".to_string(),
    ]),
  });
}

fn load_project_runtime_config(
  runtime: &DenoRuntime,
  workspace_dir: &Path,
  aindex_dir: &Path,
  project_name: &str,
  series_name: &str,
) -> Result<Option<Value>, String> {
  let config_path = aindex_dir
    .join(series_name)
    .join(project_name)
    .join("project.config.ts");
  if !config_path.is_file() {
    return Ok(None);
  }

  runtime
    .load_project_config(aindex_dir, project_name, series_name, workspace_dir)
    .map(Some)
    .map_err(|error| {
      format!(
        "AINDEX_PROJECT_CONFIG_TS_INVALID: Failed to load project.config.ts for {project_name}: {error}"
      )
    })
}

fn resolve_project_config(
  runtime: Option<&DenoRuntime>,
  workspace_dir: &Path,
  aindex_dir: &Path,
  project_name: &str,
  series_name: &str,
  diagnostics: &mut Vec<Diagnostic>,
) -> Option<Value> {
  if let Some(runtime) = runtime {
    match load_project_runtime_config(
      runtime,
      workspace_dir,
      aindex_dir,
      project_name,
      series_name,
    ) {
      Ok(Some(config)) => {
        return Some(config);
      }
      Ok(None) => {}
      Err(error) => {
        if error.starts_with("AINDEX_PROJECT_CONFIG_TS_INVALID:") {
          push_project_config_diagnostic(
            diagnostics,
            "AINDEX_PROJECT_CONFIG_TS_INVALID",
            format!("Failed to parse project.config.ts for {project_name}"),
          );
          return None;
        }
      }
    }
  }

  let config_path = aindex_dir
    .join(series_name)
    .join(project_name)
    .join("project.json5");
  match load_project_config(project_name, &config_path) {
    Ok(config) => config,
    Err(error) => {
      if error.starts_with("AINDEX_PROJECT_JSON5_INVALID:") {
        push_project_config_diagnostic(
          diagnostics,
          "AINDEX_PROJECT_JSON5_INVALID",
          format!("Failed to parse project.json5 for {project_name}"),
        );
      }
      None
    }
  }
}

fn load_fallback_project_config(
  project_name: &str,
  runtime: Option<&DenoRuntime>,
  workspace_dir: &Path,
  aindex_dir: &Path,
  series_configs: &[SeriesConfig],
  diagnostics: &mut Vec<Diagnostic>,
) -> Option<Value> {
  for series in series_configs {
    if let Some(config) = resolve_project_config(
      runtime,
      workspace_dir,
      aindex_dir,
      project_name,
      series.name,
      diagnostics,
    ) {
      return Some(config);
    }
  }
  None
}

pub fn collect_aindex_resolvers(options_json: &str) -> Result<String, crate::CliError> {
  let options: AindexInputOptions =
    serde_json::from_str(options_json).map_err(|e| crate::CliError::ConfigError(e.to_string()))?;

  let workspace_dir = config::resolve_workspace_dir(&options.workspace_dir);
  let workspace_dir_str = workspace_dir.to_string_lossy().into_owned();
  let aindex_dir = config::resolve_workspace_aindex_dir(&workspace_dir_str);
  let aindex_name = aindex_dir
    .file_name()
    .and_then(|s| s.to_str())
    .unwrap_or(config::DEFAULT_AINDEX_DIR_NAME)
    .to_string();
  let series_configs = get_series_configs();
  let runtime = DenoRuntime::new().ok();

  detect_project_name_conflicts(&aindex_dir, &series_configs)
    .map_err(crate::CliError::ConfigError)?;

  let mut projects: Vec<Project> = Vec::new();
  let mut diagnostics: Vec<Diagnostic> = Vec::new();

  for series in &series_configs {
    let series_dir = aindex_dir.join(series.name);
    if !series_dir.is_dir() {
      continue;
    }

    let mut entries: Vec<String> = match std::fs::read_dir(&series_dir) {
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
      let project_config = resolve_project_config(
        runtime.as_ref(),
        &workspace_dir,
        &aindex_dir,
        &project_name,
        series.name,
        &mut diagnostics,
      );

      projects.push(Project {
        name: Some(project_name.clone()),
        project_type: Some(series.name.to_string()),
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
      let project_config = load_fallback_project_config(
        &project_name,
        runtime.as_ref(),
        &workspace_dir,
        &aindex_dir,
        &series_configs,
        &mut diagnostics,
      );

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

  // Implements #359: filter projects whose target dir is not git-managed
  let series_with_projects: HashSet<&str> = projects
    .iter()
    .filter_map(|p| p.project_type.as_deref())
    .collect();
  for series in &series_configs {
    let series_dir = aindex_dir.join(series.name);
    if !series_dir.is_dir() && !series_with_projects.contains(series.name) {
      diagnostics.push(Diagnostic {
        level: "warn".to_string(),
        code: "SERIES_DIR_MISSING".to_string(),
        title: format!(
          "Aindex section '{}' does not exist under the aindex directory and was not synchronized.",
          series.name
        ),
        exact_fix: Some(vec![format!(
          "Create the directory: mkdir -p {}",
          series_dir.display()
        )]),
      });
    }
  }

  // Implements #359: skip projects whose target dir is not git-managed
  let mut filtered_projects: Vec<Project> = Vec::with_capacity(projects.len());
  for project in projects {
    let should_skip = match project.dir_from_workspace_path.as_ref() {
      Some(rp) => {
        let abs_path_str = rp.get_absolute_path();
        let abs_path = Path::new(&abs_path_str);
        if !abs_path.exists() {
          // Target dir doesn't exist — skip per issue #359 policy
          diagnostics.push(Diagnostic {
            level: "warn".to_string(),
            code: "PROJECT_DIR_NOT_FOUND".to_string(),
            title: format!(
              "Target project directory for '{}' does not exist; synchronization skipped.",
              project.name.as_deref().unwrap_or("unknown")
            ),
            exact_fix: Some(vec![format!(
              "Create the directory and initialize a git repo:\n  mkdir -p {}\n  cd {} && git init",
              abs_path.display(),
              abs_path.display()
            )]),
          });
          true
        } else if git2::Repository::open(abs_path).is_err() {
          // Target dir exists but is not git-managed
          diagnostics.push(Diagnostic {
            level: "warn".to_string(),
            code: "PROJECT_DIR_NOT_GIT_MANAGED".to_string(),
            title: format!(
              "Target project directory '{}' is not a git-managed directory; synchronization skipped.",
              abs_path.display()
            ),
            exact_fix: Some(vec![format!(
              "Initialize a git repository:\n  cd {} && git init",
              abs_path.display()
            )]),
          });
          true
        } else {
          false
        }
      }
      None => {
        // Project with no dir_from_workspace_path (e.g. workspace root) — always include
        false
      }
    };

    if !should_skip {
      filtered_projects.push(project);
    }
  }

  let workspace = Workspace {
    directory: RootPath::new(&workspace_dir_str),
    projects: filtered_projects,
  };

  #[derive(Debug, Clone, serde::Serialize)]
  #[serde(rename_all = "camelCase")]
  struct AindexResult {
    workspace: Workspace,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    diagnostics: Vec<crate::domain::plugin_shared::Diagnostic>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    debug_logs: Vec<crate::domain::plugin_shared::DebugLog>,
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
    let src = temp_workspace
      .join("aindex")
      .join(series)
      .join(project_name);
    fs::create_dir_all(&src).unwrap();
  }

  /// Creates a target project directory under `temp_workspace` and initializes
  /// a git repository in it, so the git-managed check in `collect_aindex_resolvers`
  /// (Implements #359) passes.
  fn create_target_git_project(temp_workspace: &Path, project_name: &str) {
    let target = temp_workspace.join(project_name);
    fs::create_dir_all(&target).unwrap();
    git2::Repository::init(&target).unwrap();
  }

  #[test]
  fn collect_aindex_loads_project_json5() {
    let tmp = TempDir::new().unwrap();
    let src = tmp.path().join("aindex").join("app").join("project-a");
    fs::create_dir_all(&src).unwrap();
    fs::write(
      src.join("project.json5"),
      "{\n  // comment\n  includeSeries: ['alpha'],\n  subSeries: { skills: ['ship-*'] }\n}\n",
    )
    .unwrap();
    create_target_git_project(tmp.path(), "project-a");

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_aindex_resolvers(&options.to_string()).unwrap();
    let parsed: Value = serde_json::from_str(&result).unwrap();
    let project = &parsed["workspace"]["projects"][0];
    assert_eq!(project["name"], "project-a");
    assert_eq!(
      project["projectConfig"]["includeSeries"],
      serde_json::json!(["alpha"])
    );
  }

  #[test]
  fn collect_aindex_prefers_project_config_ts_over_project_json5() {
    let tmp = TempDir::new().unwrap();
    let src = tmp.path().join("aindex").join("app").join("project-a");
    fs::create_dir_all(&src).unwrap();
    fs::write(
      src.join("project.config.ts"),
      r#"
const ctx = globalThis.__tnmsContext ?? {};
console.log(JSON.stringify({
  source: 'ts',
  projectName: ctx.projectName,
  seriesName: ctx.seriesName
}));
"#,
    )
    .unwrap();
    create_target_git_project(tmp.path(), "project-a");

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_aindex_resolvers(&options.to_string()).unwrap();
    let parsed: Value = serde_json::from_str(&result).unwrap();
    let project = &parsed["workspace"]["projects"][0];
    assert_eq!(project["projectConfig"]["source"], "ts");
    assert_eq!(project["projectConfig"]["projectName"], "project-a");
  }

  #[test]
  fn collect_aindex_ignores_project_jsonc() {
    let tmp = TempDir::new().unwrap();
    let src = tmp.path().join("aindex").join("app").join("project-b");
    fs::create_dir_all(&src).unwrap();
    fs::write(
      src.join("project.jsonc"),
      "{\"includeSeries\":[\"legacy\"]}\n",
    )
    .unwrap();
    create_target_git_project(tmp.path(), "project-b");

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_aindex_resolvers(&options.to_string()).unwrap();
    let parsed: Value = serde_json::from_str(&result).unwrap();
    let project = &parsed["workspace"]["projects"][0];
    assert_eq!(project["name"], "project-b");
    assert!(project["projectConfig"].is_null());
  }

  #[test]
  fn collect_aindex_emits_error_for_invalid_json5() {
    let tmp = TempDir::new().unwrap();
    let src = tmp.path().join("aindex").join("app").join("project-c");
    fs::create_dir_all(&src).unwrap();
    fs::write(
      src.join("project.json5"),
      "{includeSeries: ['broken',]} trailing",
    )
    .unwrap();

    create_target_git_project(tmp.path(), "project-c");

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_aindex_resolvers(&options.to_string()).unwrap();
    let parsed: Value = serde_json::from_str(&result).unwrap();
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
  fn collect_aindex_emits_error_for_invalid_project_config_ts() {
    let tmp = TempDir::new().unwrap();
    let src = tmp.path().join("aindex").join("app").join("project-ts");
    fs::create_dir_all(&src).unwrap();
    fs::write(
      src.join("project.config.ts"),
      "console.log('{ invalid json');",
    )
    .unwrap();

    create_target_git_project(tmp.path(), "project-ts");

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_aindex_resolvers(&options.to_string()).unwrap();
    let parsed: Value = serde_json::from_str(&result).unwrap();
    let project = &parsed["workspace"]["projects"][0];
    assert_eq!(project["name"], "project-ts");
    assert!(project["projectConfig"].is_null());
    let diagnostics = parsed["diagnostics"].as_array().unwrap();
    assert!(
      diagnostics
        .iter()
        .any(|d| d["code"] == "AINDEX_PROJECT_CONFIG_TS_INVALID")
    );
  }

  #[test]
  fn collect_aindex_collects_all_series() {
    let tmp = TempDir::new().unwrap();
    create_aindex_project(tmp.path(), "project-a", "app");
    create_aindex_project(tmp.path(), "plugin-a", "ext");
    create_aindex_project(tmp.path(), "system-a", "arch");
    create_aindex_project(tmp.path(), "tool-a", "softwares");
    create_target_git_project(tmp.path(), "project-a");
    create_target_git_project(tmp.path(), "plugin-a");
    create_target_git_project(tmp.path(), "system-a");
    create_target_git_project(tmp.path(), "tool-a");

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_aindex_resolvers(&options.to_string()).unwrap();
    let parsed: Value = serde_json::from_str(&result).unwrap();
    let projects = parsed["workspace"]["projects"].as_array().unwrap();
    let ids: Vec<String> = projects
      .iter()
      .map(|p| {
        format!(
          "{}:{}",
          p["projectType"].as_str().unwrap(),
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

    let result = collect_aindex_resolvers(&options.to_string());
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
    let _guard = crate::domain::TEST_ENV_LOCK
      .lock()
      .unwrap_or_else(|poisoned| poisoned.into_inner());
    let home_dir = config::resolve_tilde("~");
    if home_dir == Path::new("~") {
      return;
    }
    if !home_dir.exists() {
      let _ = fs::create_dir_all(&home_dir);
    }
    let tmp = tempfile::Builder::new()
      .prefix("tnmsd-aindex-tilde-")
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

    let result = collect_aindex_resolvers(&options.to_string()).unwrap();
    let parsed: Value = serde_json::from_str(&result).unwrap();
    let workspace_dir = parsed["workspace"]["directory"]["path"]
      .as_str()
      .map(PathBuf::from)
      .unwrap();

    assert_eq!(workspace_dir, tmp.path().canonicalize().unwrap());
  }

  // Implements #359: git-managed filter tests
  #[test]
  fn collect_aindex_skips_project_without_target_dir() {
    let tmp = TempDir::new().unwrap();
    create_aindex_project(tmp.path(), "orphan-project", "app");

    // No target git project dir created — project should be filtered out
    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_aindex_resolvers(&options.to_string()).unwrap();
    let parsed: Value = serde_json::from_str(&result).unwrap();
    let projects = parsed["workspace"]["projects"].as_array().unwrap();
    assert!(
      projects.is_empty(),
      "orphan project without target dir should be filtered out"
    );

    let diagnostics = parsed["diagnostics"].as_array().unwrap();
    assert!(
      diagnostics
        .iter()
        .any(|d| d["code"] == "PROJECT_DIR_NOT_FOUND"),
      "should emit PROJECT_DIR_NOT_FOUND diagnostic"
    );
  }

  #[test]
  fn collect_aindex_skips_non_git_project() {
    let tmp = TempDir::new().unwrap();
    create_aindex_project(tmp.path(), "plain-dir", "app");

    // Create target dir but WITHOUT git repo
    let target = tmp.path().join("plain-dir");
    fs::create_dir_all(&target).unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_aindex_resolvers(&options.to_string()).unwrap();
    let parsed: Value = serde_json::from_str(&result).unwrap();
    let projects = parsed["workspace"]["projects"].as_array().unwrap();
    assert!(
      projects.is_empty(),
      "non-git target dir should be filtered out"
    );

    let diagnostics = parsed["diagnostics"].as_array().unwrap();
    assert!(
      diagnostics
        .iter()
        .any(|d| d["code"] == "PROJECT_DIR_NOT_GIT_MANAGED"),
      "should emit PROJECT_DIR_NOT_GIT_MANAGED diagnostic"
    );
  }

  #[test]
  fn collect_aindex_keeps_git_project() {
    let tmp = TempDir::new().unwrap();
    create_aindex_project(tmp.path(), "legit-project", "app");
    create_target_git_project(tmp.path(), "legit-project");

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_aindex_resolvers(&options.to_string()).unwrap();
    let parsed: Value = serde_json::from_str(&result).unwrap();
    let projects = parsed["workspace"]["projects"].as_array().unwrap();
    assert_eq!(projects.len(), 1, "git-managed project should be kept");
    assert_eq!(projects[0]["name"], "legit-project");
  }

  #[test]
  fn collect_aindex_emits_series_missing_diagnostics() {
    let tmp = TempDir::new().unwrap();
    // Only create app series; ext, arch, softwares are missing
    create_aindex_project(tmp.path(), "my-app", "app");
    create_target_git_project(tmp.path(), "my-app");

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_aindex_resolvers(&options.to_string()).unwrap();
    let parsed: Value = serde_json::from_str(&result).unwrap();

    let diagnostics = parsed["diagnostics"].as_array().unwrap();
    let series_codes: Vec<&str> = diagnostics
      .iter()
      .filter(|d| d["code"] == "SERIES_DIR_MISSING")
      .map(|d| d["title"].as_str().unwrap_or(""))
      .collect();
    assert!(
      series_codes.iter().any(|t| t.contains("ext")),
      "should warn for missing ext series"
    );
    assert!(
      series_codes.iter().any(|t| t.contains("arch")),
      "should warn for missing arch series"
    );
    assert!(
      series_codes.iter().any(|t| t.contains("softwares")),
      "should warn for missing softwares series"
    );
    // app has a project so its dir exists — no warning for app
    assert!(
      !series_codes.iter().any(|t| t.contains("app")),
      "should NOT warn for app which has projects"
    );
  }
}
