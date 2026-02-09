/// Tauri commands that bridge the frontend to the `tnmsc` CLI sidecar.
///
/// The CLI outputs Winston JSON5 log lines to stdout. Each line has the shape:
/// ```json5
/// {$:["HH:MM:SS.mmm","LEVEL","loggerName"],_:{...payload...}}
/// ```
/// We parse these lines with the `json5` crate and extract structured data.

use serde::{Deserialize, Serialize};
use tauri_plugin_shell::ShellExt;

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

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
///
/// Expected format: `{$:["timestamp","LEVEL","logger"],_:{...}}`
fn parse_log_line(line: &str) -> Option<LogEntry> {
    let val: serde_json::Value = json5::from_str(line).ok()?;
    let obj = val.as_object()?;

    let meta = obj.get("$")?.as_array()?;
    let timestamp = meta.first()?.as_str()?.to_string();
    let level = meta.get(1)?.as_str()?.to_string();
    let logger = meta.get(2)?.as_str()?.to_string();

    let payload = obj.get("_").cloned().unwrap_or(serde_json::Value::Null);

    Some(LogEntry {
        timestamp,
        level,
        logger,
        payload,
    })
}

/// Parse all log lines from raw sidecar stdout.
fn parse_all_logs(raw: &str) -> Vec<LogEntry> {
    let cleaned = strip_ansi(raw);
    cleaned
        .lines()
        .filter_map(|line| parse_log_line(line.trim()))
        .collect()
}

/// Extract plugin results from log entries that match the "plugin result" pattern.
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

/// Run the `tnmsc` sidecar with the given arguments and return raw stdout.
async fn run_sidecar(
    app: &tauri::AppHandle,
    args: &[&str],
    cwd: &str,
) -> Result<String, String> {
    let mut full_args: Vec<&str> = vec!["--cwd", cwd];
    full_args.extend_from_slice(args);

    let output = app
        .shell()
        .sidecar("tnmsc")
        .map_err(|e| format!("Failed to create sidecar process: {e}"))?
        .args(&full_args)
        .output()
        .await
        .map_err(|e| format!("Failed to execute sidecar process: {e}"))?;

    if output.status.code() != Some(0) {
        let stderr =
            String::from_utf8(output.stderr).unwrap_or_else(|_| "<non-UTF-8 stderr>".into());
        let code = output
            .status
            .code()
            .map(|c| c.to_string())
            .unwrap_or_else(|| "unknown".into());
        return Err(format!("Sidecar exited with code {code}: {stderr}"));
    }

    String::from_utf8(output.stdout)
        .map_err(|e| format!("Sidecar stdout is not valid UTF-8: {e}"))
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Execute the sync pipeline (default command) or dry-run.
#[tauri::command]
pub async fn execute_pipeline(
    app: tauri::AppHandle,
    cwd: String,
    dry_run: bool,
) -> Result<PipelineResult, String> {
    let args = if dry_run {
        vec!["dry-run"]
    } else {
        vec![]
    };

    let stdout = run_sidecar(&app, &args.iter().map(|s| *s).collect::<Vec<_>>(), &cwd).await?;
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

    let errors: Vec<String> = logs
        .iter()
        .filter(|e| e.level == "ERROR")
        .map(|e| format!("[{}] {}", e.logger, e.payload))
        .collect();

    Ok(PipelineResult {
        success: errors.is_empty(),
        total_files,
        total_dirs,
        dry_run,
        command: cmd,
        plugin_results,
        logs,
        errors,
    })
}

/// Load the merged configuration by reading log output.
///
/// Since the CLI doesn't have a `config --show` command, we run the default
/// command with `--info` level and extract config-related log entries.
#[tauri::command]
pub async fn load_config(
    app: tauri::AppHandle,
    cwd: String,
) -> Result<serde_json::Value, String> {
    // `tnmsc config` without key=value just prints usage, but the startup
    // logs contain the loaded config sources. Use dry-run to get config info
    // without side effects.
    let stdout = run_sidecar(&app, &["dry-run"], &cwd).await?;
    let logs = parse_all_logs(&stdout);

    // Collect config-related log entries
    let config_entries: Vec<serde_json::Value> = logs
        .iter()
        .filter(|e| e.logger == "defineConfig")
        .map(|e| {
            serde_json::json!({
                "timestamp": e.timestamp,
                "level": e.level,
                "data": e.payload,
            })
        })
        .collect();

    Ok(serde_json::json!({
        "configEntries": config_entries,
        "cwd": cwd,
    }))
}

/// List all registered plugins by parsing dry-run output.
#[tauri::command]
pub async fn list_plugins(
    app: tauri::AppHandle,
    cwd: String,
) -> Result<Vec<PluginExecutionResult>, String> {
    let stdout = run_sidecar(&app, &["dry-run"], &cwd).await?;
    let logs = parse_all_logs(&stdout);
    Ok(extract_plugin_results(&logs))
}

/// Clean previously generated output files.
#[tauri::command]
pub async fn clean_outputs(
    app: tauri::AppHandle,
    cwd: String,
    dry_run: bool,
) -> Result<PipelineResult, String> {
    let args: Vec<&str> = if dry_run {
        vec!["clean", "--dry-run"]
    } else {
        vec!["clean"]
    };

    let stdout = run_sidecar(&app, &args, &cwd).await?;
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

    let errors: Vec<String> = logs
        .iter()
        .filter(|e| e.level == "ERROR")
        .map(|e| format!("[{}] {}", e.logger, e.payload))
        .collect();

    Ok(PipelineResult {
        success: errors.is_empty(),
        total_files,
        total_dirs,
        dry_run,
        command: cmd,
        plugin_results,
        logs,
        errors,
    })
}

/// Get raw log output from any CLI command — useful for the log viewer.
#[tauri::command]
pub async fn get_logs(
    app: tauri::AppHandle,
    cwd: String,
    command: String,
) -> Result<Vec<LogEntry>, String> {
    let args: Vec<&str> = command.split_whitespace().collect();
    let stdout = run_sidecar(&app, &args, &cwd).await?;
    Ok(parse_all_logs(&stdout))
}
