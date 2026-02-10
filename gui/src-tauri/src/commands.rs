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

use std::process::Command as StdCommand;

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
    let output = StdCommand::new("tnmsc")
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
    match StdCommand::new("tnmsc").arg("version").output() {
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
