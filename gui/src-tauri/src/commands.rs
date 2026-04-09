/// Tauri commands that bridge the frontend to the `tnmsc` CLI.
///
/// Commands use the `tnmsc` crate's library API for direct in-process invocation.
/// Bridge commands (execute, dry-run, clean, plugins) still spawn a Node.js subprocess
/// internally via `tnmsc::run_bridge_command`, but the GUI no longer searches for or
/// invokes the CLI binary as a sidecar.
use std::path::{Path, PathBuf};
use std::process::Command as StdCommand;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tnmsc::core::config as core_config;

const PRIMARY_SOURCE_MDX_EXTENSION: &str = ".src.mdx";
const SOURCE_MDX_FILE_TYPE: &str = "sourceMdx";
const PROJECT_SERIES_CATEGORIES: [&str; 3] = ["app", "ext", "arch"];
const INTERNAL_BRIDGE_JSON_FLAG: &str = "--bridge-json";

fn has_source_mdx_extension(name: &str) -> bool {
    name.ends_with(PRIMARY_SOURCE_MDX_EXTENSION)
}

fn replace_source_mdx_extension(path: &str) -> Option<String> {
    path.strip_suffix(PRIMARY_SOURCE_MDX_EXTENSION)
        .map(|without_extension| format!("{without_extension}.mdx"))
}

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
    pub stream: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    pub markdown: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeJsonCommandResult {
    success: bool,
    #[serde(default)]
    files_affected: i32,
    #[serde(default)]
    dirs_affected: i32,
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    warnings: Vec<Value>,
    #[serde(default)]
    errors: Vec<Value>,
}

