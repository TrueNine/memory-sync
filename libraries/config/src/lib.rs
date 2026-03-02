#![deny(clippy::all)]

//! Configuration loading, merging, and validation.
//!
//! Reads `~/.aindex/.tnmsc.json` (global) and `./.tnmsc.json` (cwd),
//! merges with priority: CWD > global > defaults.

pub mod series_filter;

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use tnmsc_logger::{Logger, create_logger};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

pub const DEFAULT_CONFIG_FILE_NAME: &str = ".tnmsc.json";
pub const DEFAULT_GLOBAL_CONFIG_DIR: &str = ".aindex";

// ---------------------------------------------------------------------------
// Types — mirrors TS ConfigTypes.schema.ts
// ---------------------------------------------------------------------------

/// A source/dist path pair. Both paths are relative to the aindex project root.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct DirPair {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub src: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dist: Option<String>,
}

impl DirPair {
    fn merge(a: &Option<DirPair>, b: &Option<DirPair>) -> Option<DirPair> {
        match (a, b) {
            (None, None) => None,
            (Some(v), None) => Some(v.clone()),
            (None, Some(v)) => Some(v.clone()),
            (Some(base), Some(over)) => Some(DirPair {
                src: over.src.clone().or_else(|| base.src.clone()),
                dist: over.dist.clone().or_else(|| base.dist.clone()),
            }),
        }
    }
}

/// Aindex configuration.
/// All paths are relative to `<workspaceDir>/<name>`.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AindexConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skill: Option<DirPair>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fast_command: Option<DirPair>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sub_agent: Option<DirPair>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rule: Option<DirPair>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub global_memory: Option<DirPair>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_memory: Option<DirPair>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project: Option<DirPair>,
}

/// Shadow source project configuration (deprecated, use AindexConfig).
#[deprecated(since = "2026.10303.0", note = "Use AindexConfig instead")]
pub type ShadowSourceProjectConfig = AindexConfig;

/// Per-plugin fast command series override options.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FastCommandSeriesPluginOverride {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub include_series_prefix: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub series_separator: Option<String>,
}

/// Fast command series configuration options.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FastCommandSeriesOptions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub include_series_prefix: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plugin_overrides: Option<HashMap<String, FastCommandSeriesPluginOverride>>,
}

/// User profile information. Supports arbitrary key-value pairs.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct UserProfile {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gender: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub birthday: Option<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

/// User configuration file (.tnmsc.json).
/// All fields are optional — missing fields use default values.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UserConfigFile {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aindex: Option<AindexConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub log_level: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fast_command_series_options: Option<FastCommandSeriesOptions>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub profile: Option<UserProfile>,
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/// Result of loading a single config file.
#[derive(Debug, Clone)]
pub struct ConfigLoadResult {
    pub config: UserConfigFile,
    pub source: Option<String>,
    pub found: bool,
}

/// Result of loading and merging all configurations.
#[derive(Debug, Clone)]
pub struct MergedConfigResult {
    pub config: UserConfigFile,
    pub sources: Vec<String>,
    pub found: bool,
}

