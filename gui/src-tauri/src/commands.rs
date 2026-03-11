/// Tauri commands that bridge the frontend to the `tnmsc` CLI.
///
/// Commands use the `tnmsc` crate's library API for direct in-process invocation.
/// Bridge commands (execute, dry-run, clean, plugins) still spawn a Node.js subprocess
/// internally via `tnmsc::run_bridge_command`, but the GUI no longer searches for or
/// invokes the CLI binary as a sidecar.

use std::path::{Path, PathBuf};
use std::process::Command as StdCommand;

use serde::{Deserialize, Serialize};

const PRIMARY_SOURCE_MDX_EXTENSION: &str = ".src.mdx";
const SOURCE_MDX_FILE_TYPE: &str = "sourceMdx";
const DEFAULT_AINDEX_DIR: &str = "aindex";
const DEFAULT_SKILLS_SRC_DIR: &str = "skills";
const DEFAULT_SKILLS_DIST_DIR: &str = "dist/skills";
const DEFAULT_COMMANDS_SRC_DIR: &str = "commands";
const DEFAULT_COMMANDS_DIST_DIR: &str = "dist/commands";
const DEFAULT_SUB_AGENTS_SRC_DIR: &str = "subagents";
const DEFAULT_SUB_AGENTS_DIST_DIR: &str = "dist/subagents";
const DEFAULT_RULES_SRC_DIR: &str = "rules";
const DEFAULT_RULES_DIST_DIR: &str = "dist/rules";

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
    pub timestamp: String,
    pub level: String,
    pub logger: String,
    pub payload: serde_json::Value,
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Execute the sync pipeline (default command) or dry-run.
#[tauri::command]
pub fn execute_pipeline(cwd: String, dry_run: bool) -> Result<PipelineResult, String> {
    let subcommand = if dry_run { "dry-run" } else { "execute" };
    let result = tnmsc::run_bridge_command(subcommand, Path::new(&cwd), true, &[])
        .map_err(|e| e.to_string())?;
    serde_json::from_str::<PipelineResult>(&result.stdout)
        .map_err(|e| format!("Failed to parse pipeline JSON output: {e}"))
}

/// Load the merged configuration via the tnmsc library API.
#[tauri::command]
pub fn load_config(cwd: String) -> Result<serde_json::Value, String> {
    let result = tnmsc::load_config(Path::new(&cwd))
        .map_err(|e| e.to_string())?;
    serde_json::to_value(&result.config)
        .map_err(|e| e.to_string())
}

/// List all registered plugins via the tnmsc bridge command.
#[tauri::command]
pub fn list_plugins(cwd: String) -> Result<Vec<PluginExecutionResult>, String> {
    let result = tnmsc::run_bridge_command("plugins", Path::new(&cwd), true, &[])
        .map_err(|e| e.to_string())?;
    serde_json::from_str::<Vec<PluginExecutionResult>>(&result.stdout)
        .map_err(|e| format!("Failed to parse plugins JSON output: {e}"))
}

/// Clean previously generated output files.
#[tauri::command]
pub fn clean_outputs(cwd: String, dry_run: bool) -> Result<PipelineResult, String> {
    let subcommand = if dry_run { "dry-run-clean" } else { "clean" };
    let result = tnmsc::run_bridge_command(subcommand, Path::new(&cwd), true, &[])
        .map_err(|e| e.to_string())?;
    serde_json::from_str::<PipelineResult>(&result.stdout)
        .map_err(|e| format!("Failed to parse clean JSON output: {e}"))
}

/// Get log output from a CLI bridge command.
///
/// Runs the given command via `tnmsc::run_bridge_command` in non-JSON mode and
/// parses the stderr output as log entries. Falls back to parsing stdout if
/// stderr yields no entries.
#[tauri::command]
pub fn get_logs(cwd: String, command: String) -> Result<Vec<LogEntry>, String> {
    let args: Vec<&str> = command.split_whitespace().collect();
    let subcommand = args.first().copied().unwrap_or("execute");
    let extra_args: Vec<&str> = args.iter().skip(1).copied().collect();
    let result = tnmsc::run_bridge_command(subcommand, Path::new(&cwd), false, &extra_args)
        .map_err(|e| e.to_string())?;
    // Try parsing stderr first (log output goes to stderr in non-JSON mode),
    // fall back to stdout if stderr has no parseable entries.
    let logs = parse_log_lines(&result.stderr);
    if logs.is_empty() {
        Ok(parse_log_lines(&result.stdout))
    } else {
        Ok(logs)
    }
}