#[derive(Debug, Clone, Deserialize)]
struct PluginListEntry {
    name: String,
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Execute the sync pipeline (default command) or dry-run.
#[tauri::command]
pub fn execute_pipeline(cwd: String, dry_run: bool) -> Result<PipelineResult, String> {
    let subcommand = if dry_run { "dry-run" } else { "execute" };
    let result = tnmsc::run_bridge_command(subcommand, Path::new(&cwd), &[INTERNAL_BRIDGE_JSON_FLAG])
        .map_err(|e| e.to_string())?;
    parse_pipeline_result(&result.stdout, subcommand, dry_run)
}

/// Load the merged configuration via the tnmsc library API.
#[tauri::command]
pub fn load_config(cwd: String) -> Result<serde_json::Value, String> {
    let result = tnmsc::load_config(Path::new(&cwd)).map_err(|e| e.to_string())?;
    serde_json::to_value(&result.config).map_err(|e| e.to_string())
}

/// List all registered plugins via the tnmsc bridge command.
#[tauri::command]
pub fn list_plugins(cwd: String) -> Result<Vec<PluginExecutionResult>, String> {
    let result = tnmsc::run_bridge_command("plugins", Path::new(&cwd), &[INTERNAL_BRIDGE_JSON_FLAG])
        .map_err(|e| e.to_string())?;
    let plugins = serde_json::from_str::<Vec<PluginListEntry>>(&result.stdout)
        .map_err(|e| format!("Failed to parse plugins output: {e}"))?;
    Ok(plugins
        .into_iter()
        .map(|plugin| PluginExecutionResult {
            plugin: plugin.name,
            files: 0,
            dirs: 0,
            dry_run: false,
        })
        .collect())
}

/// Clean previously generated output files.
#[tauri::command]
pub fn clean_outputs(cwd: String, dry_run: bool) -> Result<PipelineResult, String> {
    let subcommand = if dry_run { "dry-run-clean" } else { "clean" };
    let result = tnmsc::run_bridge_command(subcommand, Path::new(&cwd), &[INTERNAL_BRIDGE_JSON_FLAG])
        .map_err(|e| e.to_string())?;
    parse_pipeline_result(&result.stdout, subcommand, dry_run)
}

/// Get log output from a CLI bridge command.
///
/// Runs the given command via `tnmsc::run_bridge_command` in non-JSON mode and
/// parses both stdout and stderr into markdown log blocks.
#[tauri::command]
pub fn get_logs(cwd: String, command: String) -> Result<Vec<LogEntry>, String> {
    let args: Vec<&str> = command.split_whitespace().collect();
    let subcommand = args.first().copied().unwrap_or("execute");
    let extra_args: Vec<&str> = args.iter().skip(1).copied().collect();
    let result = tnmsc::run_bridge_command(subcommand, Path::new(&cwd), &extra_args)
        .map_err(|e| e.to_string())?;
    let mut logs = parse_log_lines(&result.stdout, "stdout");
    logs.extend(parse_log_lines(&result.stderr, "stderr"));
    Ok(logs)
}

fn parse_pipeline_result(raw: &str, command: &str, dry_run: bool) -> Result<PipelineResult, String> {
    let parsed = serde_json::from_str::<BridgeJsonCommandResult>(raw)
        .map_err(|e| format!("Failed to parse bridge result: {e}"))?;

    Ok(PipelineResult {
        success: parsed.success,
        total_files: parsed.files_affected,
        total_dirs: parsed.dirs_affected,
        dry_run,
        command: Some(command.to_string()),
        plugin_results: Vec::new(),
        logs: Vec::new(),
        errors: collect_bridge_messages(&parsed),
    })
}

fn collect_bridge_messages(result: &BridgeJsonCommandResult) -> Vec<String> {
    let mut messages = Vec::new();

    if let Some(message) = result.message.as_ref()
        && !message.is_empty()
    {
        messages.push(message.clone());
    }

    for diagnostic in &result.errors {
        if let Some(message) = extract_diagnostic_message(diagnostic) {
            messages.push(message);
        }
    }

    for diagnostic in &result.warnings {
        if let Some(message) = extract_diagnostic_message(diagnostic) {
            messages.push(message);
        }
    }

    messages
}

fn extract_diagnostic_message(diagnostic: &Value) -> Option<String> {
    let object = diagnostic.as_object()?;
    if let Some(copy_text) = object.get("copyText").and_then(Value::as_array) {
        let lines = copy_text
            .iter()
            .filter_map(Value::as_str)
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>();
        if !lines.is_empty() {
            return Some(lines.join("\n"));
        }
    }

    let title = object.get("title").and_then(Value::as_str)?;
    let code = object.get("code").and_then(Value::as_str).unwrap_or("DIAGNOSTIC");
    Some(format!("[{code}] {title}"))
}

/// Parse markdown log output into lightweight GUI log entries.
fn parse_log_lines(raw: &str, stream: &str) -> Vec<LogEntry> {
    let mut entries = Vec::new();
    let mut current: Vec<String> = Vec::new();
    let mut saw_markdown_record = false;

    for raw_line in raw.lines() {
        let line = raw_line.trim_end();
        if line.starts_with("### ") {
            if !current.is_empty() {
                entries.push(LogEntry {
                    stream: stream.to_string(),
                    source: None,
                    markdown: current.join("\n"),
                });
                current.clear();
            }
            saw_markdown_record = true;
            current.push(line.to_string());
            continue;
        }

        if !current.is_empty() || !line.trim().is_empty() || !saw_markdown_record {
            current.push(line.to_string());
        }
    }

    if !current.is_empty() {
        entries.push(LogEntry {
            stream: stream.to_string(),
            source: None,
            markdown: current.join("\n").trim().to_string(),
        });
    }

    entries.retain(|entry| !entry.markdown.trim().is_empty());
    entries
}

/// Resolve the canonical global config file path.
fn resolve_global_config_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    Ok(home.join(".aindex").join(".tnmsc.json"))
}

/// Read a config file's raw content. Returns empty string if file doesn't exist.
#[tauri::command]
pub fn read_config_file() -> Result<String, String> {
    let path = resolve_global_config_path()?;
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {e}", path.display()))
}

/// Write content to the canonical global config file. Creates parent directories if needed.
#[tauri::command]
pub fn write_config_file(content: String) -> Result<(), String> {
    let path = resolve_global_config_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory {}: {e}", parent.display()))?;
    }
    std::fs::write(&path, &content).map_err(|e| format!("Failed to write {}: {e}", path.display()))
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
    /// Relative path from aindex root, e.g. "app/TrueNine/agt.src.mdx"
    pub source_path: String,
    /// Relative path of translated file (empty for resource files)
    pub translated_path: String,
    /// Whether the translated file exists on disk
    pub translated_exists: bool,
    /// "sourceMdx" for source+translated pairs, "resource" for other files
    pub file_type: String,
}

/// Parsed global config with resolved paths.
struct ResolvedConfig {
    aindex_root: PathBuf,
    config: tnmsc::core::config::UserConfigFile,
}

struct CategoryPaths {
    source_rel: String,
    translated_rel: String,
}