/// Validation result for global config.
#[derive(Debug, Clone)]
pub struct GlobalConfigValidationResult {
    pub valid: bool,
    pub exists: bool,
    pub errors: Vec<String>,
    pub should_exit: bool,
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

fn home_dir() -> Option<PathBuf> {
    dirs::home_dir()
}

/// Resolve `~` prefix to the user's home directory.
pub fn resolve_tilde(p: &str) -> PathBuf {
    if let Some(rest) = p.strip_prefix('~') {
        if let Some(home) = home_dir() {
            let rest = rest.strip_prefix('/').or_else(|| rest.strip_prefix('\\')).unwrap_or(rest);
            return home.join(rest);
        }
    }
    PathBuf::from(p)
}

/// Get the global config file path: `~/.aindex/.tnmsc.json`
pub fn get_global_config_path() -> PathBuf {
    match home_dir() {
        Some(home) => home.join(DEFAULT_GLOBAL_CONFIG_DIR).join(DEFAULT_CONFIG_FILE_NAME),
        None => PathBuf::from(DEFAULT_GLOBAL_CONFIG_DIR).join(DEFAULT_CONFIG_FILE_NAME),
    }
}

// ---------------------------------------------------------------------------
// Merge logic
// ---------------------------------------------------------------------------

fn merge_aindex(
    a: &Option<AindexConfig>,
    b: &Option<AindexConfig>,
) -> Option<AindexConfig> {
    match (a, b) {
        (None, None) => None,
        (Some(v), None) => Some(v.clone()),
        (None, Some(v)) => Some(v.clone()),
        (Some(base), Some(over)) => Some(AindexConfig {
            name: over.name.clone().or_else(|| base.name.clone()),
            skill: DirPair::merge(&base.skill, &over.skill),
            fast_command: DirPair::merge(&base.fast_command, &over.fast_command),
            sub_agent: DirPair::merge(&base.sub_agent, &over.sub_agent),
            rule: DirPair::merge(&base.rule, &over.rule),
            global_memory: DirPair::merge(&base.global_memory, &over.global_memory),
            workspace_memory: DirPair::merge(&base.workspace_memory, &over.workspace_memory),
            project: DirPair::merge(&base.project, &over.project),
        }),
    }
}

/// Merge aindex configs (deprecated, use merge_aindex).
#[deprecated(since = "2026.10303.0", note = "Use merge_aindex instead")]
#[allow(dead_code)]
fn merge_shadow_source_project(
    a: &Option<AindexConfig>,
    b: &Option<AindexConfig>,
) -> Option<AindexConfig> {
    merge_aindex(a, b)
}

/// Merge two configs. `over` fields take priority over `base`.
pub fn merge_configs_pair(base: &UserConfigFile, over: &UserConfigFile) -> UserConfigFile {
    let merged_aindex = merge_aindex(
        &base.aindex,
        &over.aindex,
    );

    UserConfigFile {
        version: over.version.clone().or_else(|| base.version.clone()),
        workspace_dir: over.workspace_dir.clone().or_else(|| base.workspace_dir.clone()),
        aindex: merged_aindex,
        log_level: over.log_level.clone().or_else(|| base.log_level.clone()),
        fast_command_series_options: over.fast_command_series_options.clone()
            .or_else(|| base.fast_command_series_options.clone()),
        profile: over.profile.clone().or_else(|| base.profile.clone()),
    }
}

/// Merge a list of configs. First has highest priority, last has lowest.
fn merge_configs(configs: &[UserConfigFile]) -> UserConfigFile {
    if configs.is_empty() {
        return UserConfigFile::default();
    }
    if configs.len() == 1 {
        return configs[0].clone();
    }
    // Reverse: merge from lowest to highest priority
    let mut result = UserConfigFile::default();
    for config in configs.iter().rev() {
        result = merge_configs_pair(&result, config);
    }
    result
}

// ---------------------------------------------------------------------------
// ConfigLoader
// ---------------------------------------------------------------------------

/// Options for ConfigLoader.
#[derive(Debug, Clone, Default)]
pub struct ConfigLoaderOptions {
    pub config_file_name: Option<String>,
    pub search_paths: Vec<String>,
    pub search_cwd: Option<bool>,
    pub search_global: Option<bool>,
}

/// ConfigLoader handles discovery and loading of user configuration files.
///
/// Search order (first found wins at each level):
/// 1. Custom search paths (highest priority)
/// 2. CWD: `./.tnmsc.json`
/// 3. Global: `~/.aindex/.tnmsc.json` (lowest priority)
///
/// Configurations are merged with earlier sources having higher priority.
pub struct ConfigLoader {
    config_file_name: String,
    search_cwd: bool,
    search_global: bool,
    custom_search_paths: Vec<String>,
    logger: Logger,
}

impl ConfigLoader {
    pub fn new(options: ConfigLoaderOptions) -> Self {
        Self {
            config_file_name: options.config_file_name
                .unwrap_or_else(|| DEFAULT_CONFIG_FILE_NAME.to_string()),
            search_cwd: options.search_cwd.unwrap_or(true),
            search_global: options.search_global.unwrap_or(true),
            custom_search_paths: options.search_paths,
            logger: create_logger("ConfigLoader", None),
        }
    }

    pub fn with_defaults() -> Self {
        Self::new(ConfigLoaderOptions::default())
    }

    /// Get the list of config file paths to search.
    pub fn get_search_paths(&self, cwd: &Path) -> Vec<PathBuf> {
        let mut paths = Vec::new();

        // Custom search paths first (highest priority)
        for p in &self.custom_search_paths {
            paths.push(resolve_tilde(p));
        }

        // CWD config
        if self.search_cwd {
            paths.push(cwd.join(&self.config_file_name));
        }

        // Global config (lowest priority)
        if self.search_global {
            paths.push(get_global_config_path());
        }

        paths
    }

