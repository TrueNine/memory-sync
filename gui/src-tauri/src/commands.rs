/// Tauri commands that bridge the frontend to the `tnmsc` CLI.
///
/// Instead of using Tauri's sidecar mechanism, we invoke `tnmsc` directly
/// from the system PATH via `std::process::Command`. This avoids the need
/// to bundle a native binary and works consistently in dev and production.
///
/// The CLI outputs Winston JSON5 log lines to stdout. Each line has the shape:
/// ```json5
/// {$:["HH:MM:SS.mmm","LEVEL","loggerName"],_:{...payload...}}
/// ```
/// We parse these lines with the `json5` crate and extract structured data.

use std::path::{Path, PathBuf};
use std::process::Command as StdCommand;
use std::{env, fs};

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

/// Result of a CLI availability check.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliStatus {
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Aggregated result of a pipeline execution or clean operation.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PipelineResult {
    pub success: bool,
    #[serde(default)]
    pub total_files: i32,
    #[serde(default)]
    pub total_dirs: i32,
    #[serde(default)]
    pub dry_run: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(default)]
    pub plugin_results: Vec<PluginExecutionResult>,
    #[serde(default)]
    pub logs: Vec<LogEntry>,
    #[serde(default)]
    pub errors: Vec<String>,
}

/// Per-plugin execution result extracted from log lines.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginExecutionResult {
    pub plugin: String,
    #[serde(default)]
    pub files: i32,
    #[serde(default)]
    pub dirs: i32,
    #[serde(default)]
    pub dry_run: bool,
}

/// A single parsed log entry from the CLI.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub logger: String,
    pub payload: serde_json::Value,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Strip ANSI escape sequences from a string.
fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            for inner in chars.by_ref() {
                if inner.is_ascii_alphabetic() {
                    break;
                }
            }
        } else {
            out.push(c);
        }
    }
    out
}

/// Parse a single Winston JSON5 log line into a [`LogEntry`].
fn parse_log_line(line: &str) -> Option<LogEntry> {
    let val: serde_json::Value = json5::from_str(line).ok()?;
    let obj = val.as_object()?;
    let meta = obj.get("$")?.as_array()?;
    let timestamp = meta.first()?.as_str()?.to_string();
    let level = meta.get(1)?.as_str()?.to_string();
    let logger = meta.get(2)?.as_str()?.to_string();
    let payload = obj.get("_").cloned().unwrap_or(serde_json::Value::Null);
    Some(LogEntry { timestamp, level, logger, payload })
}

/// Parse all log lines from raw CLI stdout.
fn parse_all_logs(raw: &str) -> Vec<LogEntry> {
    let cleaned = strip_ansi(raw);
    cleaned.lines().filter_map(|line| parse_log_line(line.trim())).collect()
}

fn cli_binary_name() -> String {
    if cfg!(target_os = "windows") {
        "tnmsc.exe".to_string()
    } else {
        "tnmsc".to_string()
    }
}

fn is_executable(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = path.metadata() {
            let mode = metadata.permissions().mode();
            return mode & 0o111 != 0;
        }
        false
    }
    #[cfg(not(unix))]
    {
        true
    }
}

fn resolve_cli_path() -> Option<PathBuf> {
    let bin_name = cli_binary_name();
    if let Some(paths) = env::var_os("PATH") {
        for dir in env::split_paths(&paths) {
            let candidate = dir.join(&bin_name);
            if is_executable(&candidate) {
                return Some(candidate);
            }
        }
    }

    let mut fallback_dirs: Vec<PathBuf> = Vec::new();
    if let Some(home) = dirs::home_dir() {
        fallback_dirs.push(home.join(".local/share/pnpm"));
        fallback_dirs.push(home.join(".npm-global/bin"));
        fallback_dirs.push(home.join(".npm/bin"));
        fallback_dirs.push(home.join(".local/bin"));

        let nvm_dir = home.join(".nvm/versions/node");
        if let Ok(entries) = fs::read_dir(&nvm_dir) {
            for entry in entries.flatten() {
                fallback_dirs.push(entry.path().join("bin"));
            }
        }
    }

    for dir in fallback_dirs {
        let candidate = dir.join(&bin_name);
        if is_executable(&candidate) {
            return Some(candidate);
        }
    }
    None
}