fn resolve_category_paths(
    config: &tnmsc::core::config::UserConfigFile,
    category: &str,
) -> Result<CategoryPaths, String> {
    let aindex = &config.aindex;

    let resolve_pair = |pair: Option<&tnmsc::core::config::DirPair>,
                        default_source: &str,
                        default_translated: &str|
     -> CategoryPaths {
        CategoryPaths {
            source_rel: pair
                .and_then(|value| value.src.as_deref())
                .unwrap_or(default_source)
                .to_string(),
            translated_rel: pair
                .and_then(|value| value.dist.as_deref())
                .unwrap_or(default_translated)
                .to_string(),
        }
    };

    match category {
        "skills" => Ok(resolve_pair(
            aindex.skills.as_ref(),
            core_config::DEFAULT_SKILLS_SRC_DIR,
            core_config::DEFAULT_SKILLS_DIST_DIR,
        )),
        "commands" => Ok(resolve_pair(
            aindex.commands.as_ref(),
            core_config::DEFAULT_COMMANDS_SRC_DIR,
            core_config::DEFAULT_COMMANDS_DIST_DIR,
        )),
        "agents" => Ok(resolve_pair(
            aindex.sub_agents.as_ref(),
            core_config::DEFAULT_SUB_AGENTS_SRC_DIR,
            core_config::DEFAULT_SUB_AGENTS_DIST_DIR,
        )),
        "rules" => Ok(resolve_pair(
            aindex.rules.as_ref(),
            core_config::DEFAULT_RULES_SRC_DIR,
            core_config::DEFAULT_RULES_DIST_DIR,
        )),
        "app" => Ok(resolve_pair(
            aindex.app.as_ref(),
            core_config::DEFAULT_APP_SRC_DIR,
            core_config::DEFAULT_APP_DIST_DIR,
        )),
        "ext" => Ok(resolve_pair(
            aindex.ext.as_ref(),
            core_config::DEFAULT_EXT_SRC_DIR,
            core_config::DEFAULT_EXT_DIST_DIR,
        )),
        "arch" => Ok(resolve_pair(
            aindex.arch.as_ref(),
            core_config::DEFAULT_ARCH_SRC_DIR,
            core_config::DEFAULT_ARCH_DIST_DIR,
        )),
        _ => Err(format!("Unknown category: {category}")),
    }
}

fn collect_project_series_category_files(
    src_dir: &std::path::Path,
    base: &std::path::Path,
    translated_root_rel: &str,
    dist_dir: &std::path::Path,
    out: &mut Vec<AindexFileEntry>,
) -> std::io::Result<()> {
    if let Ok(top_entries) = std::fs::read_dir(src_dir) {
        for top in top_entries.flatten() {
            if top.path().is_dir() {
                collect_category_source_mdx(
                    &top.path(),
                    src_dir,
                    base,
                    translated_root_rel,
                    dist_dir,
                    out,
                )?;
            }
        }
    }

    Ok(())
}

fn collect_root_memory_prompt_files(
    base: &std::path::Path,
    config: &tnmsc::core::config::UserConfigFile,
    out: &mut Vec<AindexFileEntry>,
) {
    for (source_rel, translated_rel) in collect_root_memory_prompt_pairs(config) {
        let source_abs = base.join(&source_rel);
        if !(source_abs.exists() && source_abs.is_file()) {
            continue;
        }

        out.push(AindexFileEntry {
            source_path: source_rel,
            translated_path: translated_rel.clone(),
            translated_exists: base.join(translated_rel).exists(),
            file_type: SOURCE_MDX_FILE_TYPE.to_string(),
        });
    }
}

fn collect_root_memory_prompt_pairs(
    config: &tnmsc::core::config::UserConfigFile,
) -> Vec<(String, String)> {
    let aindex = &config.aindex;
    [
        (
            aindex.global_prompt.as_ref(),
            core_config::DEFAULT_GLOBAL_PROMPT_SRC,
            core_config::DEFAULT_GLOBAL_PROMPT_DIST,
        ),
        (
            aindex.workspace_prompt.as_ref(),
            core_config::DEFAULT_WORKSPACE_PROMPT_SRC,
            core_config::DEFAULT_WORKSPACE_PROMPT_DIST,
        ),
    ]
    .into_iter()
    .map(|(pair, default_source, default_dist)| {
        let source_rel = pair
            .and_then(|value| value.src.as_deref())
            .unwrap_or(default_source)
            .replace('\\', "/");
        let translated_rel = pair
            .and_then(|value| value.dist.as_deref())
            .unwrap_or(default_dist)
            .replace('\\', "/");
        (source_rel, translated_rel)
    })
    .collect()
}