    /// Load a single config file.
    pub fn load_from_file(&self, file_path: &Path) -> ConfigLoadResult {
        let resolved = if file_path.starts_with("~") {
            resolve_tilde(&file_path.to_string_lossy())
        } else {
            file_path.to_path_buf()
        };

        if !resolved.exists() {
            return ConfigLoadResult {
                config: UserConfigFile::default(),
                source: None,
                found: false,
            };
        }

        match fs::read_to_string(&resolved) {
            Ok(content) => match self.parse_config(&content, &resolved) {
                Ok(config) => {
                    self.logger.debug(
                        Value::String("loaded".into()),
                        Some(serde_json::json!({"source": resolved.to_string_lossy()})),
                    );
                    ConfigLoadResult {
                        config,
                        source: Some(resolved.to_string_lossy().into_owned()),
                        found: true,
                    }
                }
                Err(_) => ConfigLoadResult {
                    config: UserConfigFile::default(),
                    source: None,
                    found: false,
                },
            },
            Err(e) => {
                self.logger.warn(
                    Value::String("load failed".into()),
                    Some(serde_json::json!({
                        "path": resolved.to_string_lossy(),
                        "error": e.to_string()
                    })),
                );
                ConfigLoadResult {
                    config: UserConfigFile::default(),
                    source: None,
                    found: false,
                }
            }
        }
    }

    /// Load and merge all config files.
    pub fn load(&self, cwd: &Path) -> MergedConfigResult {
        let search_paths = self.get_search_paths(cwd);
        let mut loaded: Vec<ConfigLoadResult> = Vec::new();

        for path in &search_paths {
            let result = self.load_from_file(path);
            if result.found {
                loaded.push(result);
            }
        }

        let configs: Vec<UserConfigFile> = loaded.iter().map(|r| r.config.clone()).collect();
        let merged = merge_configs(&configs);
        let sources: Vec<String> = loaded.iter()
            .filter_map(|r| r.source.clone())
            .collect();

        MergedConfigResult {
            config: merged,
            sources,
            found: !loaded.is_empty(),
        }
    }