/// Parse log lines from raw CLI output using JSON.
///
/// Each line is expected to be a JSON object with `$` (metadata array) and `_` (payload).
/// Format: `{"$":["timestamp","LEVEL","logger"],"_":{...payload...}}`
fn parse_log_lines(raw: &str) -> Vec<LogEntry> {
    raw.lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            let val: serde_json::Value = serde_json::from_str(trimmed).ok()?;
            let obj = val.as_object()?;
            let meta = obj.get("$")?.as_array()?;
            let timestamp = meta.first()?.as_str()?.to_string();
            let level = meta.get(1)?.as_str()?.to_string();
            let logger = meta.get(2)?.as_str()?.to_string();
            let payload = obj.get("_").cloned().unwrap_or(serde_json::Value::Null);
            Some(LogEntry { timestamp, level, logger, payload })
        })
        .collect()
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
    let aindex = config.aindex.as_ref();

    let resolve_pair = |
        pair: Option<&tnmsc::core::config::DirPair>,
        default_source: &str,
        default_translated: &str,
    | -> CategoryPaths {
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
            aindex.and_then(|value| value.skills.as_ref()),
            DEFAULT_SKILLS_SRC_DIR,
            DEFAULT_SKILLS_DIST_DIR,
        )),
        "commands" => Ok(resolve_pair(
            aindex.and_then(|value| value.commands.as_ref()),
            DEFAULT_COMMANDS_SRC_DIR,
            DEFAULT_COMMANDS_DIST_DIR,
        )),
        "agents" => Ok(resolve_pair(
            aindex.and_then(|value| value.sub_agents.as_ref()),
            DEFAULT_SUB_AGENTS_SRC_DIR,
            DEFAULT_SUB_AGENTS_DIST_DIR,
        )),
        "rules" => Ok(resolve_pair(
            aindex.and_then(|value| value.rules.as_ref()),
            DEFAULT_RULES_SRC_DIR,
            DEFAULT_RULES_DIST_DIR,
        )),
        _ => Err(format!("Unknown category: {category}")),
    }
}

/// Read and resolve the merged tnmsc config for the current working directory.
fn load_resolved_config(cwd: &str) -> Result<ResolvedConfig, String> {
    let result = tnmsc::load_config(Path::new(cwd))
        .map_err(|e| format!("Failed to load config: {e}"))?;
    let config = result.config;
    let workspace_dir = config.workspace_dir.as_deref().unwrap_or(".");
    let workspace_dir = tnmsc::core::config::resolve_tilde(workspace_dir);
    let aindex_dir = config
        .aindex
        .as_ref()
        .and_then(|value| value.dir.as_deref())
        .unwrap_or(DEFAULT_AINDEX_DIR);

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

/// Recursively collect all source prompt files under `aindex/app/`.
#[tauri::command]
pub fn list_aindex_files(cwd: String) -> Result<Vec<AindexFileEntry>, String> {
    let base = resolve_aindex_root(&cwd)?;
    let app_dir = base.join("app");
    if !app_dir.exists() {
        return Ok(vec![]);
    }
    let mut entries = Vec::new();
    collect_source_mdx(&app_dir, &base, &mut entries)
        .map_err(|e| format!("Failed to scan aindex: {e}"))?;
    entries.sort_by(|a, b| a.source_path.cmp(&b.source_path));
    Ok(entries)
}

fn collect_source_mdx(
    dir: &std::path::Path,
    base: &std::path::Path,
    out: &mut Vec<AindexFileEntry>,
) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            collect_source_mdx(&path, base, out)?;
        } else if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if has_source_mdx_extension(name) {
                let rel = path.strip_prefix(base).unwrap_or(&path);
                let source_path = rel.to_string_lossy().replace('\\', "/");
                // Determine translated path:
                // - app/global.src.mdx -> dist/global.mdx (root-level files)
                // - app/X/foo.src.mdx -> dist/app/X/foo.mdx (subdirectory files)
                let without_ext = replace_source_mdx_extension(&source_path)
                    .unwrap_or_else(|| source_path.clone());
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
                    file_type: SOURCE_MDX_FILE_TYPE.to_string(),
                });
            }
        }
    }
    Ok(())
}