fn collect_category_file_entries(
    base: &std::path::Path,
    config: &tnmsc::core::config::UserConfigFile,
    category: &str,
) -> Result<Vec<AindexFileEntry>, String> {
    let paths = resolve_category_paths(config, category)?;
    let dist_dir = base.join(&paths.translated_rel);
    let src_dir = base.join(&paths.source_rel);
    let mut entries = Vec::new();

    if category == "app" {
        collect_root_memory_prompt_files(base, config, &mut entries);
    }
    if src_dir.exists() {
        collect_project_series_category_files(
            &src_dir,
            base,
            &paths.translated_rel,
            &dist_dir,
            &mut entries,
        )
        .map_err(|e| format!("Failed to scan {}: {e}", category))?;
    }

    entries.sort_by(|a, b| a.source_path.cmp(&b.source_path));
    Ok(entries)
}

/// Read and resolve the merged tnmsc config for the current working directory.
fn load_resolved_config(cwd: &str) -> Result<ResolvedConfig, String> {
    let result =
        tnmsc::load_config(Path::new(cwd)).map_err(|e| format!("Failed to load config: {e}"))?;
    let config = result.config;
    let workspace_dir = config.workspace_dir.as_deref().unwrap_or(".");
    let workspace_dir = tnmsc::core::config::resolve_tilde(workspace_dir);
    let aindex_dir = config
        .aindex
        .dir
        .as_deref()
        .unwrap_or(core_config::DEFAULT_AINDEX_DIR_NAME);

    Ok(ResolvedConfig {
        aindex_root: workspace_dir.join(aindex_dir),
        config,
    })
}

/// Read the merged config and resolve the aindex root path.
fn resolve_aindex_root(cwd: &str) -> Result<std::path::PathBuf, String> {
    let rc = load_resolved_config(cwd)?;
    let path = rc.aindex_root;
    if !path.exists() {
        return Err(format!("Aindex directory not found: {}", path.display()));
    }
    Ok(path)
}

/// Collect project-like source prompt files under `aindex/app/`, `aindex/ext/`, and `aindex/arch/`.
#[tauri::command]
pub fn list_aindex_files(cwd: String) -> Result<Vec<AindexFileEntry>, String> {
    let ResolvedConfig {
        aindex_root: base,
        config,
    } = load_resolved_config(&cwd)?;
    let mut entries = Vec::new();
    collect_root_memory_prompt_files(&base, &config, &mut entries);

    for category in PROJECT_SERIES_CATEGORIES {
        let paths = resolve_category_paths(&config, category)?;
        let src_dir = base.join(&paths.source_rel);
        if !src_dir.exists() {
            continue;
        }

        let dist_dir = base.join(&paths.translated_rel);
        collect_project_series_category_files(
            &src_dir,
            &base,
            &paths.translated_rel,
            &dist_dir,
            &mut entries,
        )
        .map_err(|e| format!("Failed to scan aindex {category}: {e}"))?;
    }

    entries.sort_by(|a, b| a.source_path.cmp(&b.source_path));
    Ok(entries)
}

/// Read a file relative to the aindex directory (resolved from config).
#[tauri::command]
pub fn read_aindex_file(cwd: String, rel_path: String) -> Result<String, String> {
    let base = resolve_aindex_root(&cwd)?;
    let path = base.join(&rel_path);
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {e}", path.display()))
}

/// Write content to a file relative to the aindex directory (resolved from config).
#[tauri::command]
pub fn write_aindex_file(cwd: String, rel_path: String, content: String) -> Result<(), String> {
    let base = resolve_aindex_root(&cwd)?;
    let path = base.join(&rel_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create dir {}: {e}", parent.display()))?;
    }
    std::fs::write(&path, &content).map_err(|e| format!("Failed to write {}: {e}", path.display()))
}

/// List source prompt files for a given category.
/// Reads the corresponding `aindex` config field to resolve source and output directories.
#[tauri::command]
pub fn list_category_files(cwd: String, category: String) -> Result<Vec<AindexFileEntry>, String> {
    let ResolvedConfig {
        aindex_root: base,
        config,
    } = load_resolved_config(&cwd)?;
    collect_category_file_entries(&base, &config, &category)
}