/// Extract plugin results from log entries.
fn extract_plugin_results(logs: &[LogEntry]) -> Vec<PluginExecutionResult> {
    logs.iter()
        .filter_map(|entry| {
            let obj = entry.payload.as_object()?;
            let pr = obj.get("plugin result")?.as_object()?;
            Some(PluginExecutionResult {
                plugin: pr.get("plugin")?.as_str()?.to_string(),
                files: pr.get("files").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
                dirs: pr.get("dirs").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
                dry_run: pr.get("dryRun").and_then(|v| v.as_bool()).unwrap_or(false),
            })
        })
        .collect()
}

/// Extract the final "complete" summary from log entries.
fn extract_complete(logs: &[LogEntry]) -> Option<serde_json::Value> {
    logs.iter().rev().find_map(|entry| {
        let obj = entry.payload.as_object()?;
        obj.get("complete").cloned()
    })
}

/// Run `tnmsc` from system PATH with the given arguments and return stdout.
fn run_cli(args: &[&str], cwd: &str) -> Result<String, String> {
    let cli_path = resolve_cli_path().ok_or("tnmsc not found in PATH or common locations")?;
    let output = StdCommand::new(cli_path)
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to execute tnmsc: {e}"))?;

    if output.status.code() != Some(0) {
        let stderr = String::from_utf8(output.stderr)
            .unwrap_or_else(|_| "<non-UTF-8 stderr>".into());
        let code = output.status.code()
            .map(|c| c.to_string())
            .unwrap_or_else(|| "unknown".into());
        return Err(format!("tnmsc exited with code {code}: {stderr}"));
    }

    String::from_utf8(output.stdout)
        .map_err(|e| format!("tnmsc stdout is not valid UTF-8: {e}"))
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Check whether `tnmsc` is available on the system PATH.
#[tauri::command]
pub fn check_cli() -> CliStatus {
    let cli_path = match resolve_cli_path() {
        Some(path) => path,
        None => {
            return CliStatus {
                available: false,
                version: None,
                error: Some("tnmsc not found in PATH or common locations".into()),
            };
        }
    };

    match StdCommand::new(cli_path).arg("version").output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let all = format!("{stdout}{stderr}");
            let cleaned = strip_ansi(&all);
            // Extract version string like "tnmsc v2026.10210.10233"
            let version = cleaned.lines()
                .find_map(|line| {
                    let trimmed = line.trim();
                    if trimmed.starts_with("tnmsc v") || trimmed.contains("tnmsc v") {
                        Some(trimmed.trim_start_matches("tnmsc ").to_string())
                    } else {
                        // Try parsing as JSON5 log line
                        parse_log_line(trimmed).and_then(|entry| {
                            entry.payload.as_str()
                                .filter(|s| s.starts_with("tnmsc v"))
                                .map(|s| s.trim_start_matches("tnmsc ").to_string())
                        })
                    }
                });
            CliStatus { available: true, version, error: None }
        }
        Err(e) => CliStatus {
            available: false,
            version: None,
            error: Some(e.to_string()),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;
    use std::time::{SystemTime, UNIX_EPOCH};

    /// Serialize tests that mutate PATH/HOME so they don't run in parallel and overwrite each other.
    static ENV_TEST_LOCK: Mutex<()> = Mutex::new(());

    fn temp_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let dir = env::temp_dir().join(format!("tnmsc-test-{name}-{nanos}"));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    fn write_executable(path: &Path) {
        fs::write(path, "#!/bin/sh\necho tnmsc vTEST\n").expect("write fake cli");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(path).expect("metadata").permissions();
            perms.set_mode(0o755);
            fs::set_permissions(path, perms).expect("set perms");
        }
    }

    #[test]
    fn resolve_cli_path_from_path_env() {
        let _guard = ENV_TEST_LOCK.lock().expect("env test lock");
        let bin_name = cli_binary_name();
        let dir = temp_dir("path");
        let bin = dir.join(&bin_name);
        write_executable(&bin);

        let old_path = env::var_os("PATH");
        let old_home = env::var_os("HOME");
        env::set_var("PATH", &dir);
        // Isolate from fallback test: use same dir as HOME so fallback dirs
        // (e.g. $HOME/.local/share/pnpm) do not exist and PATH is the only match.
        env::set_var("HOME", &dir);

        let resolved = resolve_cli_path();

        if let Some(old) = old_path {
            env::set_var("PATH", old);
        } else {
            env::remove_var("PATH");
        }
        if let Some(old) = old_home {
            env::set_var("HOME", old);
        } else {
            env::remove_var("HOME");
        }

        assert_eq!(resolved, Some(bin));
    }

    #[test]
    fn resolve_cli_path_from_fallback_dirs() {
        let _guard = ENV_TEST_LOCK.lock().expect("env test lock");
        let bin_name = cli_binary_name();
        let home = temp_dir("home");
        let bin_dir = home.join(".local/share/pnpm");
        fs::create_dir_all(&bin_dir).expect("create fallback dir");
        let bin = bin_dir.join(&bin_name);
        write_executable(&bin);

        let old_path = env::var_os("PATH");
        let old_home = env::var_os("HOME");
        env::set_var("PATH", "");
        env::set_var("HOME", &home);

        let resolved = resolve_cli_path();

        if let Some(old) = old_path {
            env::set_var("PATH", old);
        } else {
            env::remove_var("PATH");
        }
        if let Some(old) = old_home {
            env::set_var("HOME", old);
        } else {
            env::remove_var("HOME");
        }

        assert_eq!(resolved, Some(bin));
    }
}

