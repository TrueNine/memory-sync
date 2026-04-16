#![deny(clippy::all)]

//! Configuration loading, merging, and validation.
//!
//! Reads only `~/.aindex/.tnmsc.json` (global),
//! then merges with defaults.

pub mod series_filter;

use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::diagnostic_helpers::{diagnostic, line, optional_details};
use crate::logger::{Logger, create_logger};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

pub const DEFAULT_CONFIG_FILE_NAME: &str = ".tnmsc.json";
pub const DEFAULT_GLOBAL_CONFIG_DIR: &str = ".aindex";
pub const DEFAULT_WSL_WINDOWS_USERS_ROOT: &str = "/mnt/c/Users";
pub const DEFAULT_AINDEX_DIR_NAME: &str = "aindex";
pub const DEFAULT_SKILLS_SRC_DIR: &str = "skills";
pub const DEFAULT_SKILLS_DIST_DIR: &str = "dist/skills";
pub const DEFAULT_COMMANDS_SRC_DIR: &str = "commands";
pub const DEFAULT_COMMANDS_DIST_DIR: &str = "dist/commands";
pub const DEFAULT_SUB_AGENTS_SRC_DIR: &str = "subagents";
pub const DEFAULT_SUB_AGENTS_DIST_DIR: &str = "dist/subagents";
pub const DEFAULT_RULES_SRC_DIR: &str = "rules";
pub const DEFAULT_RULES_DIST_DIR: &str = "dist/rules";
pub const DEFAULT_GLOBAL_PROMPT_SRC: &str = "global.src.mdx";
pub const DEFAULT_GLOBAL_PROMPT_DIST: &str = "dist/global.mdx";
pub const DEFAULT_WORKSPACE_PROMPT_SRC: &str = "workspace.src.mdx";
pub const DEFAULT_WORKSPACE_PROMPT_DIST: &str = "dist/workspace.mdx";
pub const DEFAULT_APP_SRC_DIR: &str = "app";
pub const DEFAULT_APP_DIST_DIR: &str = "dist/app";
pub const DEFAULT_EXT_SRC_DIR: &str = "ext";
pub const DEFAULT_EXT_DIST_DIR: &str = "dist/ext";
pub const DEFAULT_ARCH_SRC_DIR: &str = "arch";
pub const DEFAULT_ARCH_DIST_DIR: &str = "dist/arch";
pub const DEFAULT_SOFTWARES_SRC_DIR: &str = "softwares";
pub const DEFAULT_SOFTWARES_DIST_DIR: &str = "dist/softwares";

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

fn default_dir_pair(src: &str, dist: &str) -> DirPair {
  DirPair {
    src: Some(src.to_string()),
    dist: Some(dist.to_string()),
  }
}

/// Internal fixed aindex directory layout.
/// All paths are relative to `<workspaceDir>/aindex`.
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
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub softwares: Option<DirPair>,
}

pub fn build_default_aindex_config() -> AindexConfig {
  AindexConfig {
    dir: Some(DEFAULT_AINDEX_DIR_NAME.to_string()),
    skills: Some(default_dir_pair(
      DEFAULT_SKILLS_SRC_DIR,
      DEFAULT_SKILLS_DIST_DIR,
    )),
    commands: Some(default_dir_pair(
      DEFAULT_COMMANDS_SRC_DIR,
      DEFAULT_COMMANDS_DIST_DIR,
    )),
    sub_agents: Some(default_dir_pair(
      DEFAULT_SUB_AGENTS_SRC_DIR,
      DEFAULT_SUB_AGENTS_DIST_DIR,
    )),
    rules: Some(default_dir_pair(
      DEFAULT_RULES_SRC_DIR,
      DEFAULT_RULES_DIST_DIR,
    )),
    global_prompt: Some(default_dir_pair(
      DEFAULT_GLOBAL_PROMPT_SRC,
      DEFAULT_GLOBAL_PROMPT_DIST,
    )),
    workspace_prompt: Some(default_dir_pair(
      DEFAULT_WORKSPACE_PROMPT_SRC,
      DEFAULT_WORKSPACE_PROMPT_DIST,
    )),
    app: Some(default_dir_pair(DEFAULT_APP_SRC_DIR, DEFAULT_APP_DIST_DIR)),
    ext: Some(default_dir_pair(DEFAULT_EXT_SRC_DIR, DEFAULT_EXT_DIST_DIR)),
    arch: Some(default_dir_pair(
      DEFAULT_ARCH_SRC_DIR,
      DEFAULT_ARCH_DIST_DIR,
    )),
    softwares: Some(default_dir_pair(
      DEFAULT_SOFTWARES_SRC_DIR,
      DEFAULT_SOFTWARES_DIST_DIR,
    )),
  }
}