fn collect_category_source_mdx(
    dir: &std::path::Path,
    src_root: &std::path::Path,
    base: &std::path::Path,
    translated_root_rel: &str,
    dist_dir: &std::path::Path,
    out: &mut Vec<AindexFileEntry>,
) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            collect_category_source_mdx(&path, src_root, base, translated_root_rel, dist_dir, out)?;
        } else if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            let rel = path.strip_prefix(base).unwrap_or(&path);
            let source_path = rel.to_string_lossy().replace('\\', "/");

            if has_source_mdx_extension(name) {
                // Source + translated pair
                let rel_from_src = path.strip_prefix(src_root).unwrap_or(&path);
                let rel_str = rel_from_src
                    .to_string_lossy()
                    .replace('\\', "/")
                    .to_string();
                let rel_str = replace_source_mdx_extension(&rel_str).unwrap_or(rel_str);
                let translated_abs = dist_dir.join(&rel_str);
                let translated_path = translated_abs
                    .strip_prefix(base)
                    .map(|p| p.to_string_lossy().replace('\\', "/"))
                    .unwrap_or_else(|_| {
                        format!("{}/{}", translated_root_rel.trim_end_matches('/'), rel_str)
                    });

                out.push(AindexFileEntry {
                    source_path,
                    translated_path,
                    translated_exists: translated_abs.exists(),
                    file_type: SOURCE_MDX_FILE_TYPE.to_string(),
                });
            } else if !name.ends_with(".mdx") {
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
    pub source_mdx_count: u32,
    pub resource_count: u32,
    pub translated_count: u32,
}

/// Per-project statistics for project-like series (`app/`, `ext/`, `arch/`).
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
    pub total_source_mdx: u32,
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

#[derive(Debug, Clone, Default)]
struct StatAccumulator {
    file_count: u32,
    total_chars: u64,
    total_lines: u64,
    source_mdx_count: u32,
    resource_count: u32,
    translated_count: u32,
    ext_map: std::collections::HashMap<String, u32>,
}

impl StatAccumulator {
    fn add(&mut self, other: Self) {
        self.file_count += other.file_count;
        self.total_chars += other.total_chars;
        self.total_lines += other.total_lines;
        self.source_mdx_count += other.source_mdx_count;
        self.resource_count += other.resource_count;
        self.translated_count += other.translated_count;
        for (key, value) in other.ext_map {
            *self.ext_map.entry(key).or_default() += value;
        }
    }

    fn from_file(path: &std::path::Path) -> Self {
        let mut stats = Self::default();
        if !path.is_file() {
            return stats;
        }

        stats.file_count = 1;
        if let Ok(content) = std::fs::read_to_string(path) {
            stats.total_chars = content.len() as u64;
            stats.total_lines = content.lines().count() as u64;
        }

        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if has_source_mdx_extension(name) {
            stats.source_mdx_count = 1;
            stats.ext_map.insert("src.mdx".to_string(), 1);
        } else {
            let ext = name.rsplit('.').next().unwrap_or("other").to_lowercase();
            stats.ext_map.insert(ext, 1);
        }

        stats
    }
}

/// Recursively count files and accumulate chars/lines.
fn stat_dir(dir: &std::path::Path) -> StatAccumulator {
    let mut stats = StatAccumulator::default();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stats.add(stat_dir(&path));
            } else if path.is_file() {
                stats.add(StatAccumulator::from_file(&path));
            }
        }
    }
    stats
}

fn derive_english_source_rel(source_rel: &str) -> Option<String> {
    replace_source_mdx_extension(source_rel).filter(|derived| derived != source_rel)
}

fn collect_root_memory_prompt_stats(
    base: &std::path::Path,
    config: &tnmsc::core::config::UserConfigFile,
) -> StatAccumulator {
    let mut stats = StatAccumulator::default();
    let mut seen_paths = std::collections::HashSet::new();

    for (source_rel, _) in collect_root_memory_prompt_pairs(config) {
        for relative_path in std::iter::once(source_rel.clone())
            .chain(derive_english_source_rel(&source_rel).into_iter())
        {
            if !seen_paths.insert(relative_path.clone()) {
                continue;
            }

            let absolute_path = base.join(&relative_path);
            if absolute_path.exists() && absolute_path.is_file() {
                stats.add(StatAccumulator::from_file(&absolute_path));
            }
        }
    }

    stats
}