    fn parse_config(&self, content: &str, file_path: &Path) -> Result<UserConfigFile, String> {
        let parsed: Value = serde_json::from_str(content)
            .map_err(|e| format!("Invalid JSON in {}: {}", file_path.display(), e))?;

        if !parsed.is_object() {
            return Err(format!("Config must be a JSON object in {}", file_path.display()));
        }

        // Deserialize with serde — invalid fields are silently ignored (like Zod's safeParse)
        match serde_json::from_value::<UserConfigFile>(parsed.clone()) {
            Ok(config) => Ok(config),
            Err(e) => {
                self.logger.warn(
                    Value::String("validation warnings".into()),
                    Some(serde_json::json!({
                        "path": file_path.to_string_lossy(),
                        "error": e.to_string()
                    })),
                );
                // Fallback: try to extract what we can
                Ok(serde_json::from_value::<UserConfigFile>(Value::Object(Default::default()))
                    .unwrap_or_default())
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Convenience functions
// ---------------------------------------------------------------------------

/// Load user configuration using default loader.
pub fn load_user_config(cwd: &Path) -> MergedConfigResult {
    ConfigLoader::with_defaults().load(cwd)
}

// ---------------------------------------------------------------------------
// Config file management
// ---------------------------------------------------------------------------

/// Write a config file with pretty JSON formatting.
pub fn write_config(path: &Path, config: &UserConfigFile, logger: &Logger) {
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            let _ = fs::create_dir_all(parent);
        }
    }

    match serde_json::to_string_pretty(config) {
        Ok(json) => {
            let content = format!("{}\n", json);
            match fs::write(path, content) {
                Ok(()) => {
                    logger.info(
                        Value::String("global config created".into()),
                        Some(serde_json::json!({"path": path.to_string_lossy()})),
                    );
                }
                Err(e) => {
                    logger.warn(
                        Value::String("failed to write config".into()),
                        Some(serde_json::json!({
                            "path": path.to_string_lossy(),
                            "error": e.to_string()
                        })),
                    );
                }
            }
        }
        Err(e) => {
            logger.warn(
                Value::String("failed to serialize config".into()),
                Some(serde_json::json!({"error": e.to_string()})),
            );
        }
    }
}

/// Compute SHA-256 hex digest of file contents.
fn sha256_file(path: &Path) -> Option<String> {
    let data = fs::read(path).ok()?;
    let mut hasher = Sha256::new();
    hasher.update(&data);
    Some(format!("{:x}", hasher.finalize()))
}

/// Check if a path is a symlink.
fn is_symlink(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
}

/// Read the target of a symlink.
fn read_symlink_target(path: &Path) -> Option<PathBuf> {
    fs::read_link(path).ok()
}

/// Ensure a local config file is linked (symlink preferred) to the global config.
///
/// On every run:
/// - If local is a correct symlink → no-op
/// - If local is a stale symlink → delete and recreate
/// - If local is a regular file with different content → sync back to global, then recreate link
/// - If local is a regular file with same content → delete and recreate link
///
/// Falls back to a file copy when symlink creation fails.
pub fn ensure_config_link(local_path: &Path, global_path: &Path, logger: &Logger) {
    if !global_path.exists() {
        return;
    }

    if local_path.exists() || is_symlink(local_path) {
        if is_symlink(local_path) {
            if let Some(target) = read_symlink_target(local_path) {
                // Canonicalize for comparison
                let target_canon = fs::canonicalize(&target).unwrap_or(target);
                let global_canon = fs::canonicalize(global_path)
                    .unwrap_or_else(|_| global_path.to_path_buf());
                if target_canon == global_canon {
                    return; // correct symlink, no-op
                }
            }
            // stale symlink — delete
            let _ = fs::remove_file(local_path);
        } else {
            // Regular file — check content hash
            let local_hash = sha256_file(local_path);
            let global_hash = sha256_file(global_path);
            if local_hash != global_hash {
                // local differs: sync back to global
                let _ = fs::copy(local_path, global_path);
                logger.debug(
                    Value::String("synced local config back to global".into()),
                    Some(serde_json::json!({
                        "src": local_path.to_string_lossy(),
                        "dest": global_path.to_string_lossy()
                    })),
                );
            }
            let _ = fs::remove_file(local_path);
        }
    }

    // Try symlink first
    #[cfg(unix)]
    let symlink_result = std::os::unix::fs::symlink(global_path, local_path);
    #[cfg(windows)]
    let symlink_result = std::os::windows::fs::symlink_file(global_path, local_path);

    match symlink_result {
        Ok(()) => {
            logger.debug(
                Value::String("linked config".into()),
                Some(serde_json::json!({
                    "link": local_path.to_string_lossy(),
                    "target": global_path.to_string_lossy()
                })),
            );
        }
        Err(_) => {
            // Fallback: copy
            match fs::copy(global_path, local_path) {
                Ok(_) => {
                    logger.warn(
                        Value::String("symlink unavailable, copied config (auto-sync disabled)".into()),
                        Some(serde_json::json!({"dest": local_path.to_string_lossy()})),
                    );
                }
                Err(e) => {
                    logger.warn(
                        Value::String("failed to link or copy config".into()),
                        Some(serde_json::json!({
                            "path": local_path.to_string_lossy(),
                            "error": e.to_string()
                        })),
                    );
                }
            }
        }
    }
}

/// Ensure the aindex project directory has a `.tnmsc.json` symlink
/// pointing to the global config.
pub fn ensure_aindex_config_link(aindex_dir: &str, logger: &Logger) {
    let resolved = resolve_tilde(aindex_dir);
    if !resolved.exists() {
        return;
    }
    let global_path = get_global_config_path();
    let config_path = resolved.join(DEFAULT_CONFIG_FILE_NAME);
    ensure_config_link(&config_path, &global_path, logger);
}

/// Ensure the shadow source project directory has a `.tnmsc.json` symlink
/// pointing to the global config (deprecated, use ensure_aindex_config_link).
#[deprecated(since = "2026.10303.0", note = "Use ensure_aindex_config_link instead")]
#[allow(dead_code)]
pub fn ensure_shadow_project_config_link(shadow_project_dir: &str, logger: &Logger) {
    ensure_aindex_config_link(shadow_project_dir, logger);
}

/// Validate global config file strictly.
///
/// - If config doesn't exist: create default config, log warn, continue
/// - If config is invalid: delete and recreate, log error, return should_exit=true
pub fn validate_and_ensure_global_config(
    default_config: &UserConfigFile,
) -> GlobalConfigValidationResult {
    let logger = create_logger("ConfigLoader", None);
    let config_path = get_global_config_path();

    if !config_path.exists() {
        logger.warn(
            Value::String("global config not found, creating default config".into()),
            Some(serde_json::json!({"path": config_path.to_string_lossy()})),
        );
        write_config(&config_path, default_config, &logger);
        return GlobalConfigValidationResult {
            valid: true,
            exists: false,
            errors: vec![],
            should_exit: false,
        };
    }

    // Try to read
    let content = match fs::read_to_string(&config_path) {
        Ok(c) => c,
        Err(e) => {
            let msg = format!("Failed to read config: {}", e);
            logger.error(
                Value::String("failed to read global config".into()),
                Some(serde_json::json!({
                    "path": config_path.to_string_lossy(),
                    "error": e.to_string()
                })),
            );
            return recreate_config_and_exit(&config_path, default_config, &logger, vec![msg]);
        }
    };

    // Try to parse JSON
    let parsed: Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(e) => {
            let msg = format!("Invalid JSON: {}", e);
            logger.error(
                Value::String("invalid JSON in global config".into()),
                Some(serde_json::json!({
                    "path": config_path.to_string_lossy(),
                    "error": e.to_string()
                })),
            );
            return recreate_config_and_exit(&config_path, default_config, &logger, vec![msg]);
        }
    };

    // Must be an object
    if !parsed.is_object() {
        logger.error(
            Value::String("global config must be a JSON object".into()),
            Some(serde_json::json!({"path": config_path.to_string_lossy()})),
        );
        return recreate_config_and_exit(
            &config_path,
            default_config,
            &logger,
            vec!["Config must be a JSON object".into()],
        );
    }

    // Try to deserialize
    if let Err(e) = serde_json::from_value::<UserConfigFile>(parsed) {
        let msg = format!("Config validation error: {}", e);
        logger.error(
            Value::String("config validation error".into()),
            Some(serde_json::json!({
                "path": config_path.to_string_lossy(),
                "error": e.to_string()
            })),
        );
        return recreate_config_and_exit(&config_path, default_config, &logger, vec![msg]);
    }

    GlobalConfigValidationResult {
        valid: true,
        exists: true,
        errors: vec![],
        should_exit: false,
    }
}

fn recreate_config_and_exit(
    config_path: &Path,
    default_config: &UserConfigFile,
    logger: &Logger,
    errors: Vec<String>,
) -> GlobalConfigValidationResult {
    if let Err(_) = fs::remove_file(config_path) {
        logger.warn(
            Value::String("failed to delete invalid config".into()),
            Some(serde_json::json!({"path": config_path.to_string_lossy()})),
        );
    } else {
        logger.info(
            Value::String("deleted invalid config".into()),
            Some(serde_json::json!({"path": config_path.to_string_lossy()})),
        );
    }

    write_config(config_path, default_config, logger);
    logger.error(
        Value::String("recreated default config, please review and restart".into()),
        Some(serde_json::json!({"path": config_path.to_string_lossy()})),
    );

    GlobalConfigValidationResult {
        valid: false,
        exists: true,
        errors,
        should_exit: true,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_tilde() {
        let resolved = resolve_tilde("~/test/path");
        if let Some(home) = home_dir() {
            assert_eq!(resolved, home.join("test").join("path"));
        }
    }

    #[test]
    fn test_resolve_tilde_no_tilde() {
        let resolved = resolve_tilde("/absolute/path");
        assert_eq!(resolved, PathBuf::from("/absolute/path"));
    }

    #[test]
    fn test_user_config_file_default() {
        let config = UserConfigFile::default();
        assert!(config.version.is_none());
        assert!(config.workspace_dir.is_none());
        assert!(config.aindex.is_none());
        assert!(config.log_level.is_none());
    }

    #[test]
    fn test_user_config_file_deserialize() {
        let json = r#"{
            "workspaceDir": "~/myworkspace",
            "logLevel": "debug"
        }"#;
        let config: UserConfigFile = serde_json::from_str(json).unwrap();
        assert_eq!(config.workspace_dir.as_deref(), Some("~/myworkspace"));
        assert_eq!(config.log_level.as_deref(), Some("debug"));
    }

    #[test]
    fn test_user_config_file_deserialize_with_aindex() {
        let json = r#"{
            "aindex": {
                "name": "aindex",
                "skill": {"src": "src/skills", "dist": "dist/skills"},
                "fastCommand": {"src": "src/commands", "dist": "dist/commands"},
                "subAgent": {"src": "src/agents", "dist": "dist/agents"},
                "rule": {"src": "src/rules", "dist": "dist/rules"},
                "globalMemory": {"src": "app/global.cn.mdx", "dist": "dist/global.mdx"},
                "workspaceMemory": {"src": "app/workspace.cn.mdx", "dist": "dist/app/workspace.mdx"},
                "project": {"src": "app", "dist": "dist/app"}
            }
        }"#;
        let config: UserConfigFile = serde_json::from_str(json).unwrap();
        let aindex = config.aindex.unwrap();
        assert_eq!(aindex.name.as_deref(), Some("aindex"));
        assert_eq!(aindex.skill.as_ref().unwrap().src.as_deref(), Some("src/skills"));
    }