fn is_default_aindex_config(config: &AindexConfig) -> bool {
  config == &build_default_aindex_config()
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

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CodeStyleIndent {
  Tab,
  Space,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CodeStyles {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub indent: Option<CodeStyleIndent>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub tab_size: Option<u16>,
  #[serde(flatten)]
  pub extra: HashMap<String, Value>,
}

pub const DEFAULT_CODE_STYLE_TAB_SIZE: u16 = 2;

pub fn build_default_code_styles() -> CodeStyles {
  CodeStyles {
    indent: Some(CodeStyleIndent::Space),
    tab_size: Some(DEFAULT_CODE_STYLE_TAB_SIZE),
    extra: HashMap::new(),
  }
}

fn normalize_code_styles(code_styles: &Option<CodeStyles>) -> CodeStyles {
  match code_styles {
    Some(value) => {
      let mut merged = build_default_code_styles();
      merged.indent = value.indent.or(merged.indent);
      merged.tab_size = value.tab_size.or(merged.tab_size);
      merged.extra.extend(value.extra.clone());
      merged
    }
    None => build_default_code_styles(),
  }
}

fn normalize_user_config(mut config: UserConfigFile) -> UserConfigFile {
  if config.code_styles.is_some() {
    config.code_styles = Some(normalize_code_styles(&config.code_styles));
  }
  config
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum StringOrStrings {
  Single(String),
  Multiple(Vec<String>),
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WindowsWsl2Options {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub instances: Option<StringOrStrings>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WindowsOptions {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub wsl2: Option<WindowsWsl2Options>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginsConfig {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub agents_md: Option<bool>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub claude_code: Option<bool>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub codex: Option<bool>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub cursor: Option<bool>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub droid: Option<bool>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub gemini: Option<bool>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub git: Option<bool>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub jetbrains: Option<bool>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub jetbrains_code_style: Option<bool>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub kiro: Option<bool>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub opencode: Option<bool>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub qoder: Option<bool>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub readme: Option<bool>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub trae: Option<bool>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub trae_cn: Option<bool>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub vscode: Option<bool>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub warp: Option<bool>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub windsurf: Option<bool>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub zed: Option<bool>,
}

/// User configuration file (.tnmsc.json).
/// All fields are optional — missing fields use default values.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UserConfigFile {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub version: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub workspace_dir: Option<String>,
  #[serde(
    default = "build_default_aindex_config",
    skip_deserializing,
    skip_serializing_if = "is_default_aindex_config"
  )]
  pub aindex: AindexConfig,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub log_level: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub fast_command_series_options: Option<FastCommandSeriesOptions>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub profile: Option<UserProfile>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub code_styles: Option<CodeStyles>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub windows: Option<WindowsOptions>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub plugins: Option<PluginsConfig>,
}

impl Default for UserConfigFile {
  fn default() -> Self {
    Self {
      version: None,
      workspace_dir: None,
      aindex: build_default_aindex_config(),
      log_level: None,
      fast_command_series_options: None,
      profile: None,
      code_styles: None,
      windows: None,
      plugins: None,
    }
  }
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/// Result of loading a single config file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigLoadResult {
  pub config: UserConfigFile,
  pub source: Option<String>,
  pub found: bool,
}

/// Result of loading and merging all configurations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergedConfigResult {
  pub config: UserConfigFile,
  pub sources: Vec<String>,
  pub found: bool,
}

/// Validation result for global config.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalConfigValidationResult {
  pub valid: bool,
  pub exists: bool,
  pub errors: Vec<String>,
  pub should_exit: bool,
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default)]
pub struct RuntimeEnvironmentContext {
  pub is_wsl: bool,
  pub native_home_dir: Option<PathBuf>,
  pub effective_home_dir: Option<PathBuf>,
  pub selected_global_config_path: Option<PathBuf>,
  pub windows_users_root: PathBuf,
}

fn home_dir() -> Option<PathBuf> {
  dirs::home_dir()
}

fn normalize_posix_like_path(raw_path: &str) -> String {
  let replaced = raw_path.replace('\\', "/");
  let has_root = replaced.starts_with('/');
  let mut components: Vec<&str> = Vec::new();

  for component in replaced.split('/') {
    if component.is_empty() || component == "." {
      continue;
    }

    if component == ".." {
      if let Some(last_component) = components.last()
        && *last_component != ".."
      {
        components.pop();
        continue;
      }

      if !has_root {
        components.push(component);
      }
      continue;
    }

    components.push(component);
  }

  let joined = components.join("/");
  if has_root {
    if joined.is_empty() {
      "/".to_string()
    } else {
      format!("/{joined}")
    }
  } else {
    joined
  }
}

fn is_same_or_child_path(candidate_path: &str, parent_path: &str) -> bool {
  let normalized_candidate = normalize_posix_like_path(candidate_path);
  let normalized_parent = normalize_posix_like_path(parent_path);

  normalized_candidate == normalized_parent
    || normalized_candidate.starts_with(&format!("{normalized_parent}/"))
}

fn convert_windows_path_to_wsl(raw_path: &str) -> Option<PathBuf> {
  let bytes = raw_path.as_bytes();
  if bytes.len() < 3
    || !bytes[0].is_ascii_alphabetic()
    || bytes[1] != b':'
    || (bytes[2] != b'\\' && bytes[2] != b'/')
  {
    return None;
  }

  let drive_letter = char::from(bytes[0]).to_ascii_lowercase();
  let relative_path = raw_path[2..]
    .trim_start_matches(['\\', '/'])
    .replace('\\', "/");
  let base_path = format!("/mnt/{drive_letter}");

  if relative_path.is_empty() {
    Some(PathBuf::from(base_path))
  } else {
    Some(Path::new(&base_path).join(relative_path))
  }
}

fn resolve_wsl_host_home_candidate(users_root: &Path, raw_path: Option<&str>) -> Option<PathBuf> {
  let raw_path = raw_path?.trim();
  if raw_path.is_empty() {
    return None;
  }

  let normalized_users_root = normalize_posix_like_path(&users_root.to_string_lossy());
  let candidate_paths = [
    convert_windows_path_to_wsl(raw_path)
      .map(|candidate_path| normalize_posix_like_path(&candidate_path.to_string_lossy())),
    Some(normalize_posix_like_path(raw_path)),
  ];

  for candidate_path in candidate_paths.into_iter().flatten() {
    if is_same_or_child_path(&candidate_path, &normalized_users_root) {
      return Some(PathBuf::from(candidate_path));
    }
  }

  None
}