fn accumulate_overall_stats(
    summary: &StatAccumulator,
    stats: &mut AindexStats,
    all_ext: &mut std::collections::HashMap<String, u32>,
) {
    stats.total_files += summary.file_count;
    stats.total_chars += summary.total_chars;
    stats.total_lines += summary.total_lines;
    stats.total_source_mdx += summary.source_mdx_count;
    stats.total_resources += summary.resource_count;
    for (key, value) in &summary.ext_map {
        *all_ext.entry(key.clone()).or_default() += *value;
    }
}

fn collect_project_series_stats(
    base: &std::path::Path,
    config: &tnmsc::core::config::UserConfigFile,
    stats: &mut AindexStats,
    all_ext: &mut std::collections::HashMap<String, u32>,
) -> Result<(), String> {
    for series_name in PROJECT_SERIES_CATEGORIES {
        let category_paths = resolve_category_paths(config, series_name)?;
        let src_dir = base.join(&category_paths.source_rel);
        if !src_dir.exists() {
            continue;
        }

        if let Ok(entries) = std::fs::read_dir(&src_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let project_name = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_string();
                    let label = if series_name == "app" {
                        project_name
                    } else {
                        format!("{series_name}/{project_name}")
                    };
                    let project_stats = stat_dir(&path);
                    stats.projects.push(ProjectStats {
                        name: label,
                        file_count: project_stats.file_count,
                        total_chars: project_stats.total_chars,
                        total_lines: project_stats.total_lines,
                    });
                    accumulate_overall_stats(&project_stats, stats, all_ext);
                }
            }
        }
    }

    Ok(())
}

fn build_aindex_stats(
    base: &std::path::Path,
    config: &tnmsc::core::config::UserConfigFile,
) -> Result<AindexStats, String> {
    let mut stats = AindexStats::default();
    let mut all_ext: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
    let root_prompt_stats = collect_root_memory_prompt_stats(base, config);

    accumulate_overall_stats(&root_prompt_stats, &mut stats, &mut all_ext);
    collect_project_series_stats(base, config, &mut stats, &mut all_ext)?;

    // Root global/workspace prompts live outside the project-series directories,
    // so the App category needs them merged back in explicitly.
    for cat_name in &["app", "ext", "arch", "skills", "commands", "agents"] {
        let category_paths = resolve_category_paths(config, cat_name)?;
        let src_dir = base.join(&category_paths.source_rel);
        let mut category_stats = if src_dir.exists() {
            stat_dir(&src_dir)
        } else {
            StatAccumulator::default()
        };
        if *cat_name == "app" {
            category_stats.add(root_prompt_stats.clone());
        }

        stats.categories.push(CategoryStats {
            name: cat_name.to_string(),
            file_count: category_stats.file_count,
            total_chars: category_stats.total_chars,
            total_lines: category_stats.total_lines,
            source_mdx_count: category_stats.source_mdx_count,
            resource_count: category_stats.resource_count,
            translated_count: category_stats.translated_count,
        });

        if !PROJECT_SERIES_CATEGORIES.contains(cat_name) {
            accumulate_overall_stats(&category_stats, &mut stats, &mut all_ext);
        }
    }

    let dist_dir = base.join("dist");
    if dist_dir.exists() {
        stats.total_translated = stat_dir(&dist_dir).file_count;
    }

    let mut ext_vec: Vec<_> = all_ext.into_iter().collect();
    ext_vec.sort_by(|a, b| b.1.cmp(&a.1));
    stats.extensions = ext_vec
        .into_iter()
        .map(|(ext, count)| ExtensionCount { ext, count })
        .collect();

    stats
        .projects
        .sort_by(|a, b| b.file_count.cmp(&a.file_count));

    Ok(stats)
}