/// Execute the sync pipeline (default command) or dry-run.
#[tauri::command]
pub fn execute_pipeline(cwd: String, dry_run: bool) -> Result<PipelineResult, String> {
    let args: Vec<&str> = if dry_run { vec!["dry-run"] } else { vec![] };
    let stdout = run_cli(&args, &cwd)?;
    let logs = parse_all_logs(&stdout);
    let plugin_results = extract_plugin_results(&logs);
    let complete = extract_complete(&logs);
    let (total_files, total_dirs, cmd) = match &complete {
        Some(c) => (
            c.get("totalFiles").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
            c.get("totalDirs").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
            c.get("command").and_then(|v| v.as_str()).map(String::from),
        ),
        None => (0, 0, None),
    };
    let errors: Vec<String> = logs.iter()
        .filter(|e| e.level == "ERROR")
        .map(|e| format!("[{}] {}", e.logger, e.payload))
        .collect();
    Ok(PipelineResult {
        success: errors.is_empty(), total_files, total_dirs,
        dry_run, command: cmd, plugin_results, logs, errors,
    })
}

/// Load the merged configuration by reading log output.
#[tauri::command]
pub fn load_config(cwd: String) -> Result<serde_json::Value, String> {
    let stdout = run_cli(&["dry-run"], &cwd)?;
    let logs = parse_all_logs(&stdout);
    let config_entries: Vec<serde_json::Value> = logs.iter()
        .filter(|e| e.logger == "defineConfig")
        .map(|e| serde_json::json!({
            "timestamp": e.timestamp, "level": e.level, "data": e.payload,
        }))
        .collect();
    Ok(serde_json::json!({ "configEntries": config_entries, "cwd": cwd }))
}

/// List all registered plugins by parsing dry-run output.
#[tauri::command]
pub fn list_plugins(cwd: String) -> Result<Vec<PluginExecutionResult>, String> {
    let stdout = run_cli(&["dry-run"], &cwd)?;
    let logs = parse_all_logs(&stdout);
    Ok(extract_plugin_results(&logs))
}

/// Clean previously generated output files.
#[tauri::command]
pub fn clean_outputs(cwd: String, dry_run: bool) -> Result<PipelineResult, String> {
    let args: Vec<&str> = if dry_run {
        vec!["clean", "--dry-run"]
    } else {
        vec!["clean"]
    };
    let stdout = run_cli(&args, &cwd)?;
    let logs = parse_all_logs(&stdout);
    let plugin_results = extract_plugin_results(&logs);
    let complete = extract_complete(&logs);
    let (total_files, total_dirs, cmd) = match &complete {
        Some(c) => (
            c.get("totalFiles").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
            c.get("totalDirs").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
            c.get("command").and_then(|v| v.as_str()).map(String::from),
        ),
        None => (0, 0, None),
    };
    let errors: Vec<String> = logs.iter()
        .filter(|e| e.level == "ERROR")
        .map(|e| format!("[{}] {}", e.logger, e.payload))
        .collect();
    Ok(PipelineResult {
        success: errors.is_empty(), total_files, total_dirs,
        dry_run, command: cmd, plugin_results, logs, errors,
    })
}