    #[test]
    fn test_user_config_file_deserialize_with_profile() {
        let json = r#"{
            "profile": {
                "name": "Zhang San",
                "username": "zhangsan",
                "gender": "male",
                "birthday": "1990-01-01",
                "customField": "custom value"
            }
        }"#;
        let config: UserConfigFile = serde_json::from_str(json).unwrap();
        let profile = config.profile.unwrap();
        assert_eq!(profile.name.as_deref(), Some("Zhang San"));
        assert_eq!(profile.extra.get("customField").and_then(|v| v.as_str()), Some("custom value"));
    }

    #[test]
    fn test_user_config_file_roundtrip() {
        let config = UserConfigFile {
            workspace_dir: Some("~/workspace".into()),
            log_level: Some("info".into()),
            ..Default::default()
        };
        let json = serde_json::to_string(&config).unwrap();
        let parsed: UserConfigFile = serde_json::from_str(&json).unwrap();
        assert_eq!(config, parsed);
    }

    #[test]
    fn test_merge_configs_empty() {
        let result = merge_configs(&[]);
        assert_eq!(result, UserConfigFile::default());
    }

    #[test]
    fn test_merge_configs_single() {
        let config = UserConfigFile {
            workspace_dir: Some("~/ws".into()),
            ..Default::default()
        };
        let result = merge_configs(&[config.clone()]);
        assert_eq!(result, config);
    }

