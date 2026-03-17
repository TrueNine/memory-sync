#![deny(clippy::all)]

//! Configuration loading, merging, and validation.
//!
//! Reads only `~/.aindex/.tnmsc.json` (global),
//! then merges with defaults.

pub mod series_filter;

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::diagnostic_helpers::{diagnostic, line, optional_details};
use tnmsc_logger::{Logger, create_logger};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

pub const DEFAULT_CONFIG_FILE_NAME: &str = ".tnmsc.json";
pub const DEFAULT_GLOBAL_CONFIG_DIR: &str = ".aindex";

fn path_details(path: &Path) -> Option<serde_json::Map<String, Value>> {
    optional_details(serde_json::json!({
        "path": path.to_string_lossy()
    }))
}

fn path_error_details(path: &Path, error: &str) -> Option<serde_json::Map<String, Value>> {
    optional_details(serde_json::json!({
        "path": path.to_string_lossy(),
        "error": error
    }))
}

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
    pub dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skills: Option<DirPair>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub commands: Option<DirPair>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sub_agents: Option<DirPair>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rules: Option<DirPair>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub global_prompt: Option<DirPair>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_prompt: Option<DirPair>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub app: Option<DirPair>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ext: Option<DirPair>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub arch: Option<DirPair>,
}

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
            let rest = rest
                .strip_prefix('/')
                .or_else(|| rest.strip_prefix('\\'))
                .unwrap_or(rest);
            return home.join(rest);
        }
    }
    PathBuf::from(p)
}

/// Get the global config file path: `~/.aindex/.tnmsc.json`
pub fn get_global_config_path() -> PathBuf {
    match home_dir() {
        Some(home) => home
            .join(DEFAULT_GLOBAL_CONFIG_DIR)
            .join(DEFAULT_CONFIG_FILE_NAME),
        None => PathBuf::from(DEFAULT_GLOBAL_CONFIG_DIR).join(DEFAULT_CONFIG_FILE_NAME),
    }
}

// ---------------------------------------------------------------------------
// Merge logic
// ---------------------------------------------------------------------------

fn merge_aindex(a: &Option<AindexConfig>, b: &Option<AindexConfig>) -> Option<AindexConfig> {
    match (a, b) {
        (None, None) => None,
        (Some(v), None) => Some(v.clone()),
        (None, Some(v)) => Some(v.clone()),
        (Some(base), Some(over)) => Some(AindexConfig {
            dir: over.dir.clone().or_else(|| base.dir.clone()),
            skills: DirPair::merge(&base.skills, &over.skills),
            commands: DirPair::merge(&base.commands, &over.commands),
            sub_agents: DirPair::merge(&base.sub_agents, &over.sub_agents),
            rules: DirPair::merge(&base.rules, &over.rules),
            global_prompt: DirPair::merge(&base.global_prompt, &over.global_prompt),
            workspace_prompt: DirPair::merge(&base.workspace_prompt, &over.workspace_prompt),
            app: DirPair::merge(&base.app, &over.app),
            ext: DirPair::merge(&base.ext, &over.ext),
            arch: DirPair::merge(&base.arch, &over.arch),
        }),
    }
}

/// Merge two configs. `over` fields take priority over `base`.
pub fn merge_configs_pair(base: &UserConfigFile, over: &UserConfigFile) -> UserConfigFile {
    let merged_aindex = merge_aindex(&base.aindex, &over.aindex);

    UserConfigFile {
        version: over.version.clone().or_else(|| base.version.clone()),
        workspace_dir: over
            .workspace_dir
            .clone()
            .or_else(|| base.workspace_dir.clone()),
        aindex: merged_aindex,
        log_level: over.log_level.clone().or_else(|| base.log_level.clone()),
        fast_command_series_options: over
            .fast_command_series_options
            .clone()
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
pub struct ConfigLoaderOptions {}

/// ConfigLoader handles discovery and loading of user configuration files.
///
/// The config source is fixed and unambiguous:
/// 1. Global: `~/.aindex/.tnmsc.json`
pub struct ConfigLoader {
    logger: Logger,
}

impl ConfigLoader {
    pub fn new(_options: ConfigLoaderOptions) -> Self {
        Self {
            logger: create_logger("ConfigLoader", None),
        }
    }

    pub fn with_defaults() -> Self {
        Self::new(ConfigLoaderOptions::default())
    }

    /// Get the list of config file paths to search.
    pub fn get_search_paths(&self, _cwd: &Path) -> Vec<PathBuf> {
        vec![get_global_config_path()]
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
                self.logger.warn(diagnostic(
                    "CONFIG_FILE_LOAD_FAILED",
                    "Config file could not be loaded",
                    line("The config file exists but could not be read, so it was skipped."),
                    Some(line(
                        "Check that the file exists, is readable, and is not locked.",
                    )),
                    None,
                    path_error_details(&resolved, &e.to_string()),
                ));
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
        let sources: Vec<String> = loaded.iter().filter_map(|r| r.source.clone()).collect();

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
            return Err(format!(
                "Config must be a JSON object in {}",
                file_path.display()
            ));
        }

        // Deserialize with serde — invalid fields are silently ignored (like Zod's safeParse)
        match serde_json::from_value::<UserConfigFile>(parsed.clone()) {
            Ok(config) => Ok(config),
            Err(e) => {
                self.logger.warn(diagnostic(
                    "CONFIG_FILE_VALIDATION_WARNING",
                    "Config contains invalid fields",
                    line("One or more config fields could not be deserialized, so defaults were used."),
                    Some(line("Fix the field types in the config file and retry.")),
                    None,
                    path_error_details(file_path, &e.to_string()),
                ));
                // Fallback: try to extract what we can
                Ok(
                    serde_json::from_value::<UserConfigFile>(Value::Object(Default::default()))
                        .unwrap_or_default(),
                )
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
                    logger.warn(diagnostic(
                        "CONFIG_WRITE_FAILED",
                        "Failed to write the config file",
                        line("The CLI generated config JSON but could not write it to disk."),
                        Some(line(
                            "Check that the destination directory is writable and retry.",
                        )),
                        None,
                        path_error_details(path, &e.to_string()),
                    ));
                }
            }
        }
        Err(e) => {
            logger.warn(diagnostic(
                "CONFIG_SERIALIZATION_FAILED",
                "Failed to serialize the config file",
                line("The config object could not be converted to JSON."),
                None,
                None,
                optional_details(serde_json::json!({ "error": e.to_string() })),
            ));
        }
    }
}