/// Get raw log output from any CLI command.
#[tauri::command]
pub fn get_logs(cwd: String, command: String) -> Result<Vec<LogEntry>, String> {
    let args: Vec<&str> = command.split_whitespace().collect();
    let stdout = run_cli(&args, &cwd)?;
    Ok(parse_all_logs(&stdout))
}

/// Resolve the config file path for a given scope.
/// - "cwd" → `{cwd}/.tnmsc.json`
/// - "global" → `~/.aindex/.tnmsc.json`
fn resolve_config_path(scope: &str, cwd: &str) -> Result<std::path::PathBuf, String> {
    match scope {
        "cwd" => Ok(std::path::PathBuf::from(cwd).join(".tnmsc.json")),
        "global" => {
            let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
            Ok(home.join(".aindex").join(".tnmsc.json"))
        }
        _ => Err(format!("Unknown config scope: {scope}")),
    }
}

/// Read a config file's raw content. Returns empty string if file doesn't exist.
#[tauri::command]
pub fn read_config_file(scope: String, cwd: String) -> Result<String, String> {
    let path = resolve_config_path(&scope, &cwd)?;
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {e}", path.display()))
}

/// Write content to a config file. Creates parent directories if needed.
#[tauri::command]
pub fn write_config_file(scope: String, cwd: String, content: String) -> Result<(), String> {
    let path = resolve_config_path(&scope, &cwd)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory {}: {e}", parent.display()))?;
    }
    std::fs::write(&path, &content)
        .map_err(|e| format!("Failed to write {}: {e}", path.display()))
}


/// Open the global config directory in the system file manager.
#[tauri::command]
pub fn open_config_dir() -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let config_dir = home.join(".aindex");
    if !config_dir.exists() {
        std::fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create directory {}: {e}", config_dir.display()))?;
    }
    let path_str = config_dir.to_string_lossy().to_string();

    #[cfg(target_os = "linux")]
    let result = StdCommand::new("xdg-open").arg(&config_dir).spawn();
    #[cfg(target_os = "macos")]
    let result = StdCommand::new("open").arg(&config_dir).spawn();
    #[cfg(target_os = "windows")]
    let result = StdCommand::new("explorer").arg(&config_dir).spawn();

    result.map_err(|e| format!("Failed to open directory: {e}"))?;
    Ok(path_str)
}

// ---------------------------------------------------------------------------
// Aindex file viewer commands
// ---------------------------------------------------------------------------

/// A source file entry with its translated counterpart path.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AindexFileEntry {
    /// Relative path from aindex root, e.g. "app/TrueNine/agt.cn.mdx"
    pub source_path: String,
    /// Relative path of translated file (empty for resource files)
    pub translated_path: String,
    /// Whether the translated file exists on disk
    pub translated_exists: bool,
    /// "cnMdx" for .cn.mdx source+translated pairs, "resource" for other files
    pub file_type: String,
}

/// Resolve variable placeholders in config paths.
fn resolve_config_vars(value: &str, workspace: &str) -> String {
    let home = dirs::home_dir()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_default();
    value
        .replace("$WORKSPACE", workspace)
        .replace("~", &home)
}

/// Parsed global config with resolved paths.
struct ResolvedConfig {
    workspace: String,
    shadow_source_project: String,
    cfg: serde_json::Value,
}