    #[test]
    fn test_merge_configs_priority() {
        let cwd_config = UserConfigFile {
            workspace_dir: Some("~/cwd-workspace".into()),
            log_level: Some("debug".into()),
            ..Default::default()
        };
        let global_config = UserConfigFile {
            workspace_dir: Some("~/global-workspace".into()),
            log_level: Some("info".into()),
            aindex: Some(AindexConfig {
                name: Some("global-aindex".into()),
                ..Default::default()
            }),
            ..Default::default()
        };

        // cwd_config is first (highest priority)
        let result = merge_configs(&[cwd_config, global_config]);
        assert_eq!(result.workspace_dir.as_deref(), Some("~/cwd-workspace"));
        assert_eq!(result.log_level.as_deref(), Some("debug"));
        assert_eq!(
            result.aindex.as_ref().and_then(|s| s.name.as_deref()),
            Some("global-aindex")
        );
    }

    #[test]
    fn test_merge_aindex_deep() {
        let cwd_config = UserConfigFile {
            aindex: Some(AindexConfig {
                name: Some("cwd-aindex".into()),
                skill: Some(DirPair {
                    src: Some("custom/skills".into()),
                    dist: Some("custom/dist/skills".into()),
                }),
                ..Default::default()
            }),
            ..Default::default()
        };
        let global_config = UserConfigFile {
            aindex: Some(AindexConfig {
                name: Some("global-aindex".into()),
                skill: Some(DirPair {
                    src: Some("src/skills".into()),
                    dist: Some("dist/skills".into()),
                }),
                fast_command: Some(DirPair {
                    src: Some("src/commands".into()),
                    dist: Some("dist/commands".into()),
                }),
                ..Default::default()
            }),
            ..Default::default()
        };

        let result = merge_configs(&[cwd_config, global_config]);
        let aindex = result.aindex.unwrap();
        assert_eq!(aindex.name.as_deref(), Some("cwd-aindex"));
        assert_eq!(aindex.skill.as_ref().unwrap().src.as_deref(), Some("custom/skills"));
        assert_eq!(aindex.fast_command.as_ref().unwrap().src.as_deref(), Some("src/commands"));
    }