fn resolve_preferred_wsl_host_home_dirs_for(
  users_root: &Path,
  userprofile: Option<&str>,
  homedrive: Option<&str>,
  homepath: Option<&str>,
  home: Option<&str>,
) -> Vec<PathBuf> {
  let mut preferred_home_dirs: Vec<PathBuf> = Vec::new();
  let combined_home_path = match (homedrive, homepath) {
    (Some(drive), Some(home_path)) if !drive.is_empty() && !home_path.is_empty() => {
      Some(format!("{drive}{home_path}"))
    }
    _ => None,
  };

  for candidate in [
    resolve_wsl_host_home_candidate(users_root, userprofile),
    resolve_wsl_host_home_candidate(users_root, combined_home_path.as_deref()),
    resolve_wsl_host_home_candidate(users_root, home),
  ]
  .into_iter()
  .flatten()
  {
    if !preferred_home_dirs
      .iter()
      .any(|existing| existing == &candidate)
    {
      preferred_home_dirs.push(candidate);
    }
  }

  preferred_home_dirs
}

fn non_empty_env_var(name: &str) -> Option<String> {
  env::var(name).ok().filter(|value| !value.is_empty())
}

fn resolve_preferred_wsl_host_home_dirs_with_root(users_root: &Path) -> Vec<PathBuf> {
  let userprofile = non_empty_env_var("USERPROFILE");
  let homedrive = non_empty_env_var("HOMEDRIVE");
  let homepath = non_empty_env_var("HOMEPATH");
  let home = non_empty_env_var("HOME");

  resolve_preferred_wsl_host_home_dirs_for(
    users_root,
    userprofile.as_deref(),
    homedrive.as_deref(),
    homepath.as_deref(),
    home.as_deref(),
  )
}

fn global_config_home_dir(candidate_path: &Path) -> Option<PathBuf> {
  candidate_path
    .parent()
    .and_then(|parent| parent.parent())
    .map(PathBuf::from)
}

fn select_wsl_host_global_config_path_for(
  users_root: &Path,
  userprofile: Option<&str>,
  homedrive: Option<&str>,
  homepath: Option<&str>,
  home: Option<&str>,
) -> Option<PathBuf> {
  let candidates = find_wsl_host_global_config_paths_with_root(users_root);
  let preferred_home_dirs =
    resolve_preferred_wsl_host_home_dirs_for(users_root, userprofile, homedrive, homepath, home);

  if !preferred_home_dirs.is_empty() {
    for preferred_home_dir in preferred_home_dirs {
      if let Some(candidate_path) = candidates.iter().find(|candidate_path| {
        global_config_home_dir(candidate_path).as_ref() == Some(&preferred_home_dir)
      }) {
        return Some(candidate_path.clone());
      }
    }

    return None;
  }

  if candidates.len() == 1 {
    return candidates.into_iter().next();
  }

  None
}

fn select_wsl_host_global_config_path_with_root(users_root: &Path) -> Option<PathBuf> {
  let userprofile = non_empty_env_var("USERPROFILE");
  let homedrive = non_empty_env_var("HOMEDRIVE");
  let homepath = non_empty_env_var("HOMEPATH");
  let home = non_empty_env_var("HOME");

  select_wsl_host_global_config_path_for(
    users_root,
    userprofile.as_deref(),
    homedrive.as_deref(),
    homepath.as_deref(),
    home.as_deref(),
  )
}

fn build_required_wsl_config_resolution_error(users_root: &Path) -> String {
  let preferred_home_dirs = resolve_preferred_wsl_host_home_dirs_with_root(users_root);
  let candidates = find_wsl_host_global_config_paths_with_root(users_root);
  let config_lookup_pattern = format!(
    "\"{}/*/{}/{}\"",
    users_root.to_string_lossy(),
    DEFAULT_GLOBAL_CONFIG_DIR,
    DEFAULT_CONFIG_FILE_NAME
  );

  if candidates.is_empty() {
    return format!("WSL host config file not found under {config_lookup_pattern}.");
  }

  if !preferred_home_dirs.is_empty() {
    return format!(
      "WSL host config file for the current Windows user was not found under {config_lookup_pattern}."
    );
  }

  format!(
    "WSL host config file could not be matched to the current Windows user under {config_lookup_pattern}."
  )
}

fn is_wsl_runtime_for(
  os_name: &str,
  wsl_distro_name: Option<&str>,
  wsl_interop: Option<&str>,
  release: &str,
) -> bool {
  if os_name != "linux" {
    return false;
  }

  if wsl_distro_name.is_some_and(|value| !value.is_empty())
    || wsl_interop.is_some_and(|value| !value.is_empty())
  {
    return true;
  }

  release.to_lowercase().contains("microsoft")
}

pub fn is_wsl_runtime() -> bool {
  let release = fs::read_to_string("/proc/sys/kernel/osrelease").unwrap_or_default();
  let wsl_distro_name = env::var("WSL_DISTRO_NAME").ok();
  let wsl_interop = env::var("WSL_INTEROP").ok();

  is_wsl_runtime_for(
    env::consts::OS,
    wsl_distro_name.as_deref(),
    wsl_interop.as_deref(),
    &release,
  )
}

pub fn find_wsl_host_global_config_paths_with_root(users_root: &Path) -> Vec<PathBuf> {
  if !users_root.is_dir() {
    return vec![];
  }

  let mut candidates: Vec<PathBuf> = match fs::read_dir(users_root) {
    Ok(entries) => entries
      .filter_map(|entry| entry.ok())
      .filter_map(|entry| {
        let entry_path = entry.path();
        if !entry_path.is_dir() {
          return None;
        }

        let candidate_path = entry_path
          .join(DEFAULT_GLOBAL_CONFIG_DIR)
          .join(DEFAULT_CONFIG_FILE_NAME);
        if candidate_path.is_file() {
          Some(candidate_path)
        } else {
          None
        }
      })
      .collect(),
    Err(_) => vec![],
  };

  candidates.sort_by(|a, b| a.to_string_lossy().cmp(&b.to_string_lossy()));
  candidates
}