/// Read and resolve the global config.
fn load_resolved_config() -> Result<ResolvedConfig, String> {
    let config_path = {
        let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
        home.join(".aindex").join(".tnmsc.json")
    };
    if !config_path.exists() {
        return Err("Global config not found.".into());
    }
    let raw = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {e}"))?;
    let cfg: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse config: {e}"))?;

    let workspace_raw = cfg.get("workspaceDir")
        .and_then(|v| v.as_str())
        .unwrap_or(".");
    let home = dirs::home_dir()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_default();
    let workspace = workspace_raw.replace('~', &home);

    let shadow_name = cfg
        .get("shadowSourceProject")
        .and_then(|v| v.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("tnmsc-shadow");
    let shadow_source_project = format!("{workspace}/{shadow_name}");

    Ok(ResolvedConfig { workspace, shadow_source_project, cfg })
}

/// Resolve a config value, replacing $WORKSPACE and ~.
fn resolve_full(value: &str, workspace: &str, _shadow_source_project: &str) -> String {
    let home = dirs::home_dir()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_default();
    value
        .replace("$WORKSPACE", workspace)
        .replace("~", &home)
}

/// Read the global config and resolve the shadowSourceProjectDir path.
fn resolve_aindex_root() -> Result<std::path::PathBuf, String> {
    let rc = load_resolved_config()?;
    let path = std::path::PathBuf::from(&rc.shadow_source_project);
    if !path.exists() {
        return Err(format!("Aindex directory not found: {}", path.display()));
    }
    Ok(path)
}

/// Recursively collect all `.cn.mdx` source files under `aindex/app/`.
#[tauri::command]
pub fn list_aindex_files(_cwd: String) -> Result<Vec<AindexFileEntry>, String> {
    let base = resolve_aindex_root()?;
    let app_dir = base.join("app");
    if !app_dir.exists() {
        return Ok(vec![]);
    }
    let mut entries = Vec::new();
    collect_cn_mdx(&app_dir, &base, &mut entries)
        .map_err(|e| format!("Failed to scan aindex: {e}"))?;
    entries.sort_by(|a, b| a.source_path.cmp(&b.source_path));
    Ok(entries)
}

fn collect_cn_mdx(
    dir: &std::path::Path,
    base: &std::path::Path,
    out: &mut Vec<AindexFileEntry>,
) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            collect_cn_mdx(&path, base, out)?;
        } else if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.ends_with(".cn.mdx") {
                let rel = path.strip_prefix(base).unwrap_or(&path);
                let source_path = rel.to_string_lossy().replace('\\', "/");
                // Determine translated path:
                // - app/global.cn.mdx -> dist/global.mdx (root-level files)
                // - app/X/foo.cn.mdx -> dist/app/X/foo.mdx (subdirectory files)
                let without_ext = source_path.replace(".cn.mdx", ".mdx");
                let translated_rel = if without_ext.starts_with("app/") {
                    let after_app = &without_ext["app/".len()..];
                    if after_app.contains('/') {
                        // Subdirectory: keep app/ prefix under dist/
                        format!("dist/{without_ext}")
                    } else {
                        // Root-level file in app/: goes to dist/ directly
                        format!("dist/{after_app}")
                    }
                } else {
                    format!("dist/{without_ext}")
                };
                let translated_abs = base.join(&translated_rel);
                out.push(AindexFileEntry {
                    source_path,
                    translated_path: translated_rel,
                    translated_exists: translated_abs.exists(),
                    file_type: "cnMdx".to_string(),
                });
            }
        }
    }
    Ok(())
}

/// Read a file relative to the aindex directory (resolved from config).
#[tauri::command]
pub fn read_aindex_file(_cwd: String, rel_path: String) -> Result<String, String> {
    let base = resolve_aindex_root()?;
    let path = base.join(&rel_path);
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {e}", path.display()))
}

/// Write content to a file relative to the aindex directory (resolved from config).
#[tauri::command]
pub fn write_aindex_file(_cwd: String, rel_path: String, content: String) -> Result<(), String> {
    let base = resolve_aindex_root()?;
    let path = base.join(&rel_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create dir {}: {e}", parent.display()))?;
    }
    std::fs::write(&path, &content)
        .map_err(|e| format!("Failed to write {}: {e}", path.display()))
}