/// Gather comprehensive statistics about the aindex project.
#[tauri::command]
pub fn get_aindex_stats(cwd: String) -> Result<AindexStats, String> {
    let ResolvedConfig {
        aindex_root: base,
        config,
    } = load_resolved_config(&cwd)?;
    build_aindex_stats(&base, &config)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn create_temp_dir(prefix: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("{prefix}-{unique}"));
        std::fs::create_dir_all(&dir).expect("temp dir should be created");
        dir
    }

    fn create_test_config() -> tnmsc::core::config::UserConfigFile {
        tnmsc::core::config::UserConfigFile::default()
    }

    #[test]
    fn resolve_category_paths_supports_project_series() {
        let config = create_test_config();

        let app = resolve_category_paths(&config, "app").expect("app paths should resolve");
        let ext = resolve_category_paths(&config, "ext").expect("ext paths should resolve");
        let arch = resolve_category_paths(&config, "arch").expect("arch paths should resolve");

        assert_eq!(app.source_rel, "app");
        assert_eq!(app.translated_rel, "dist/app");
        assert_eq!(ext.source_rel, "ext");
        assert_eq!(ext.translated_rel, "dist/ext");
        assert_eq!(arch.source_rel, "arch");
        assert_eq!(arch.translated_rel, "dist/arch");
    }

    #[test]
    fn collect_project_series_category_files_scans_app_ext_and_arch() {
        let base = create_temp_dir("tnmsc-tauri-series-files");

        let app_src = base.join("app").join("project-a");
        let ext_src = base.join("ext").join("plugin-a");
        let arch_src = base.join("arch").join("system-a");
        let app_dist = base.join("dist").join("app");
        let ext_dist = base.join("dist").join("ext");
        let arch_dist = base.join("dist").join("arch");

        std::fs::create_dir_all(&app_src).expect("app dir should be created");
        std::fs::create_dir_all(&ext_src).expect("ext dir should be created");
        std::fs::create_dir_all(&arch_src).expect("arch dir should be created");
        std::fs::create_dir_all(app_dist.join("project-a"))
            .expect("app dist dir should be created");
        std::fs::create_dir_all(ext_dist.join("plugin-a")).expect("ext dist dir should be created");
        std::fs::create_dir_all(arch_dist.join("system-a"))
            .expect("arch dist dir should be created");

        std::fs::write(app_src.join("agt.src.mdx"), "App").expect("app src file should exist");
        std::fs::write(ext_src.join("agt.src.mdx"), "Ext").expect("ext src file should exist");
        std::fs::write(arch_src.join("agt.src.mdx"), "Arch").expect("arch src file should exist");
        std::fs::write(app_dist.join("project-a").join("agt.mdx"), "App dist")
            .expect("app dist file should exist");
        std::fs::write(ext_dist.join("plugin-a").join("agt.mdx"), "Ext dist")
            .expect("ext dist file should exist");
        std::fs::write(arch_dist.join("system-a").join("agt.mdx"), "Arch dist")
            .expect("arch dist file should exist");

        let mut entries = Vec::new();
        collect_project_series_category_files(
            &base.join("app"),
            &base,
            "dist/app",
            &app_dist,
            &mut entries,
        )
        .expect("app series files should collect");
        collect_project_series_category_files(
            &base.join("ext"),
            &base,
            "dist/ext",
            &ext_dist,
            &mut entries,
        )
        .expect("ext series files should collect");
        collect_project_series_category_files(
            &base.join("arch"),
            &base,
            "dist/arch",
            &arch_dist,
            &mut entries,
        )
        .expect("arch series files should collect");

        let source_paths: Vec<_> = entries
            .iter()
            .map(|entry| entry.source_path.as_str())
            .collect();
        assert!(source_paths.contains(&"app/project-a/agt.src.mdx"));
        assert!(source_paths.contains(&"ext/plugin-a/agt.src.mdx"));
        assert!(source_paths.contains(&"arch/system-a/agt.src.mdx"));
        assert!(entries.iter().all(|entry| entry.translated_exists));

        std::fs::remove_dir_all(base).expect("temp dir should be removed");
    }

    #[test]
    fn collect_root_memory_prompt_files_includes_root_level_sources() {
        let base = create_temp_dir("tnmsc-tauri-root-prompts");
        let config = create_test_config();
        std::fs::create_dir_all(base.join("dist")).expect("dist dir should be created");
        std::fs::write(base.join("global.src.mdx"), "Global")
            .expect("global source prompt should be created");
        std::fs::write(base.join("workspace.src.mdx"), "Workspace")
            .expect("workspace source prompt should be created");
        std::fs::write(base.join("dist").join("global.mdx"), "Global dist")
            .expect("global dist prompt should be created");

        let mut entries = Vec::new();
        collect_root_memory_prompt_files(&base, &config, &mut entries);
        entries.sort_by(|a, b| a.source_path.cmp(&b.source_path));

        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].source_path, "global.src.mdx");
        assert_eq!(entries[0].translated_path, "dist/global.mdx");
        assert!(entries[0].translated_exists);
        assert_eq!(entries[1].source_path, "workspace.src.mdx");
        assert_eq!(entries[1].translated_path, "dist/workspace.mdx");
        assert!(!entries[1].translated_exists);

        std::fs::remove_dir_all(base).expect("temp dir should be removed");
    }

    #[test]
    fn collect_category_file_entries_keeps_root_prompts_without_app_directory() {
        let base = create_temp_dir("tnmsc-tauri-root-only-files");
        let config = create_test_config();
        std::fs::create_dir_all(base.join("dist")).expect("dist dir should be created");
        std::fs::write(base.join("global.src.mdx"), "Global")
            .expect("global source prompt should be created");
        std::fs::write(base.join("workspace.src.mdx"), "Workspace")
            .expect("workspace source prompt should be created");

        let entries =
            collect_category_file_entries(&base, &config, "app").expect("app files should collect");
        let source_paths: Vec<_> = entries
            .iter()
            .map(|entry| entry.source_path.as_str())
            .collect();

        assert_eq!(entries.len(), 2);
        assert!(source_paths.contains(&"global.src.mdx"));
        assert!(source_paths.contains(&"workspace.src.mdx"));

        std::fs::remove_dir_all(base).expect("temp dir should be removed");
    }

    #[test]
    fn collect_project_series_stats_includes_ext_and_arch_projects() {
        let base = create_temp_dir("tnmsc-tauri-series-stats");
        let config = create_test_config();
        std::fs::create_dir_all(base.join("app").join("project-a"))
            .expect("app project dir should be created");
        std::fs::create_dir_all(base.join("ext").join("plugin-a"))
            .expect("ext project dir should be created");
        std::fs::create_dir_all(base.join("arch").join("system-a"))
            .expect("arch project dir should be created");
        std::fs::write(
            base.join("app").join("project-a").join("agt.src.mdx"),
            "App",
        )
        .expect("app project file should be created");
        std::fs::write(base.join("ext").join("plugin-a").join("agt.src.mdx"), "Ext")
            .expect("ext project file should be created");
        std::fs::write(
            base.join("arch").join("system-a").join("agt.src.mdx"),
            "Arch",
        )
        .expect("arch project file should be created");

        let mut stats = AindexStats::default();
        let mut all_ext = std::collections::HashMap::new();
        collect_project_series_stats(&base, &config, &mut stats, &mut all_ext)
            .expect("project stats should collect");

        let names: Vec<_> = stats
            .projects
            .iter()
            .map(|project| project.name.as_str())
            .collect();
        assert!(names.contains(&"project-a"));
        assert!(names.contains(&"ext/plugin-a"));
        assert!(names.contains(&"arch/system-a"));

        std::fs::remove_dir_all(base).expect("temp dir should be removed");
    }

    #[test]
    fn build_aindex_stats_counts_root_memory_prompts() {
        let base = create_temp_dir("tnmsc-tauri-root-stats");
        let config = create_test_config();
        std::fs::create_dir_all(base.join("app").join("project-a"))
            .expect("app project dir should be created");
        std::fs::create_dir_all(base.join("dist").join("app").join("project-a"))
            .expect("app dist dir should be created");
        std::fs::create_dir_all(base.join("dist")).expect("dist dir should be created");
        std::fs::write(base.join("global.src.mdx"), "Global zh")
            .expect("global source prompt should be created");
        std::fs::write(base.join("global.mdx"), "Global en")
            .expect("global english source should be created");
        std::fs::write(base.join("workspace.src.mdx"), "Workspace zh")
            .expect("workspace source prompt should be created");
        std::fs::write(base.join("workspace.mdx"), "Workspace en")
            .expect("workspace english source should be created");
        std::fs::write(
            base.join("app").join("project-a").join("agt.src.mdx"),
            "App project zh",
        )
        .expect("app project source should be created");
        std::fs::write(base.join("dist").join("global.mdx"), "Global dist")
            .expect("global dist should be created");
        std::fs::write(base.join("dist").join("workspace.mdx"), "Workspace dist")
            .expect("workspace dist should be created");
        std::fs::write(
            base.join("dist")
                .join("app")
                .join("project-a")
                .join("agt.mdx"),
            "App project dist",
        )
        .expect("app project dist should be created");

        let stats = build_aindex_stats(&base, &config).expect("stats should build");
        let app_category = stats
            .categories
            .iter()
            .find(|category| category.name == "app")
            .expect("app category should exist");

        assert_eq!(stats.total_files, 5);
        assert_eq!(stats.total_source_mdx, 3);
        assert_eq!(stats.total_translated, 3);
        assert_eq!(app_category.file_count, 5);
        assert_eq!(app_category.source_mdx_count, 3);

        std::fs::remove_dir_all(base).expect("temp dir should be removed");
    }
}