pub fn resolve_runtime_environment_with_root(users_root: PathBuf) -> RuntimeEnvironmentContext {
  let native_home_dir = home_dir();
  let is_wsl = is_wsl_runtime();
  let selected_global_config_path = if is_wsl {
    select_wsl_host_global_config_path_with_root(&users_root)
  } else {
    None
  };
  let effective_home_dir = selected_global_config_path
    .as_ref()
    .and_then(|config_path| config_path.parent().and_then(|parent| parent.parent()))
    .map(PathBuf::from)
    .or_else(|| native_home_dir.clone());

  RuntimeEnvironmentContext {
    is_wsl,
    native_home_dir,
    effective_home_dir,
    selected_global_config_path,
    windows_users_root: users_root,
  }
}

pub fn resolve_runtime_environment() -> RuntimeEnvironmentContext {
  resolve_runtime_environment_with_root(PathBuf::from(DEFAULT_WSL_WINDOWS_USERS_ROOT))
}

/// Resolve `~` prefix to the user's home directory.
pub fn resolve_tilde(p: &str) -> PathBuf {
  let runtime_environment = resolve_runtime_environment();
  if let Some(rest) = p.strip_prefix('~')
    && let Some(home) = runtime_environment
      .effective_home_dir
      .or(runtime_environment.native_home_dir)
  {
    let rest = rest
      .strip_prefix('/')
      .or_else(|| rest.strip_prefix('\\'))
      .unwrap_or(rest);
    return home.join(rest);
  }
  PathBuf::from(p)
}

pub fn resolve_workspace_dir(p: &str) -> PathBuf {
  let resolved = resolve_tilde(p);
  resolved.canonicalize().unwrap_or(resolved)
}

/// Get the global config file path: `~/.aindex/.tnmsc.json`
pub fn get_global_config_path() -> PathBuf {
  let runtime_environment = resolve_runtime_environment();

  if let Some(selected_path) = runtime_environment.selected_global_config_path {
    return selected_path;
  }

  match runtime_environment
    .effective_home_dir
    .or(runtime_environment.native_home_dir)
  {
    Some(home) => home
      .join(DEFAULT_GLOBAL_CONFIG_DIR)
      .join(DEFAULT_CONFIG_FILE_NAME),
    None => PathBuf::from(DEFAULT_GLOBAL_CONFIG_DIR).join(DEFAULT_CONFIG_FILE_NAME),
  }
}

pub fn get_required_global_config_path() -> Result<PathBuf, String> {
  let runtime_environment = resolve_runtime_environment();

  if runtime_environment.is_wsl && runtime_environment.selected_global_config_path.is_none() {
    return Err(build_required_wsl_config_resolution_error(
      &runtime_environment.windows_users_root,
    ));
  }

  Ok(get_global_config_path())
}

// ---------------------------------------------------------------------------
// Merge logic
// ---------------------------------------------------------------------------

fn merge_aindex(base: &AindexConfig, over: &AindexConfig) -> AindexConfig {
  AindexConfig {
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
    softwares: DirPair::merge(&base.softwares, &over.softwares),
  }
}

fn merge_windows(a: &Option<WindowsOptions>, b: &Option<WindowsOptions>) -> Option<WindowsOptions> {
  match (a, b) {
    (None, None) => None,
    (Some(v), None) => Some(v.clone()),
    (None, Some(v)) => Some(v.clone()),
    (Some(base), Some(over)) => Some(WindowsOptions {
      wsl2: match (&base.wsl2, &over.wsl2) {
        (None, None) => None,
        (Some(v), None) => Some(v.clone()),
        (None, Some(v)) => Some(v.clone()),
        (Some(base_wsl2), Some(over_wsl2)) => Some(WindowsWsl2Options {
          instances: over_wsl2
            .instances
            .clone()
            .or_else(|| base_wsl2.instances.clone()),
        }),
      },
    }),
  }
}

fn merge_code_styles(a: &Option<CodeStyles>, b: &Option<CodeStyles>) -> Option<CodeStyles> {
  match (a, b) {
    (None, None) => None,
    (Some(v), None) => Some(v.clone()),
    (None, Some(v)) => Some(v.clone()),
    (Some(base), Some(over)) => {
      let mut merged_extra = base.extra.clone();
      merged_extra.extend(over.extra.clone());

      Some(CodeStyles {
        indent: over.indent.or(base.indent),
        tab_size: over.tab_size.or(base.tab_size),
        extra: merged_extra,
      })
    }
  }
}

fn merge_plugins(a: &Option<PluginsConfig>, b: &Option<PluginsConfig>) -> Option<PluginsConfig> {
  match (a, b) {
    (None, None) => None,
    (Some(v), None) => Some(v.clone()),
    (None, Some(v)) => Some(v.clone()),
    (Some(base), Some(over)) => Some(PluginsConfig {
      agents_md: over.agents_md.or(base.agents_md),
      claude_code: over.claude_code.or(base.claude_code),
      codex: over.codex.or(base.codex),
      cursor: over.cursor.or(base.cursor),
      droid: over.droid.or(base.droid),
      gemini: over.gemini.or(base.gemini),
      git: over.git.or(base.git),
      jetbrains: over.jetbrains.or(base.jetbrains),
      jetbrains_code_style: over.jetbrains_code_style.or(base.jetbrains_code_style),
      kiro: over.kiro.or(base.kiro),
      opencode: over.opencode.or(base.opencode),
      qoder: over.qoder.or(base.qoder),
      readme: over.readme.or(base.readme),
      trae: over.trae.or(base.trae),
      trae_cn: over.trae_cn.or(base.trae_cn),
      vscode: over.vscode.or(base.vscode),
      warp: over.warp.or(base.warp),
      windsurf: over.windsurf.or(base.windsurf),
      zed: over.zed.or(base.zed),
    }),
  }
}