/// List `.cn.mdx` source files for a given category (skills, commands, agents).
/// Reads the corresponding config field to resolve the source directory,
/// then maps translated files to `dist/{category}/`.
#[tauri::command]
pub fn list_category_files(_cwd: String, category: String) -> Result<Vec<AindexFileEntry>, String> {
    let rc = load_resolved_config()?;
    let base = std::path::PathBuf::from(&rc.shadow_source_project);

    // Map category name to the dist subpath key within shadowSourceProject
    let (src_key, dist_key) = match category.as_str() {
        "skills" => ("skill", "skill"),
        "commands" => ("fastCommand", "fastCommand"),
        "agents" => ("subAgent", "subAgent"),
        "rules" => ("rule", "rule"),
        _ => return Err(format!("Unknown category: {category}")),
    };

    let ssp = rc.cfg.get("shadowSourceProject");

    // Read dist path from nested config, fall back to dist/{category}
    let dist_rel = ssp
        .and_then(|v| v.get(dist_key))
        .and_then(|v| v.get("dist"))
        .and_then(|v| v.as_str())
        .unwrap_or(&format!("dist/{category}"))
        .to_string();

    // This is the OUTPUT (dist) directory — translated files live here
    let dist_dir = base.join(&dist_rel);

    // Read src path from nested config, fall back to src/{category}
    let src_rel = ssp
        .and_then(|v| v.get(src_key))
        .and_then(|v| v.get("src"))
        .and_then(|v| v.as_str())
        .unwrap_or(&format!("src/{category}"))
        .to_string();

    // Source files live under src/{category}/ relative to aindex root
    let src_dir = base.join(&src_rel);

    if !src_dir.exists() {
        return Ok(vec![]);
    }

    let mut entries = Vec::new();
    // Only scan subdirectories — skip root-level files (e.g. AGENTS.md, CLAUDE.md)
    if let Ok(top_entries) = std::fs::read_dir(&src_dir) {
        for top in top_entries.flatten() {
            if top.path().is_dir() {
                collect_category_cn_mdx(&top.path(), &src_dir, &category, &base, &dist_dir, &mut entries)
                    .map_err(|e| format!("Failed to scan {}: {e}", category))?;
            }
        }
    }
    entries.sort_by(|a, b| a.source_path.cmp(&b.source_path));
    Ok(entries)
}

fn collect_category_cn_mdx(
    dir: &std::path::Path,
    src_root: &std::path::Path,
    category: &str,
    base: &std::path::Path,
    dist_dir: &std::path::Path,
    out: &mut Vec<AindexFileEntry>,
) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            collect_category_cn_mdx(&path, src_root, category, base, dist_dir, out)?;
        } else if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            let rel = path.strip_prefix(base).unwrap_or(&path);
            let source_path = rel.to_string_lossy().replace('\\', "/");

            if name.ends_with(".cn.mdx") {
                // Source + translated pair
                let rel_from_src = path.strip_prefix(src_root).unwrap_or(&path);
                let rel_str = rel_from_src.to_string_lossy().replace('\\', "/")
                    .replace(".cn.mdx", ".mdx");
                let translated_abs = dist_dir.join(&rel_str);
                let translated_path = translated_abs.strip_prefix(base)
                    .map(|p| p.to_string_lossy().replace('\\', "/"))
                    .unwrap_or_else(|_| format!("dist/{}/{}", category, rel_str));

                out.push(AindexFileEntry {
                    source_path,
                    translated_path,
                    translated_exists: translated_abs.exists(),
                    file_type: "cnMdx".to_string(),
                });
            } else {
                // Resource file — single preview only
                out.push(AindexFileEntry {
                    source_path,
                    translated_path: String::new(),
                    translated_exists: false,
                    file_type: "resource".to_string(),
                });
            }
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Aindex statistics command
// ---------------------------------------------------------------------------

/// Per-category statistics.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CategoryStats {
    pub name: String,
    pub file_count: u32,
    pub total_chars: u64,
    pub total_lines: u64,
    pub cn_mdx_count: u32,
    pub resource_count: u32,
    pub translated_count: u32,
}

/// Per-project statistics (under app/).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectStats {
    pub name: String,
    pub file_count: u32,
    pub total_chars: u64,
    pub total_lines: u64,
}

/// Overall aindex statistics.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AindexStats {
    pub total_files: u32,
    pub total_chars: u64,
    pub total_lines: u64,
    pub total_cn_mdx: u32,
    pub total_resources: u32,
    pub total_translated: u32,
    pub categories: Vec<CategoryStats>,
    pub projects: Vec<ProjectStats>,
    /// Extension distribution: [{ ext, count }]
    pub extensions: Vec<ExtensionCount>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionCount {
    pub ext: String,
    pub count: u32,
}