/// Validate global config file strictly.
///
/// - If config doesn't exist: create default config, log warn, continue
/// - If config is invalid: preserve the file, log error, return should_exit=true
pub fn validate_and_ensure_global_config(
    default_config: &UserConfigFile,
) -> GlobalConfigValidationResult {
    let logger = create_logger("ConfigLoader", None);
    let config_path = get_global_config_path();

    if !config_path.exists() {
        logger.warn(diagnostic(
            "GLOBAL_CONFIG_MISSING_DEFAULT_CREATED",
            "Global config was missing",
            line("No global config file exists at the expected path, so a default file will be created."),
            Some(line("Review the generated config if you need custom settings.")),
            None,
            path_details(&config_path),
        ));
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
            logger.error(diagnostic(
                "GLOBAL_CONFIG_READ_FAILED",
                "Failed to read the global config",
                line("The global config file exists but could not be read."),
                Some(line(
                    "Check file permissions and confirm the path points to a readable file.",
                )),
                None,
                path_error_details(&config_path, &e.to_string()),
            ));
            return preserve_invalid_config_and_exit(&config_path, &logger, vec![msg]);
        }
    };

    // Try to parse JSON
    let parsed: Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(e) => {
            let msg = format!("Invalid JSON: {}", e);
            logger.error(diagnostic(
                "GLOBAL_CONFIG_INVALID_JSON",
                "Global config contains invalid JSON",
                line("The global config file is not valid JSON."),
                Some(line("Fix the JSON syntax in the config file and retry.")),
                None,
                path_error_details(&config_path, &e.to_string()),
            ));
            return preserve_invalid_config_and_exit(&config_path, &logger, vec![msg]);
        }
    };

    // Must be an object
    if !parsed.is_object() {
        logger.error(diagnostic(
            "GLOBAL_CONFIG_NOT_OBJECT",
            "Global config must be a JSON object",
            line(
                "The global config parsed successfully, but its top-level value is not an object.",
            ),
            Some(line(
                "Replace the top-level JSON value with an object like `{}` and retry.",
            )),
            None,
            path_details(&config_path),
        ));
        return preserve_invalid_config_and_exit(
            &config_path,
            &logger,
            vec!["Config must be a JSON object".into()],
        );
    }

    // Try to deserialize
    if let Err(e) = serde_json::from_value::<UserConfigFile>(parsed) {
        let msg = format!("Config validation error: {}", e);
        logger.error(diagnostic(
            "GLOBAL_CONFIG_VALIDATION_FAILED",
            "Global config failed schema validation",
            line("The JSON shape does not match the expected config schema."),
            Some(line(
                "Fix the invalid field types or names in the config file and retry.",
            )),
            None,
            path_error_details(&config_path, &e.to_string()),
        ));
        return preserve_invalid_config_and_exit(&config_path, &logger, vec![msg]);
    }

    GlobalConfigValidationResult {
        valid: true,
        exists: true,
        errors: vec![],
        should_exit: false,
    }
}