/// Merge two configs. `over` fields take priority over `base`.
pub fn merge_configs_pair(base: &UserConfigFile, over: &UserConfigFile) -> UserConfigFile {
  let merged_aindex = merge_aindex(&base.aindex, &over.aindex);
  let merged_code_styles = merge_code_styles(&base.code_styles, &over.code_styles);
  let merged_windows = merge_windows(&base.windows, &over.windows);
  let merged_plugins = merge_plugins(&base.plugins, &over.plugins);

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
    code_styles: merged_code_styles,
    windows: merged_windows,
    plugins: merged_plugins,
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

  pub fn try_get_search_paths(&self, _cwd: &Path) -> Result<Vec<PathBuf>, String> {
    let runtime_environment = resolve_runtime_environment();

    if runtime_environment.is_wsl {
      self.logger.debug(
        Value::String("wsl environment detected".into()),
        Some(serde_json::json!({
            "effectiveHomeDir": runtime_environment
                .effective_home_dir
                .as_ref()
                .map(|path| path.to_string_lossy().into_owned())
        })),
      );
    }

    let config_path = get_required_global_config_path()?;
    if runtime_environment.is_wsl {
      self.logger.debug(
        Value::String("using wsl host global config".into()),
        Some(serde_json::json!({
            "path": config_path.to_string_lossy()
        })),
      );
    }

    Ok(vec![config_path])
  }

  /// Get the list of config file paths to search.
  pub fn get_search_paths(&self, _cwd: &Path) -> Vec<PathBuf> {
    vec![get_global_config_path()]
  }

  /// Load a single config file.
  pub fn load_from_file(&self, file_path: &Path) -> Result<ConfigLoadResult, String> {
    let resolved = if file_path.starts_with("~") {
      resolve_tilde(&file_path.to_string_lossy())
    } else {
      file_path.to_path_buf()
    };

    if !resolved.exists() {
      return Ok(ConfigLoadResult {
        config: UserConfigFile::default(),
        source: None,
        found: false,
      });
    }

    match fs::read_to_string(&resolved) {
      Ok(content) => match self.parse_config(&content, &resolved) {
        Ok(config) => {
          self.logger.debug(
            Value::String("loaded".into()),
            Some(serde_json::json!({"source": resolved.to_string_lossy()})),
          );
          Ok(ConfigLoadResult {
            config: normalize_user_config(config),
            source: Some(resolved.to_string_lossy().into_owned()),
            found: true,
          })
        }
        Err(e) => Err(e),
      },
      Err(e) => {
        let message = format!(
          "Config file could not be read at {}: {}",
          resolved.display(),
          e
        );
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
        Err(message)
      }
    }
  }

  pub fn try_load(&self, cwd: &Path) -> Result<MergedConfigResult, String> {
    let search_paths = self.try_get_search_paths(cwd)?;
    let mut loaded: Vec<ConfigLoadResult> = Vec::new();

    for path in &search_paths {
      let result = self.load_from_file(path)?;
      if result.found {
        loaded.push(result);
      }
    }

    let configs: Vec<UserConfigFile> = loaded.iter().map(|r| r.config.clone()).collect();
    let merged = normalize_user_config(merge_configs(&configs));
    let sources: Vec<String> = loaded.iter().filter_map(|r| r.source.clone()).collect();

    Ok(MergedConfigResult {
      config: merged,
      sources,
      found: !loaded.is_empty(),
    })
  }

  /// Load and merge all config files.
  pub fn load(&self, cwd: &Path) -> MergedConfigResult {
    self.try_load(cwd).unwrap_or_else(|error| {
      self.logger.error(diagnostic(
        "GLOBAL_CONFIG_PATH_RESOLUTION_FAILED",
        "Failed to resolve the global config path",
        line("The runtime could not determine which global config file should be loaded."),
        Some(line(
          "Ensure the expected global config exists and retry the command.",
        )),
        None,
        optional_details(serde_json::json!({ "error": error })),
      ));

      MergedConfigResult {
        config: normalize_user_config(UserConfigFile::default()),
        sources: vec![],
        found: false,
      }
    })
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

    // Deserialize with serde — invalid fields at the root level are silently ignored,
    // but invalid nested fields (e.g. unknown plugin keys) are treated as errors.
    serde_json::from_value::<UserConfigFile>(parsed.clone()).map_err(|e| {
      format!(
        "Config validation failed for {}: {}",
        file_path.display(),
        e
      )
    })
  }
}

// ---------------------------------------------------------------------------
// Convenience functions
// ---------------------------------------------------------------------------

/// Load user configuration using default loader.
pub fn load_user_config(cwd: &Path) -> Result<MergedConfigResult, String> {
  ConfigLoader::with_defaults().try_load(cwd)
}

// ---------------------------------------------------------------------------
// Config file management
// ---------------------------------------------------------------------------