    #[test]
    fn test_config_loader_search_paths() {
        let loader = ConfigLoader::with_defaults();
        let cwd = PathBuf::from("/workspace/project");
        let paths = loader.get_search_paths(&cwd);

        assert!(paths.contains(&cwd.join(DEFAULT_CONFIG_FILE_NAME)));
        assert!(paths.contains(&get_global_config_path()));
    }

    #[test]
    fn test_config_loader_search_paths_no_cwd() {
        let loader = ConfigLoader::new(ConfigLoaderOptions {
            search_cwd: Some(false),
            ..Default::default()
        });
        let cwd = PathBuf::from("/workspace/project");
        let paths = loader.get_search_paths(&cwd);

        assert!(!paths.contains(&cwd.join(DEFAULT_CONFIG_FILE_NAME)));
    }

    #[test]
    fn test_config_loader_search_paths_no_global() {
        let loader = ConfigLoader::new(ConfigLoaderOptions {
            search_global: Some(false),
            ..Default::default()
        });
        let cwd = PathBuf::from("/workspace/project");
        let paths = loader.get_search_paths(&cwd);

        assert!(!paths.contains(&get_global_config_path()));
    }

    #[test]
    fn test_config_loader_custom_search_paths() {
        let loader = ConfigLoader::new(ConfigLoaderOptions {
            search_paths: vec!["/custom/config/path".into()],
            ..Default::default()
        });
        let cwd = PathBuf::from("/workspace/project");
        let paths = loader.get_search_paths(&cwd);

        assert_eq!(paths[0], PathBuf::from("/custom/config/path"));
    }

    #[test]
    fn test_config_loader_load_nonexistent() {
        let loader = ConfigLoader::with_defaults();
        let result = loader.load_from_file(Path::new("/nonexistent/.tnmsc.json"));
        assert!(!result.found);
        assert!(result.source.is_none());
    }

    #[test]
    fn test_dir_pair_merge() {
        let a = Some(DirPair { src: Some("a-src".into()), dist: Some("a-dist".into()) });
        let b = Some(DirPair { src: Some("b-src".into()), dist: None });
        let merged = DirPair::merge(&a, &b).unwrap();
        assert_eq!(merged.src.as_deref(), Some("b-src"));
        assert_eq!(merged.dist.as_deref(), Some("a-dist"));
    }

    #[test]
    fn test_global_config_path() {
        let path = get_global_config_path();
        let path_str = path.to_string_lossy();
        assert!(path_str.contains(DEFAULT_GLOBAL_CONFIG_DIR));
        assert!(path_str.contains(DEFAULT_CONFIG_FILE_NAME));
    }
}


// ===========================================================================
// NAPI binding layer (only compiled with --features napi)
// ===========================================================================

#[cfg(feature = "napi")]
mod napi_binding {
    use napi_derive::napi;
    use super::*;

    /// Load and merge user configuration from the given cwd directory.
    /// Returns the merged config as a JSON string.
    #[napi]
    pub fn load_user_config(cwd: String) -> napi::Result<String> {
        let path = std::path::Path::new(&cwd);
        let result = ConfigLoader::with_defaults().load(path);
        serde_json::to_string(&result.config)
            .map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    /// Get the global config file path (~/.aindex/.tnmsc.json).
    #[napi]
    pub fn get_global_config_path_str() -> String {
        get_global_config_path().to_string_lossy().into_owned()
    }

    /// Merge two config JSON strings. `over` fields take priority over `base`.
    #[napi]
    pub fn merge_configs(base_json: String, over_json: String) -> napi::Result<String> {
        let base: UserConfigFile = serde_json::from_str(&base_json)
            .map_err(|e| napi::Error::from_reason(format!("base: {e}")))?;
        let over: UserConfigFile = serde_json::from_str(&over_json)
            .map_err(|e| napi::Error::from_reason(format!("over: {e}")))?;
        let merged = merge_configs_pair(&base, &over);
        serde_json::to_string(&merged)
            .map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    /// Load config from a specific file path. Returns JSON string or null if not found.
    #[napi]
    pub fn load_config_from_file(file_path: String) -> napi::Result<Option<String>> {
        let loader = ConfigLoader::with_defaults();
        let result = loader.load_from_file(std::path::Path::new(&file_path));
        if !result.found {
            return Ok(None);
        }
        let json = serde_json::to_string(&result.config)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        Ok(Some(json))
    }
}