fn preserve_invalid_config_and_exit(
    config_path: &Path,
    logger: &Logger,
    errors: Vec<String>,
) -> GlobalConfigValidationResult {
    logger.error(diagnostic(
        "GLOBAL_CONFIG_PRESERVED",
        "Invalid global config was preserved",
        line("The CLI stopped rather than overwriting the invalid global config."),
        Some(line(
            "Fix the file at the reported path and restart the command.",
        )),
        None,
        path_details(config_path),
    ));

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
    use tempfile::TempDir;

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
                "skills": {"src": "src/skills", "dist": "dist/skills"},
                "commands": {"src": "src/commands", "dist": "dist/commands"},
                "subAgents": {"src": "src/agents", "dist": "dist/agents"},
                "rules": {"src": "src/rules", "dist": "dist/rules"},
                "globalPrompt": {"src": "app/global.src.mdx", "dist": "dist/global.mdx"},
                "workspacePrompt": {"src": "app/workspace.src.mdx", "dist": "dist/workspace.mdx"},
                "app": {"src": "app", "dist": "dist/app"},
                "ext": {"src": "ext", "dist": "dist/ext"},
                "arch": {"src": "arch", "dist": "dist/arch"}
            }
        }"#;
        let config: UserConfigFile = serde_json::from_str(json).unwrap();
        let aindex = config.aindex.unwrap();
        assert_eq!(
            aindex.skills.as_ref().unwrap().src.as_deref(),
            Some("src/skills")
        );
        assert_eq!(
            aindex.commands.as_ref().unwrap().src.as_deref(),
            Some("src/commands")
        );
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
        assert_eq!(
            profile.extra.get("customField").and_then(|v| v.as_str()),
            Some("custom value")
        );
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
                skills: Some(DirPair {
                    src: Some("global/skills".into()),
                    dist: Some("global/dist/skills".into()),
                }),
                ..Default::default()
            }),
            ..Default::default()
        };

        // cwd_config is first (highest priority)
        let result = merge_configs(&[cwd_config, global_config]);
        assert_eq!(result.workspace_dir.as_deref(), Some("~/cwd-workspace"));
        assert_eq!(result.log_level.as_deref(), Some("debug"));
        assert_eq!(
            result
                .aindex
                .as_ref()
                .and_then(|s| s.skills.as_ref())
                .and_then(|p| p.src.as_deref()),
            Some("global/skills")
        );
    }

    #[test]
    fn test_merge_aindex_deep() {
        let cwd_config = UserConfigFile {
            aindex: Some(AindexConfig {
                skills: Some(DirPair {
                    src: Some("custom/skills".into()),
                    dist: Some("custom/dist/skills".into()),
                }),
                ..Default::default()
            }),
            ..Default::default()
        };
        let global_config = UserConfigFile {
            aindex: Some(AindexConfig {
                skills: Some(DirPair {
                    src: Some("src/skills".into()),
                    dist: Some("dist/skills".into()),
                }),
                commands: Some(DirPair {
                    src: Some("src/commands".into()),
                    dist: Some("dist/commands".into()),
                }),
                ..Default::default()
            }),
            ..Default::default()
        };

        let result = merge_configs(&[cwd_config, global_config]);
        let aindex = result.aindex.unwrap();
        assert_eq!(
            aindex.skills.as_ref().unwrap().src.as_deref(),
            Some("custom/skills")
        );
        assert_eq!(
            aindex.commands.as_ref().unwrap().src.as_deref(),
            Some("src/commands")
        );
    }

    #[test]
    fn test_config_loader_search_paths() {
        let loader = ConfigLoader::with_defaults();
        let cwd = PathBuf::from("/workspace/project");
        let paths = loader.get_search_paths(&cwd);

        assert_eq!(paths, vec![get_global_config_path()]);
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
        let a = Some(DirPair {
            src: Some("a-src".into()),
            dist: Some("a-dist".into()),
        });
        let b = Some(DirPair {
            src: Some("b-src".into()),
            dist: None,
        });
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

    #[test]
    fn test_preserve_invalid_config_and_exit_keeps_original_file() {
        let temp_dir = match TempDir::new() {
            Ok(value) => value,
            Err(error) => panic!("failed to create temp dir: {error}"),
        };
        let config_path = temp_dir.path().join(DEFAULT_CONFIG_FILE_NAME);
        let invalid_content = "{invalid-json";

        if let Err(error) = fs::write(&config_path, invalid_content) {
            panic!("failed to write invalid config fixture: {error}");
        }

        let logger = create_logger("ConfigLoaderTest", None);
        let result =
            preserve_invalid_config_and_exit(&config_path, &logger, vec!["Invalid JSON".into()]);

        assert!(!result.valid);
        assert!(result.exists);
        assert!(result.should_exit);
        assert_eq!(result.errors, vec!["Invalid JSON".to_string()]);

        let retained = match fs::read_to_string(&config_path) {
            Ok(value) => value,
            Err(error) => panic!("failed to read retained config: {error}"),
        };
        assert_eq!(retained, invalid_content);
    }
}

// ===========================================================================
// NAPI binding layer (only compiled with --features napi)
// ===========================================================================

#[cfg(feature = "napi")]
mod napi_binding {
    use super::*;
    use napi_derive::napi;

    /// Load and merge user configuration from the given cwd directory.
    /// Returns the merged config as a JSON string.
    #[napi]
    pub fn load_user_config(cwd: String) -> napi::Result<String> {
        let path = std::path::Path::new(&cwd);
        let result = ConfigLoader::with_defaults().load(path);
        serde_json::to_string(&result.config).map_err(|e| napi::Error::from_reason(e.to_string()))
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
        serde_json::to_string(&merged).map_err(|e| napi::Error::from_reason(e.to_string()))
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