/// Write a config file with pretty JSON formatting.
pub fn write_config(path: &Path, config: &UserConfigFile, logger: &Logger) {
  if let Some(parent) = path.parent()
    && !parent.exists()
  {
    let _ = fs::create_dir_all(parent);
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
  let config_path = match get_required_global_config_path() {
    Ok(path) => path,
    Err(error) => {
      logger.error(diagnostic(
        "GLOBAL_CONFIG_PATH_RESOLUTION_FAILED",
        "Failed to resolve the global config path",
        line("The runtime could not determine the expected global config file location."),
        Some(line(
          "Ensure the required host config exists before retrying tnmsc.",
        )),
        None,
        optional_details(serde_json::json!({ "error": error })),
      ));
      return GlobalConfigValidationResult {
        valid: false,
        exists: false,
        errors: vec![error],
        should_exit: true,
      };
    }
  };

  if !config_path.exists() {
    logger.warn(diagnostic(
      "GLOBAL_CONFIG_MISSING_DEFAULT_CREATED",
      "Global config was missing",
      line("No global config file exists at the expected path, so a default file will be created."),
      Some(line(
        "Review the generated config if you need custom settings.",
      )),
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
      line("The global config parsed successfully, but its top-level value is not an object."),
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
  use serde_json::json;
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
  fn test_resolve_workspace_dir_canonicalizes_existing_paths() {
    let temp_dir = TempDir::new().unwrap();
    let resolved = resolve_workspace_dir(&temp_dir.path().to_string_lossy());
    assert_eq!(resolved, temp_dir.path().canonicalize().unwrap());
  }

  #[test]
  fn test_user_config_file_default() {
    let config = UserConfigFile::default();
    assert!(config.version.is_none());
    assert!(config.workspace_dir.is_none());
    assert_eq!(config.aindex, build_default_aindex_config());
    assert!(config.log_level.is_none());
    assert!(config.code_styles.is_none());
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
  fn test_user_config_file_ignores_removed_flat_aindex_fields() {
    let json = r#"{
            "skills": {"src": "src/skills", "dist": "dist/skills"},
            "commands": {"src": "src/commands", "dist": "dist/commands"},
            "subAgents": {"src": "src/agents", "dist": "dist/agents"},
            "rules": {"src": "src/rules", "dist": "dist/rules"},
            "globalPrompt": {"src": "global.src.mdx", "dist": "dist/global.mdx"},
            "workspacePrompt": {"src": "workspace.src.mdx", "dist": "dist/workspace.mdx"},
            "app": {"src": "app", "dist": "dist/app"},
            "ext": {"src": "ext", "dist": "dist/ext"},
            "arch": {"src": "arch", "dist": "dist/arch"},
            "softwares": {"src": "softwares", "dist": "dist/softwares"}
        }"#;
    let config: UserConfigFile = serde_json::from_str(json).unwrap();
    assert_eq!(
      config.aindex.skills.as_ref().unwrap().src.as_deref(),
      Some(DEFAULT_SKILLS_SRC_DIR)
    );
    assert_eq!(
      config.aindex.commands.as_ref().unwrap().src.as_deref(),
      Some(DEFAULT_COMMANDS_SRC_DIR)
    );
  }

  #[test]
  fn test_user_config_file_ignores_removed_legacy_aindex_wrapper() {
    let json = r#"{
            "aindex": {
                "skills": {"src": "src/skills", "dist": "dist/skills"},
                "commands": {"src": "src/commands", "dist": "dist/commands"}
            }
        }"#;
    let config: UserConfigFile = serde_json::from_str(json).unwrap();
    assert_eq!(
      config.aindex.skills.as_ref().unwrap().src.as_deref(),
      Some(DEFAULT_SKILLS_SRC_DIR)
    );
    assert_eq!(
      config.aindex.commands.as_ref().unwrap().src.as_deref(),
      Some(DEFAULT_COMMANDS_SRC_DIR)
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
  fn test_user_config_file_deserialize_with_code_styles() {
    let json = r#"{
            "codeStyles": {
                "indent": "space",
                "tabSize": 2,
                "lineEnding": "lf"
            }
        }"#;
    let config: UserConfigFile = serde_json::from_str(json).unwrap();
    let code_styles = config.code_styles.unwrap();

    assert_eq!(code_styles.indent, Some(CodeStyleIndent::Space));
    assert_eq!(code_styles.tab_size, Some(2));
    assert_eq!(
      code_styles.extra.get("lineEnding").and_then(|v| v.as_str()),
      Some("lf")
    );
  }

  #[test]
  fn test_user_config_file_deserialize_with_windows_wsl2_instances() {
    let json = r#"{
            "windows": {
                "wsl2": {
                    "instances": ["Ubuntu", "Debian"]
                }
            }
        }"#;
    let config: UserConfigFile = serde_json::from_str(json).unwrap();

    match config
      .windows
      .and_then(|windows| windows.wsl2)
      .and_then(|wsl2| wsl2.instances)
    {
      Some(StringOrStrings::Multiple(instances)) => {
        assert_eq!(instances, vec!["Ubuntu".to_string(), "Debian".to_string()]);
      }
      other => panic!("expected windows.wsl2.instances array, got {:?}", other),
    }
  }

  #[test]
  fn test_user_config_file_roundtrip() {
    let config = UserConfigFile {
      workspace_dir: Some("~/workspace".into()),
      log_level: Some("info".into()),
      code_styles: Some(CodeStyles {
        indent: Some(CodeStyleIndent::Space),
        tab_size: Some(2),
        extra: HashMap::new(),
      }),
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
    let result = merge_configs(std::slice::from_ref(&config));
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
      ..Default::default()
    };

    // cwd_config is first (highest priority)
    let result = merge_configs(&[cwd_config, global_config]);
    assert_eq!(result.workspace_dir.as_deref(), Some("~/cwd-workspace"));
    assert_eq!(result.log_level.as_deref(), Some("debug"));
    assert_eq!(
      result.aindex.skills.as_ref().and_then(|p| p.src.as_deref()),
      Some(DEFAULT_SKILLS_SRC_DIR)
    );
  }

  #[test]
  fn test_merge_configs_merges_windows_options() {
    let base_config = UserConfigFile {
      windows: Some(WindowsOptions {
        wsl2: Some(WindowsWsl2Options {
          instances: Some(StringOrStrings::Single("Ubuntu".into())),
        }),
      }),
      ..Default::default()
    };
    let override_config = UserConfigFile {
      log_level: Some("debug".into()),
      ..Default::default()
    };

    let merged = merge_configs_pair(&base_config, &override_config);
    match merged
      .windows
      .and_then(|windows| windows.wsl2)
      .and_then(|wsl2| wsl2.instances)
    {
      Some(StringOrStrings::Single(instance)) => assert_eq!(instance, "Ubuntu"),
      other => panic!(
        "expected merged windows.wsl2.instances value, got {:?}",
        other
      ),
    }
  }

  #[test]
  fn test_merge_configs_merges_code_styles() {
    let mut base_extra = HashMap::new();
    base_extra.insert("quoteStyle".into(), json!("single"));
    let base_config = UserConfigFile {
      code_styles: Some(CodeStyles {
        indent: Some(CodeStyleIndent::Tab),
        tab_size: Some(4),
        extra: base_extra,
      }),
      ..Default::default()
    };

    let mut override_extra = HashMap::new();
    override_extra.insert("lineEnding".into(), json!("lf"));
    let override_config = UserConfigFile {
      code_styles: Some(CodeStyles {
        indent: Some(CodeStyleIndent::Space),
        tab_size: None,
        extra: override_extra,
      }),
      ..Default::default()
    };

    let merged = merge_configs_pair(&base_config, &override_config);
    let code_styles = merged.code_styles.expect("expected merged code styles");

    assert_eq!(code_styles.indent, Some(CodeStyleIndent::Space));
    assert_eq!(code_styles.tab_size, Some(4));
    assert_eq!(
      code_styles
        .extra
        .get("quoteStyle")
        .and_then(|value| value.as_str()),
      Some("single")
    );
    assert_eq!(
      code_styles
        .extra
        .get("lineEnding")
        .and_then(|value| value.as_str()),
      Some("lf")
    );
  }

  #[test]
  fn test_normalize_user_config_leaves_code_styles_none_when_absent() {
    let config = normalize_user_config(UserConfigFile::default());
    assert!(config.code_styles.is_none());
  }

  #[test]
  fn test_normalize_user_config_merges_partial_code_styles() {
    let config = normalize_user_config(UserConfigFile {
      code_styles: Some(CodeStyles {
        indent: None,
        tab_size: Some(4),
        extra: HashMap::new(),
      }),
      ..Default::default()
    });
    let code_styles = config.code_styles.expect("expected normalized code styles");

    assert_eq!(code_styles.indent, Some(CodeStyleIndent::Space));
    assert_eq!(code_styles.tab_size, Some(4));
  }

  #[test]
  fn test_merge_configs_keeps_fixed_aindex_defaults() {
    let higher_priority = UserConfigFile {
      workspace_dir: Some("~/workspace".into()),
      ..Default::default()
    };
    let lower_priority = UserConfigFile {
      log_level: Some("info".into()),
      ..Default::default()
    };

    let result = merge_configs(&[higher_priority, lower_priority]);
    assert_eq!(result.aindex, build_default_aindex_config());
  }

  #[test]
  fn test_config_loader_search_paths() {
    let loader = ConfigLoader::with_defaults();
    let cwd = PathBuf::from("/workspace/project");
    let paths = loader.get_search_paths(&cwd);

    assert_eq!(paths, vec![get_global_config_path()]);
  }

  #[test]
  fn test_find_wsl_host_global_config_paths_with_root_sorts_candidates() {
    let temp_dir = TempDir::new().unwrap();
    let users_root = temp_dir.path().join("Users");
    let alpha_config_path = users_root.join("alpha").join(".aindex").join(".tnmsc.json");
    let bravo_config_path = users_root.join("bravo").join(".aindex").join(".tnmsc.json");

    fs::create_dir_all(alpha_config_path.parent().unwrap()).unwrap();
    fs::create_dir_all(bravo_config_path.parent().unwrap()).unwrap();
    fs::write(&alpha_config_path, "{}\n").unwrap();
    fs::write(&bravo_config_path, "{}\n").unwrap();

    let candidates = find_wsl_host_global_config_paths_with_root(&users_root);
    assert_eq!(candidates, vec![alpha_config_path, bravo_config_path]);
  }

  #[test]
  fn test_select_wsl_host_global_config_path_for_prefers_matching_userprofile() {
    let temp_dir = TempDir::new().unwrap();
    let users_root = temp_dir.path().join("Users");
    let alpha_config_path = users_root.join("alpha").join(".aindex").join(".tnmsc.json");
    let bravo_config_path = users_root.join("bravo").join(".aindex").join(".tnmsc.json");

    fs::create_dir_all(alpha_config_path.parent().unwrap()).unwrap();
    fs::create_dir_all(bravo_config_path.parent().unwrap()).unwrap();
    fs::write(&alpha_config_path, "{}\n").unwrap();
    fs::write(&bravo_config_path, "{}\n").unwrap();

    let selected = select_wsl_host_global_config_path_for(
      &users_root,
      Some(&users_root.join("bravo").to_string_lossy()),
      None,
      None,
      None,
    );

    assert_eq!(selected, Some(bravo_config_path));
  }

  #[test]
  fn test_select_wsl_host_global_config_path_for_rejects_other_windows_profile() {
    let temp_dir = TempDir::new().unwrap();
    let users_root = temp_dir.path().join("Users");
    let alpha_config_path = users_root.join("alpha").join(".aindex").join(".tnmsc.json");

    fs::create_dir_all(alpha_config_path.parent().unwrap()).unwrap();
    fs::write(&alpha_config_path, "{}\n").unwrap();

    let selected = select_wsl_host_global_config_path_for(
      &users_root,
      Some(&users_root.join("bravo").to_string_lossy()),
      None,
      None,
      None,
    );

    assert_eq!(selected, None);
  }

  #[test]
  fn test_is_wsl_runtime_for_detects_linux_wsl_inputs() {
    assert!(is_wsl_runtime_for("linux", Some("Ubuntu"), None, ""));
    assert!(is_wsl_runtime_for(
      "linux",
      None,
      Some("/run/WSL/12_interop"),
      ""
    ));
    assert!(is_wsl_runtime_for(
      "linux",
      None,
      None,
      "5.15.167.4-microsoft-standard-WSL2"
    ));
    assert!(!is_wsl_runtime_for("windows", Some("Ubuntu"), None, ""));
  }

  #[test]
  fn test_config_loader_load_nonexistent() {
    let loader = ConfigLoader::with_defaults();
    let result = loader
      .load_from_file(Path::new("/nonexistent/.tnmsc.json"))
      .unwrap();
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
    let result = super::load_user_config(path).map_err(napi::Error::from_reason)?;
    serde_json::to_string(&result.config).map_err(|e| napi::Error::from_reason(e.to_string()))
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
    let result = loader
      .load_from_file(std::path::Path::new(&file_path))
      .map_err(|e| napi::Error::from_reason(e))?;
    if !result.found {
      return Ok(None);
    }
    let json =
      serde_json::to_string(&result.config).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    Ok(Some(json))
  }

  fn node_platform() -> &'static str {
    match std::env::consts::OS {
      "windows" => "win32",
      "macos" => "darwin",
      other => other,
    }
  }

  #[napi(js_name = "resolveRuntimeEnvironment")]
  pub fn resolve_runtime_environment_binding() -> napi::Result<String> {
    let ctx = super::resolve_runtime_environment();
    let platform = node_platform().to_string();
    let is_wsl = ctx.is_wsl;
    let native_home_dir = ctx
      .native_home_dir
      .as_ref()
      .map(|p| p.to_string_lossy().into_owned())
      .unwrap_or_else(|| ".".to_string());
    let effective_home_dir = ctx
      .effective_home_dir
      .as_ref()
      .map(|p| p.to_string_lossy().into_owned())
      .unwrap_or_else(|| native_home_dir.clone());

    let global_config_candidates: Vec<String> = if is_wsl {
      super::find_wsl_host_global_config_paths_with_root(&ctx.windows_users_root)
        .into_iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
    } else {
      Vec::new()
    };

    let selected_global_config_path: Option<String> = ctx
      .selected_global_config_path
      .as_ref()
      .map(|p| p.to_string_lossy().into_owned());

    let wsl_host_home_dir: Option<String> = if is_wsl {
      Some(effective_home_dir.clone())
    } else {
      None
    };

    let windows_users_root = ctx.windows_users_root.to_string_lossy().into_owned();

    let mut expanded_env: HashMap<String, String> = std::env::vars().collect();
    if effective_home_dir != native_home_dir {
      expanded_env.insert("HOME".to_string(), effective_home_dir.clone());
      expanded_env.insert("USERPROFILE".to_string(), effective_home_dir.clone());
      if effective_home_dir.starts_with("/mnt/") {
        let rest = &effective_home_dir[5..];
        if let Some((drive, path)) = rest.split_once('/') {
          if drive.len() == 1 {
            expanded_env.insert(
              "HOMEDRIVE".to_string(),
              format!("{}:", drive.to_uppercase()),
            );
            expanded_env.insert(
              "HOMEPATH".to_string(),
              format!("\\{}", path.replace('/', "\\")),
            );
          }
        }
      }
    }

    #[derive(Serialize)]
    #[allow(non_snake_case)]
    struct RuntimeEnvironmentJson {
      platform: String,
      isWsl: bool,
      nativeHomeDir: String,
      effectiveHomeDir: String,
      globalConfigCandidates: Vec<String>,
      #[serde(skip_serializing_if = "Option::is_none")]
      selectedGlobalConfigPath: Option<String>,
      #[serde(skip_serializing_if = "Option::is_none")]
      wslHostHomeDir: Option<String>,
      windowsUsersRoot: String,
      expandedEnv: HashMap<String, String>,
    }

    let json = RuntimeEnvironmentJson {
      platform,
      isWsl: is_wsl,
      nativeHomeDir: native_home_dir,
      effectiveHomeDir: effective_home_dir,
      globalConfigCandidates: global_config_candidates,
      selectedGlobalConfigPath: selected_global_config_path,
      wslHostHomeDir: wsl_host_home_dir,
      windowsUsersRoot: windows_users_root,
      expandedEnv: expanded_env,
    };

    serde_json::to_string(&json).map_err(|e| napi::Error::from_reason(e.to_string()))
  }

  #[napi(js_name = "getEffectiveHomeDir")]
  pub fn get_effective_home_dir_binding() -> napi::Result<String> {
    let ctx = super::resolve_runtime_environment();
    let home = ctx
      .effective_home_dir
      .or(ctx.native_home_dir)
      .map(|p| p.to_string_lossy().into_owned())
      .unwrap_or_else(|| ".".to_string());
    Ok(home)
  }

  #[napi(js_name = "getGlobalConfigPath")]
  pub fn get_global_config_path_binding() -> napi::Result<String> {
    Ok(
      super::get_global_config_path()
        .to_string_lossy()
        .into_owned(),
    )
  }

  #[napi(js_name = "getRequiredGlobalConfigPath")]
  pub fn get_required_global_config_path_binding() -> napi::Result<String> {
    super::get_required_global_config_path()
      .map(|p| p.to_string_lossy().into_owned())
      .map_err(napi::Error::from_reason)
  }

  #[napi(js_name = "isWslRuntime")]
  pub fn is_wsl_runtime_binding() -> bool {
    super::is_wsl_runtime()
  }
}