/// Recursively count files and accumulate chars/lines.
fn stat_dir(dir: &std::path::Path) -> (u32, u64, u64, u32, u32, u32, std::collections::HashMap<String, u32>) {
    let mut file_count = 0u32;
    let mut total_chars = 0u64;
    let mut total_lines = 0u64;
    let mut cn_mdx = 0u32;
    let mut resource = 0u32;
    let mut translated = 0u32;
    let mut ext_map: std::collections::HashMap<String, u32> = std::collections::HashMap::new();

    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let (fc, tc, tl, cm, rc, tr, em) = stat_dir(&path);
                file_count += fc;
                total_chars += tc;
                total_lines += tl;
                cn_mdx += cm;
                resource += rc;
                translated += tr;
                for (k, v) in em {
                    *ext_map.entry(k).or_default() += v;
                }
            } else if path.is_file() {
                file_count += 1;
                if let Ok(content) = std::fs::read_to_string(&path) {
                    total_chars += content.len() as u64;
                    total_lines += content.lines().count() as u64;
                }
                let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if name.ends_with(".cn.mdx") {
                    cn_mdx += 1;
                    *ext_map.entry("cn.mdx".to_string()).or_default() += 1;
                } else {
                    // Extract extension
                    let ext = name.rsplit('.').next().unwrap_or("other").to_lowercase();
                    *ext_map.entry(ext).or_default() += 1;
                }
            }
        }
    }
    (file_count, total_chars, total_lines, cn_mdx, resource, translated, ext_map)
}

/// Gather comprehensive statistics about the aindex project.
#[tauri::command]
pub fn get_aindex_stats(_cwd: String) -> Result<AindexStats, String> {
    let base = resolve_aindex_root()?;
    let mut stats = AindexStats::default();
    let mut all_ext: std::collections::HashMap<String, u32> = std::collections::HashMap::new();

    // Scan app/ for project stats
    let app_dir = base.join("app");
    if app_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&app_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                    let (fc, tc, tl, cm, rc, _tr, em) = stat_dir(&path);
                    stats.projects.push(ProjectStats {
                        name,
                        file_count: fc,
                        total_chars: tc,
                        total_lines: tl,
                    });
                    stats.total_files += fc;
                    stats.total_chars += tc;
                    stats.total_lines += tl;
                    stats.total_cn_mdx += cm;
                    stats.total_resources += rc;
                    for (k, v) in em {
                        *all_ext.entry(k).or_default() += v;
                    }
                }
            }
        }
    }

    // Scan src/skills, src/commands, src/agents
    for cat_name in &["skills", "commands", "agents"] {
        let src_dir = base.join("src").join(cat_name);
        if !src_dir.exists() {
            stats.categories.push(CategoryStats {
                name: cat_name.to_string(),
                ..Default::default()
            });
            continue;
        }
        let (fc, tc, tl, cm, rc, _tr, em) = stat_dir(&src_dir);
        stats.categories.push(CategoryStats {
            name: cat_name.to_string(),
            file_count: fc,
            total_chars: tc,
            total_lines: tl,
            cn_mdx_count: cm,
            resource_count: rc,
            translated_count: 0,
        });
        stats.total_files += fc;
        stats.total_chars += tc;
        stats.total_lines += tl;
        stats.total_cn_mdx += cm;
        stats.total_resources += rc;
        for (k, v) in em {
            *all_ext.entry(k).or_default() += v;
        }
    }

    // Count translated files in dist/
    let dist_dir = base.join("dist");
    if dist_dir.exists() {
        let (fc, _tc, _tl, _cm, _rc, _tr, _em) = stat_dir(&dist_dir);
        stats.total_translated = fc;
    }

    // Build extension distribution
    let mut ext_vec: Vec<_> = all_ext.into_iter().collect();
    ext_vec.sort_by(|a, b| b.1.cmp(&a.1));
    stats.extensions = ext_vec.into_iter().map(|(ext, count)| ExtensionCount { ext, count }).collect();

    // Sort projects by file count descending
    stats.projects.sort_by(|a, b| b.file_count.cmp(&a.file_count));

    Ok(stats)
}