/// Read a file relative to the aindex directory (resolved from config).
#[tauri::command]
pub fn read_aindex_file(cwd: String, rel_path: String) -> Result<String, String> {
    let base = resolve_aindex_root(&cwd)?;
    let path = base.join(&rel_path);
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {e}", path.display()))
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
    std::fs::write(&path, &content)
        .map_err(|e| format!("Failed to write {}: {e}", path.display()))
}

/// List source prompt files for a given category (skills, commands, agents).
/// Reads the corresponding `aindex` config field to resolve source and output directories.
#[tauri::command]
pub fn list_category_files(cwd: String, category: String) -> Result<Vec<AindexFileEntry>, String> {
    let ResolvedConfig { aindex_root: base, config } = load_resolved_config(&cwd)?;
    let paths = resolve_category_paths(&config, &category)?;
    let dist_dir = base.join(&paths.translated_rel);
    let src_dir = base.join(&paths.source_rel);

    if !src_dir.exists() {
        return Ok(vec![]);
    }

    let mut entries = Vec::new();
    // Only scan subdirectories — skip root-level files (e.g. AGENTS.md, CLAUDE.md)
    if let Ok(top_entries) = std::fs::read_dir(&src_dir) {
        for top in top_entries.flatten() {
            if top.path().is_dir() {
                collect_category_source_mdx(
                    &top.path(),
                    &src_dir,
                    &base,
                    &paths.translated_rel,
                    &dist_dir,
                    &mut entries,
                )
                    .map_err(|e| format!("Failed to scan {}: {e}", category))?;
            }
        }
    }
    entries.sort_by(|a, b| a.source_path.cmp(&b.source_path));
    Ok(entries)
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
                let rel_str = rel_from_src.to_string_lossy().replace('\\', "/")
                    .to_string();
                let rel_str = replace_source_mdx_extension(&rel_str)
                    .unwrap_or(rel_str);
                let translated_abs = dist_dir.join(&rel_str);
                let translated_path = translated_abs.strip_prefix(base)
                    .map(|p| p.to_string_lossy().replace('\\', "/"))
                    .unwrap_or_else(|_| format!("{}/{}", translated_root_rel.trim_end_matches('/'), rel_str));

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

/// Recursively count files and accumulate chars/lines.
fn stat_dir(dir: &std::path::Path) -> (u32, u64, u64, u32, u32, u32, std::collections::HashMap<String, u32>) {
    let mut file_count = 0u32;
    let mut total_chars = 0u64;
    let mut total_lines = 0u64;
    let mut source_mdx = 0u32;
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
                source_mdx += cm;
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
                if has_source_mdx_extension(name) {
                    source_mdx += 1;
                    *ext_map.entry("src.mdx".to_string()).or_default() += 1;
                } else {
                    // Extract extension
                    let ext = name.rsplit('.').next().unwrap_or("other").to_lowercase();
                    *ext_map.entry(ext).or_default() += 1;
                }
            }
        }
    }
    (file_count, total_chars, total_lines, source_mdx, resource, translated, ext_map)
}

/// Gather comprehensive statistics about the aindex project.
#[tauri::command]
pub fn get_aindex_stats(cwd: String) -> Result<AindexStats, String> {
    let ResolvedConfig { aindex_root: base, config } = load_resolved_config(&cwd)?;
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
                    stats.total_source_mdx += cm;
                    stats.total_resources += rc;
                    for (k, v) in em {
                        *all_ext.entry(k).or_default() += v;
                    }
                }
            }
        }
    }

    // Scan configured source directories for skills, commands, agents
    for cat_name in &["skills", "commands", "agents"] {
        let category_paths = resolve_category_paths(&config, cat_name)?;
        let src_dir = base.join(&category_paths.source_rel);
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
            source_mdx_count: cm,
            resource_count: rc,
            translated_count: 0,
        });
        stats.total_files += fc;
        stats.total_chars += tc;
        stats.total_lines += tl;
        stats.total_source_mdx += cm;
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
