use std::collections::{BTreeSet, HashMap, HashSet};
use std::env;
use std::fs;
use std::path::{Component, Path, PathBuf};

use globset::{Glob, GlobBuilder, GlobSet, GlobSetBuilder};
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use crate::core::{config, desk_paths};

const DEFAULT_CLEANUP_SCAN_EXCLUDE_GLOBS: [&str; 6] = [
    "**/node_modules/**",
    "**/.git/**",
    "**/.turbo/**",
    "**/.pnpm-store/**",
    "**/.yarn/**",
    "**/.next/**",
];

const EMPTY_DIRECTORY_SCAN_EXCLUDED_BASENAMES: [&str; 17] = [
    ".git",
    "node_modules",
    "dist",
    "target",
    ".next",
    ".turbo",
    "coverage",
    ".nyc_output",
    ".cache",
    ".vite",
    ".vite-temp",
    ".pnpm-store",
    ".yarn",
    ".idea",
    ".vscode",
    ".volumes",
    "volumes",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProtectionModeDto {
    Direct,
    Recursive,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProtectionRuleMatcherDto {
    Path,
    Glob,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CleanupTargetKindDto {
    File,
    Directory,
    Glob,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CleanupErrorKindDto {
    File,
    Directory,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupTargetDto {
    pub path: String,
    pub kind: CleanupTargetKindDto,
    #[serde(default)]
    pub exclude_basenames: Vec<String>,
    pub protection_mode: Option<ProtectionModeDto>,
    pub scope: Option<String>,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupDeclarationsDto {
    #[serde(default)]
    pub delete: Vec<CleanupTargetDto>,
    #[serde(default)]
    pub protect: Vec<CleanupTargetDto>,
    #[serde(default)]
    pub exclude_scan_globs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginCleanupSnapshotDto {
    pub plugin_name: String,
    #[serde(default)]
    pub outputs: Vec<String>,
    #[serde(default)]
    pub cleanup: CleanupDeclarationsDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtectedRuleDto {
    pub path: String,
    pub protection_mode: ProtectionModeDto,
    pub reason: String,
    pub source: String,
    pub matcher: Option<ProtectionRuleMatcherDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupSnapshot {
    pub workspace_dir: String,
    pub aindex_dir: Option<String>,
    #[serde(default)]
    pub project_roots: Vec<String>,
    #[serde(default)]
    pub protected_rules: Vec<ProtectedRuleDto>,
    #[serde(default)]
    pub plugin_snapshots: Vec<PluginCleanupSnapshotDto>,
    /// Glob patterns from aindex.config.ts that should be excluded from
    /// the empty-directory scanner (git-style ** patterns supported).
    #[serde(default)]
    pub empty_dir_exclude_globs: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtectedPathViolationDto {
    pub target_path: String,
    pub protected_path: String,
    pub protection_mode: ProtectionModeDto,
    pub reason: String,
    pub source: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupProtectionConflictDto {
    pub output_path: String,
    pub output_plugin: String,
    pub protected_path: String,
    pub protection_mode: ProtectionModeDto,
    pub protected_by: String,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupPlan {
    pub files_to_delete: Vec<String>,
    pub dirs_to_delete: Vec<String>,
    pub empty_dirs_to_delete: Vec<String>,
    pub violations: Vec<ProtectedPathViolationDto>,
    pub conflicts: Vec<CleanupProtectionConflictDto>,
    pub excluded_scan_globs: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupErrorDto {
    pub path: String,
    pub kind: CleanupErrorKindDto,
    pub error: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupExecutionResultDto {
    pub deleted_files: usize,
    pub deleted_dirs: usize,
    pub errors: Vec<CleanupErrorDto>,
    pub violations: Vec<ProtectedPathViolationDto>,
    pub conflicts: Vec<CleanupProtectionConflictDto>,
    pub files_to_delete: Vec<String>,
    pub dirs_to_delete: Vec<String>,
    pub empty_dirs_to_delete: Vec<String>,
    pub excluded_scan_globs: Vec<String>,
}

#[derive(Debug, Clone)]
struct CompiledProtectedRule {
    path: String,
    protection_mode: ProtectionModeDto,
    reason: String,
    source: String,
    comparison_keys: Vec<String>,
    normalized_path: String,
    specificity: usize,
}

#[derive(Debug, Clone)]
struct ProtectedDeletionGuard {
    compiled_rules: Vec<CompiledProtectedRule>,
}

struct PartitionResult {
    safe_paths: Vec<String>,
    violations: Vec<ProtectedPathViolationDto>,
}

fn resolve_home_dir() -> PathBuf {
    let runtime_environment = config::resolve_runtime_environment();
    runtime_environment
        .effective_home_dir
        .or(runtime_environment.native_home_dir)
        .unwrap_or_else(|| PathBuf::from("/"))
}

fn expand_home_path(raw_path: &str) -> PathBuf {
    if raw_path == "~" || raw_path.starts_with("~/") || raw_path.starts_with("~\\") {
        return config::resolve_tilde(raw_path);
    }
    PathBuf::from(raw_path)
}

fn normalize_path(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();

    for component in path.components() {
        match component {
            Component::Prefix(prefix) => normalized.push(prefix.as_os_str()),
            Component::RootDir => normalized.push(Path::new(std::path::MAIN_SEPARATOR_STR)),
            Component::CurDir => {}
            Component::ParentDir => {
                let popped = normalized.pop();
                if !popped && !path.is_absolute() {
                    normalized.push("..");
                }
            }
            Component::Normal(segment) => normalized.push(segment),
        }
    }

    if normalized.as_os_str().is_empty() {
        if path.is_absolute() {
            return PathBuf::from(std::path::MAIN_SEPARATOR_STR);
        }
        return PathBuf::from(".");
    }

    normalized
}

fn resolve_absolute_path(raw_path: &str) -> PathBuf {
    let expanded = expand_home_path(raw_path);
    let candidate = if expanded.is_absolute() {
        expanded
    } else {
        env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(expanded)
    };

    normalize_path(&candidate)
}

fn path_to_string(path: &Path) -> String {
    normalize_path(path).to_string_lossy().into_owned()
}

fn path_to_glob_string(path: &Path) -> String {
    path_to_string(path).replace('\\', "/")
}

fn normalize_glob_pattern(pattern: &str) -> String {
    path_to_glob_string(&resolve_absolute_path(pattern))
}

fn normalize_relative_glob_pattern(pattern: &str) -> String {
    let normalized = pattern.replace('\\', "/");
    let normalized = normalized.trim_start_matches("./");
    normalized.trim_start_matches('/').to_string()
}

fn normalize_workspace_relative_path(path: &Path, workspace_dir: &Path) -> Option<String> {
    let relative = path.strip_prefix(workspace_dir).ok()?;
    let relative = path_to_glob_string(relative);
    Some(relative.trim_start_matches('/').to_string())
}

fn normalize_for_comparison(raw_path: &str) -> String {
    let normalized = path_to_string(&resolve_absolute_path(raw_path));
    if cfg!(windows) {
        normalized.to_lowercase()
    } else {
        normalized
    }
}

fn build_comparison_keys(raw_path: &str) -> Vec<String> {
    let absolute = resolve_absolute_path(raw_path);
    let mut keys = HashSet::from([normalize_for_comparison(&path_to_string(&absolute))]);

    if let Ok(real_path) = fs::canonicalize(&absolute) {
        keys.insert(normalize_for_comparison(&path_to_string(&real_path)));
    }

    let mut collected = keys.into_iter().collect::<Vec<_>>();
    collected.sort();
    collected
}

fn is_same_or_child_path(candidate: &str, parent: &str) -> bool {
    if candidate == parent {
        return true;
    }

    let separator = std::path::MAIN_SEPARATOR;
    let prefix = if parent.ends_with(separator) {
        parent.to_string()
    } else {
        format!("{parent}{separator}")
    };

    candidate.starts_with(&prefix)
}

fn create_protected_rule(
    raw_path: &str,
    protection_mode: ProtectionModeDto,
    reason: impl Into<String>,
    source: impl Into<String>,
    matcher: Option<ProtectionRuleMatcherDto>,
) -> ProtectedRuleDto {
    ProtectedRuleDto {
        path: path_to_string(&resolve_absolute_path(raw_path)),
        protection_mode,
        reason: reason.into(),
        source: source.into(),
        matcher,
    }
}

fn compile_rule(rule: &ProtectedRuleDto) -> CompiledProtectedRule {
    let normalized_path = normalize_for_comparison(&rule.path);
    CompiledProtectedRule {
        path: path_to_string(&resolve_absolute_path(&rule.path)),
        protection_mode: rule.protection_mode,
        reason: rule.reason.clone(),
        source: rule.source.clone(),
        comparison_keys: build_comparison_keys(&rule.path),
        specificity: normalized_path
            .trim_end_matches(std::path::MAIN_SEPARATOR)
            .len(),
        normalized_path,
    }
}

fn dedupe_and_compile_rules(rules: &[ProtectedRuleDto]) -> Vec<CompiledProtectedRule> {
    let mut compiled_by_key = HashMap::new();

    for rule in rules {
        let compiled = compile_rule(rule);
        compiled_by_key.insert(
            format!(
                "{}:{}",
                match compiled.protection_mode {
                    ProtectionModeDto::Direct => "direct",
                    ProtectionModeDto::Recursive => "recursive",
                },
                compiled.normalized_path
            ),
            compiled,
        );
    }

    let mut compiled = compiled_by_key.into_values().collect::<Vec<_>>();
    compiled.sort_by(|a, b| {
        b.specificity
            .cmp(&a.specificity)
            .then_with(|| match (a.protection_mode, b.protection_mode) {
                (ProtectionModeDto::Recursive, ProtectionModeDto::Direct) => {
                    std::cmp::Ordering::Less
                }
                (ProtectionModeDto::Direct, ProtectionModeDto::Recursive) => {
                    std::cmp::Ordering::Greater
                }
                _ => std::cmp::Ordering::Equal,
            })
            .then_with(|| a.path.cmp(&b.path))
    });
    compiled
}

fn glob_builder(pattern: &str) -> Result<Glob, String> {
    GlobBuilder::new(pattern)
        .literal_separator(true)
        .backslash_escape(false)
        .case_insensitive(cfg!(windows))
        .build()
        .map_err(|error| error.to_string())
}

fn build_globset(patterns: &[String]) -> Result<Option<GlobSet>, String> {
    if patterns.is_empty() {
        return Ok(None);
    }

    let mut builder = GlobSetBuilder::new();
    for pattern in patterns {
        builder.add(glob_builder(pattern)?);
    }
    builder.build().map(Some).map_err(|error| error.to_string())
}

fn has_glob_magic(value: &str) -> bool {
    value.contains('*')
        || value.contains('?')
        || value.contains('[')
        || value.contains(']')
        || value.contains('{')
        || value.contains('}')
        || value.contains('!')
}

fn detect_glob_scan_root(pattern: &str) -> PathBuf {
    let normalized = pattern.replace('\\', "/");
    if !has_glob_magic(&normalized) {
        return resolve_absolute_path(&normalized);
    }

    let first_magic_index = normalized
        .char_indices()
        .find_map(|(index, character)| has_glob_magic(&character.to_string()).then_some(index))
        .unwrap_or(normalized.len());

    let prefix = normalized[..first_magic_index].trim_end_matches('/');
    if prefix.is_empty() {
        return env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    }

    let scan_root = prefix.rsplit_once('/').map_or(prefix, |(head, _)| {
        if head.is_empty() {
            if normalized.starts_with('/') {
                "/"
            } else {
                prefix
            }
        } else {
            head
        }
    });

    resolve_absolute_path(scan_root)
}

/// A group of glob patterns that share the same scan root and ignore globs.
/// All patterns in the group are evaluated in a single directory walk.
#[derive(Debug, Clone)]
struct GlobGroup {
    scan_root: PathBuf,
    pattern_indices: Vec<usize>,
}

/// Metadata associated with each glob pattern for result fan-out.
#[derive(Debug, Clone)]
struct GlobTargetMetadata {
    is_protected: bool,
    target_index: usize,
    exclude_basenames: Vec<String>,
}

type GlobMatchResults = Vec<(usize, Vec<String>)>;
type BatchedGlobExecutionResult = (GlobMatchResults, GlobMatchResults);

/// Batched glob planner that groups patterns by scan root and ignore set.
/// This reduces the number of directory walks from O(patterns) to O(unique scan roots).
#[derive(Debug)]
struct BatchedGlobPlanner {
    ignore_matcher: Option<GlobSet>,
    groups: Vec<GlobGroup>,
    normalized_patterns: Vec<String>,
    metadata: Vec<GlobTargetMetadata>,
}

impl BatchedGlobPlanner {
    fn new(ignore_globs: &[String]) -> Result<Self, String> {
        Ok(Self {
            ignore_matcher: build_globset(ignore_globs)?,
            groups: Vec::new(),
            normalized_patterns: Vec::new(),
            metadata: Vec::new(),
        })
    }

    /// Add a glob pattern to the planner with its associated metadata.
    fn add_pattern(
        &mut self,
        pattern: &str,
        is_protected: bool,
        target_index: usize,
        exclude_basenames: Vec<String>,
    ) {
        let normalized = normalize_glob_pattern(pattern);
        let pattern_index = self.normalized_patterns.len();
        self.normalized_patterns.push(normalized.clone());
        self.metadata.push(GlobTargetMetadata {
            is_protected,
            target_index,
            exclude_basenames,
        });

        // Non-glob patterns (literal paths) don't need directory scanning
        if !has_glob_magic(&normalized) {
            return;
        }

        let scan_root = detect_glob_scan_root(&normalized);
        let scan_root_str = path_to_string(&scan_root);

        // Find or create a group for this scan root
        if let Some(group) = self
            .groups
            .iter_mut()
            .find(|g| path_to_string(&g.scan_root) == scan_root_str)
        {
            group.pattern_indices.push(pattern_index);
        } else {
            self.groups.push(GlobGroup {
                scan_root,
                pattern_indices: vec![pattern_index],
            });
        }
    }

    /// Execute the batched glob expansion and fan results back to targets.
    /// Returns (protected_matches, delete_matches) where each is a vec of (target_index, matched_paths).
    fn execute(&self) -> Result<BatchedGlobExecutionResult, String> {
        let mut protected_results: HashMap<usize, Vec<String>> = HashMap::new();
        let mut delete_results: HashMap<usize, Vec<String>> = HashMap::new();

        // Process literal paths (non-glob patterns) directly
        for (pattern_index, pattern) in self.normalized_patterns.iter().enumerate() {
            if has_glob_magic(pattern) {
                continue;
            }

            let absolute_path = resolve_absolute_path(pattern);
            if !absolute_path.exists() {
                continue;
            }

            let candidate = path_to_glob_string(&absolute_path);
            if self
                .ignore_matcher
                .as_ref()
                .is_some_and(|compiled| compiled.is_match(&candidate))
            {
                continue;
            }

            let metadata = &self.metadata[pattern_index];
            let normalized_entry = path_to_string(&absolute_path);

            // Check exclude_basenames for delete targets
            if !metadata.is_protected
                && !metadata.exclude_basenames.is_empty()
                && let Some(basename) = Path::new(&normalized_entry).file_name()
            {
                let basename_str = basename.to_string_lossy();
                if metadata
                    .exclude_basenames
                    .iter()
                    .any(|excluded| excluded == basename_str.as_ref())
                {
                    continue;
                }
            }

            let target_map = if metadata.is_protected {
                &mut protected_results
            } else {
                &mut delete_results
            };
            target_map
                .entry(metadata.target_index)
                .or_default()
                .push(normalized_entry);
        }

        // Process each group's patterns with a single directory walk
        for group in &self.groups {
            if !group.scan_root.exists() {
                continue;
            }

            let group_patterns: Vec<String> = group
                .pattern_indices
                .iter()
                .map(|&idx| self.normalized_patterns[idx].clone())
                .collect();

            let matcher = build_globset(&group_patterns)?
                .ok_or_else(|| "failed to compile cleanup glob batch".to_string())?;

            let walker = WalkDir::new(&group.scan_root)
                .follow_links(false)
                .into_iter()
                .filter_entry(|entry| {
                    let candidate = path_to_glob_string(entry.path());
                    !self
                        .ignore_matcher
                        .as_ref()
                        .is_some_and(|compiled| compiled.is_match(&candidate))
                });

            for entry in walker {
                let Ok(entry) = entry else {
                    continue;
                };

                let candidate = path_to_glob_string(entry.path());
                let matched_indices = matcher.matches(&candidate);
                if matched_indices.is_empty() {
                    continue;
                }

                let normalized_entry = path_to_string(&normalize_path(entry.path()));

                for matched_index in matched_indices {
                    let pattern_index = group.pattern_indices[matched_index];
                    let metadata = &self.metadata[pattern_index];

                    // Check exclude_basenames for delete targets
                    if !metadata.is_protected
                        && !metadata.exclude_basenames.is_empty()
                        && let Some(basename) = Path::new(&normalized_entry).file_name()
                    {
                        let basename_str = basename.to_string_lossy();
                        if metadata
                            .exclude_basenames
                            .iter()
                            .any(|excluded| excluded == basename_str.as_ref())
                        {
                            continue;
                        }
                    }

                    let target_map = if metadata.is_protected {
                        &mut protected_results
                    } else {
                        &mut delete_results
                    };
                    target_map
                        .entry(metadata.target_index)
                        .or_default()
                        .push(normalized_entry.clone());
                }
            }
        }

        // Convert HashMaps to sorted Vecs and deduplicate
        let mut protected_vec: Vec<(usize, Vec<String>)> = protected_results
            .into_iter()
            .map(|(idx, mut paths)| {
                paths.sort();
                paths.dedup();
                (idx, paths)
            })
            .collect();
        protected_vec.sort_by_key(|(idx, _)| *idx);

        let mut delete_vec: Vec<(usize, Vec<String>)> = delete_results
            .into_iter()
            .map(|(idx, mut paths)| {
                paths.sort();
                paths.dedup();
                (idx, paths)
            })
            .collect();
        delete_vec.sort_by_key(|(idx, _)| *idx);

        Ok((protected_vec, delete_vec))
    }
}

/// Legacy function kept for backward compatibility with expand_protected_rules.
/// Prefer using BatchedGlobPlanner for new code.
fn expand_globs(patterns: &[String], ignore_globs: &[String]) -> Result<Vec<Vec<String>>, String> {
    if patterns.is_empty() {
        return Ok(Vec::new());
    }

    let mut planner = BatchedGlobPlanner::new(ignore_globs)?;
    for (index, pattern) in patterns.iter().enumerate() {
        planner.add_pattern(pattern, false, index, Vec::new());
    }

    let (_, delete_results) = planner.execute()?;
    let mut matches_by_pattern = vec![Vec::new(); patterns.len()];
    for (target_index, paths) in delete_results {
        matches_by_pattern[target_index] = paths;
    }

    Ok(matches_by_pattern)
}

fn expand_protected_rules(rules: &[ProtectedRuleDto]) -> Result<Vec<ProtectedRuleDto>, String> {
    let mut expanded = Vec::new();
    let mut glob_rules = Vec::new();

    for rule in rules {
        if !matches!(rule.matcher, Some(ProtectionRuleMatcherDto::Glob)) {
            expanded.push(create_protected_rule(
                &rule.path,
                rule.protection_mode,
                rule.reason.clone(),
                rule.source.clone(),
                None,
            ));
            continue;
        }
        glob_rules.push(rule.clone());
    }

    let matched_paths_by_rule = expand_globs(
        &glob_rules
            .iter()
            .map(|rule| rule.path.clone())
            .collect::<Vec<_>>(),
        &[],
    )?;
    for (rule, matched_paths) in glob_rules.iter().zip(matched_paths_by_rule) {
        for matched_path in matched_paths {
            expanded.push(create_protected_rule(
                &matched_path,
                rule.protection_mode,
                rule.reason.clone(),
                rule.source.clone(),
                None,
            ));
        }
    }

    Ok(expanded)
}

fn root_path_for(path: &Path) -> PathBuf {
    let mut root = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Prefix(prefix) => root.push(prefix.as_os_str()),
            Component::RootDir => {
                root.push(Path::new(std::path::MAIN_SEPARATOR_STR));
                break;
            }
            _ => break,
        }
    }
    if root.as_os_str().is_empty() {
        return PathBuf::from(std::path::MAIN_SEPARATOR_STR);
    }
    root
}

fn collect_built_in_dangerous_path_rules() -> Vec<ProtectedRuleDto> {
    let home_dir = resolve_home_dir();
    let xdg_config_home = env::var("XDG_CONFIG_HOME")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .map(|value| resolve_absolute_path(&value))
        .unwrap_or_else(|| home_dir.join(".config"));
    let xdg_data_home = env::var("XDG_DATA_HOME")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .map(|value| resolve_absolute_path(&value))
        .unwrap_or_else(|| home_dir.join(".local/share"));
    let xdg_state_home = env::var("XDG_STATE_HOME")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .map(|value| resolve_absolute_path(&value))
        .unwrap_or_else(|| home_dir.join(".local/state"));
    let xdg_cache_home = env::var("XDG_CACHE_HOME")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .map(|value| resolve_absolute_path(&value))
        .unwrap_or_else(|| home_dir.join(".cache"));

    vec![
        create_protected_rule(
            &path_to_string(&root_path_for(&home_dir)),
            ProtectionModeDto::Direct,
            "built-in dangerous root path",
            "built-in-dangerous-root",
            None,
        ),
        create_protected_rule(
            &path_to_string(&home_dir),
            ProtectionModeDto::Direct,
            "built-in dangerous home directory",
            "built-in-dangerous-root",
            None,
        ),
        create_protected_rule(
            &path_to_string(&xdg_config_home),
            ProtectionModeDto::Direct,
            "built-in dangerous config directory",
            "built-in-dangerous-root",
            None,
        ),
        create_protected_rule(
            &path_to_string(&xdg_data_home),
            ProtectionModeDto::Direct,
            "built-in dangerous data directory",
            "built-in-dangerous-root",
            None,
        ),
        create_protected_rule(
            &path_to_string(&xdg_state_home),
            ProtectionModeDto::Direct,
            "built-in dangerous state directory",
            "built-in-dangerous-root",
            None,
        ),
        create_protected_rule(
            &path_to_string(&xdg_cache_home),
            ProtectionModeDto::Direct,
            "built-in dangerous cache directory",
            "built-in-dangerous-root",
            None,
        ),
        create_protected_rule(
            &path_to_string(&home_dir.join(".aindex")),
            ProtectionModeDto::Direct,
            "built-in global aindex directory",
            "built-in-dangerous-root",
            None,
        ),
        create_protected_rule(
            &path_to_string(&home_dir.join(".aindex/.tnmsc.json")),
            ProtectionModeDto::Direct,
            "built-in global config file",
            "built-in-config",
            None,
        ),
    ]
}

fn collect_workspace_reserved_rules(
    workspace_dir: &str,
    project_roots: &[String],
    include_reserved_workspace_content_roots: bool,
) -> Vec<ProtectedRuleDto> {
    let workspace_dir = path_to_string(&resolve_absolute_path(workspace_dir));
    let mut rules = vec![
        create_protected_rule(
            &workspace_dir,
            ProtectionModeDto::Direct,
            "workspace root",
            "workspace-reserved",
            None,
        ),
        create_protected_rule(
            &path_to_string(&resolve_absolute_path(&format!("{workspace_dir}/aindex"))),
            ProtectionModeDto::Direct,
            "reserved workspace aindex root",
            "workspace-reserved",
            None,
        ),
        create_protected_rule(
            &path_to_string(&resolve_absolute_path(&format!(
                "{workspace_dir}/knowladge"
            ))),
            ProtectionModeDto::Direct,
            "reserved workspace knowladge root",
            "workspace-reserved",
            None,
        ),
    ];

    for project_root in project_roots {
        rules.push(create_protected_rule(
            project_root,
            ProtectionModeDto::Direct,
            "workspace project root",
            "workspace-project-root",
            None,
        ));
    }

    if include_reserved_workspace_content_roots {
        rules.push(create_protected_rule(
            &format!("{workspace_dir}/aindex/dist/**/*.mdx"),
            ProtectionModeDto::Direct,
            "reserved workspace aindex dist mdx files",
            "workspace-reserved",
            Some(ProtectionRuleMatcherDto::Glob),
        ));
        for series_name in ["app", "ext", "arch", "softwares"] {
            rules.push(create_protected_rule(
                &format!("{workspace_dir}/aindex/{series_name}/**/*.mdx"),
                ProtectionModeDto::Direct,
                format!("reserved workspace aindex {series_name} mdx files"),
                "workspace-reserved",
                Some(ProtectionRuleMatcherDto::Glob),
            ));
        }
    }

    rules
}

fn create_guard(
    snapshot: &CleanupSnapshot,
    rules: &[ProtectedRuleDto],
) -> Result<ProtectedDeletionGuard, String> {
    let mut all_rules = collect_built_in_dangerous_path_rules();
    all_rules.extend(collect_workspace_reserved_rules(
        &snapshot.workspace_dir,
        &snapshot.project_roots,
        true,
    ));

    if let Some(aindex_dir) = snapshot.aindex_dir.as_ref() {
        all_rules.push(create_protected_rule(
            aindex_dir,
            ProtectionModeDto::Direct,
            "resolved aindex root",
            "aindex-root",
            None,
        ));
    }

    all_rules.extend_from_slice(rules);
    let compiled_rules = dedupe_and_compile_rules(&expand_protected_rules(&all_rules)?);

    Ok(ProtectedDeletionGuard { compiled_rules })
}

fn is_rule_match(target_key: &str, rule_key: &str, protection_mode: ProtectionModeDto) -> bool {
    match protection_mode {
        ProtectionModeDto::Direct => is_same_or_child_path(rule_key, target_key),
        ProtectionModeDto::Recursive => {
            is_same_or_child_path(target_key, rule_key)
                || is_same_or_child_path(rule_key, target_key)
        }
    }
}

fn select_more_specific_rule(
    candidate: &CompiledProtectedRule,
    current: Option<&CompiledProtectedRule>,
) -> CompiledProtectedRule {
    let Some(current) = current else {
        return candidate.clone();
    };

    if candidate.specificity != current.specificity {
        return if candidate.specificity > current.specificity {
            candidate.clone()
        } else {
            current.clone()
        };
    }

    if candidate.protection_mode != current.protection_mode {
        return if candidate.protection_mode == ProtectionModeDto::Recursive {
            candidate.clone()
        } else {
            current.clone()
        };
    }

    if candidate.path < current.path {
        candidate.clone()
    } else {
        current.clone()
    }
}

fn get_protected_path_violation(
    target_path: &str,
    guard: &ProtectedDeletionGuard,
) -> Option<ProtectedPathViolationDto> {
    let absolute_target_path = path_to_string(&resolve_absolute_path(target_path));
    let target_keys = build_comparison_keys(&absolute_target_path);
    let mut matched_rule: Option<CompiledProtectedRule> = None;

    for rule in &guard.compiled_rules {
        let mut did_match = false;
        for target_key in &target_keys {
            for rule_key in &rule.comparison_keys {
                if !is_rule_match(target_key, rule_key, rule.protection_mode) {
                    continue;
                }

                matched_rule = Some(select_more_specific_rule(rule, matched_rule.as_ref()));
                did_match = true;
                break;
            }
            if did_match {
                break;
            }
        }
    }

    matched_rule.map(|rule| ProtectedPathViolationDto {
        target_path: absolute_target_path,
        protected_path: rule.path,
        protection_mode: rule.protection_mode,
        reason: rule.reason,
        source: rule.source,
    })
}

fn partition_deletion_targets(paths: &[String], guard: &ProtectedDeletionGuard) -> PartitionResult {
    let mut safe_paths = Vec::new();
    let mut violations = Vec::new();

    for target_path in paths {
        if let Some(violation) = get_protected_path_violation(target_path, guard) {
            violations.push(violation);
        } else {
            safe_paths.push(path_to_string(&resolve_absolute_path(target_path)));
        }
    }

    safe_paths.sort();
    violations.sort_by(|a, b| a.target_path.cmp(&b.target_path));

    PartitionResult {
        safe_paths,
        violations,
    }
}

fn compact_deletion_targets(files: &[String], dirs: &[String]) -> (Vec<String>, Vec<String>) {
    let files_by_key = files
        .iter()
        .map(|file_path| {
            let resolved = path_to_string(&resolve_absolute_path(file_path));
            (resolved.clone(), resolved)
        })
        .collect::<HashMap<_, _>>();
    let dirs_by_key = dirs
        .iter()
        .map(|dir_path| {
            let resolved = path_to_string(&resolve_absolute_path(dir_path));
            (resolved.clone(), resolved)
        })
        .collect::<HashMap<_, _>>();

    let mut sorted_dir_entries = dirs_by_key.into_iter().collect::<Vec<_>>();
    sorted_dir_entries
        .sort_by(|(left_key, _), (right_key, _)| left_key.len().cmp(&right_key.len()));

    let mut compacted_dirs: HashMap<String, String> = HashMap::new();
    for (dir_key, dir_path) in sorted_dir_entries {
        let covered_by_parent = compacted_dirs
            .keys()
            .any(|existing_parent_key| is_same_or_child_path(&dir_key, existing_parent_key));
        if !covered_by_parent {
            compacted_dirs.insert(dir_key, dir_path);
        }
    }

    let mut compacted_files = Vec::new();
    for (file_key, file_path) in files_by_key {
        let covered_by_dir = compacted_dirs
            .keys()
            .any(|dir_key| is_same_or_child_path(&file_key, dir_key));
        if !covered_by_dir {
            compacted_files.push(file_path);
        }
    }

    compacted_files.sort();
    let mut compacted_dir_paths = compacted_dirs.into_values().collect::<Vec<_>>();
    compacted_dir_paths.sort();

    (compacted_files, compacted_dir_paths)
}

fn should_skip_empty_directory_tree(workspace_dir: &str, current_dir: &str) -> bool {
    if current_dir == workspace_dir {
        return false;
    }

    Path::new(current_dir)
        .file_name()
        .and_then(|value| value.to_str())
        .is_some_and(|basename| EMPTY_DIRECTORY_SCAN_EXCLUDED_BASENAMES.contains(&basename))
}

/// Check if a directory path should be excluded from empty-directory scan
/// because it matches a user-supplied glob from aindex.config.ts.
fn matches_empty_dir_exclude_globs(
    dir_path: &Path,
    workspace_dir: &Path,
    absolute_exclude_set: &Option<GlobSet>,
    relative_exclude_set: &Option<GlobSet>,
) -> bool {
    let absolute_match = absolute_exclude_set
        .as_ref()
        .is_some_and(|globs| globs.is_match(path_to_glob_string(dir_path)));
    if absolute_match {
        return true;
    }

    relative_exclude_set.as_ref().is_some_and(|globs| {
        normalize_workspace_relative_path(dir_path, workspace_dir)
            .is_some_and(|relative_path| globs.is_match(relative_path))
    })
}

fn collect_empty_workspace_directories(
    current_dir: &Path,
    workspace_dir: &Path,
    files_to_delete: &HashSet<String>,
    dirs_to_delete: &HashSet<String>,
    empty_dirs_to_delete: &mut BTreeSet<String>,
    empty_dir_absolute_exclude: &Option<GlobSet>,
    empty_dir_relative_exclude: &Option<GlobSet>,
) -> bool {
    let current_dir = normalize_path(current_dir);
    let current_dir_string = path_to_string(&current_dir);
    let workspace_dir_string = path_to_string(workspace_dir);

    if dirs_to_delete.contains(&current_dir_string) {
        return true;
    }

    if should_skip_empty_directory_tree(&workspace_dir_string, &current_dir_string) {
        return false;
    }

    if matches_empty_dir_exclude_globs(
        &current_dir,
        workspace_dir,
        empty_dir_absolute_exclude,
        empty_dir_relative_exclude,
    ) {
        return false;
    }

    let Ok(entries) = fs::read_dir(&current_dir) else {
        return false;
    };

    let mut has_retained_entries = false;

    for entry in entries {
        let Ok(entry) = entry else {
            has_retained_entries = true;
            continue;
        };

        let entry_path = normalize_path(&entry.path());
        let entry_string = path_to_string(&entry_path);

        if dirs_to_delete.contains(&entry_string) {
            continue;
        }

        let Ok(file_type) = entry.file_type() else {
            has_retained_entries = true;
            continue;
        };

        if file_type.is_dir() {
            if should_skip_empty_directory_tree(&workspace_dir_string, &entry_string) {
                has_retained_entries = true;
                continue;
            }

            if matches_empty_dir_exclude_globs(
                &entry_path,
                workspace_dir,
                empty_dir_absolute_exclude,
                empty_dir_relative_exclude,
            ) {
                has_retained_entries = true;
                continue;
            }

            if collect_empty_workspace_directories(
                &entry_path,
                workspace_dir,
                files_to_delete,
                dirs_to_delete,
                empty_dirs_to_delete,
                empty_dir_absolute_exclude,
                empty_dir_relative_exclude,
            ) {
                empty_dirs_to_delete.insert(entry_string);
                continue;
            }

            has_retained_entries = true;
            continue;
        }

        if files_to_delete.contains(&entry_string) {
            continue;
        }

        has_retained_entries = true;
    }

    !has_retained_entries
}

fn plan_workspace_empty_directory_cleanup(
    workspace_dir: &str,
    files_to_delete: &[String],
    dirs_to_delete: &[String],
    guard: &ProtectedDeletionGuard,
    empty_dir_absolute_exclude: &Option<GlobSet>,
    empty_dir_relative_exclude: &Option<GlobSet>,
) -> (Vec<String>, Vec<ProtectedPathViolationDto>) {
    let workspace_dir = resolve_absolute_path(workspace_dir);
    let files_to_delete = files_to_delete
        .iter()
        .map(|path| path_to_string(&resolve_absolute_path(path)))
        .collect::<HashSet<_>>();
    let dirs_to_delete = dirs_to_delete
        .iter()
        .map(|path| path_to_string(&resolve_absolute_path(path)))
        .collect::<HashSet<_>>();
    let mut discovered_empty_dirs = BTreeSet::new();

    collect_empty_workspace_directories(
        &workspace_dir,
        &workspace_dir,
        &files_to_delete,
        &dirs_to_delete,
        &mut discovered_empty_dirs,
        empty_dir_absolute_exclude,
        empty_dir_relative_exclude,
    );

    let mut safe_empty_dirs = Vec::new();
    let mut violations = Vec::new();

    for empty_dir in discovered_empty_dirs {
        if let Some(violation) = get_protected_path_violation(&empty_dir, guard) {
            violations.push(violation);
        } else {
            safe_empty_dirs.push(empty_dir);
        }
    }

    safe_empty_dirs.sort();
    violations.sort_by(|a, b| a.target_path.cmp(&b.target_path));

    (safe_empty_dirs, violations)
}

fn detect_cleanup_protection_conflicts(
    output_path_owners: &HashMap<String, Vec<String>>,
    guard: &ProtectedDeletionGuard,
) -> Vec<CleanupProtectionConflictDto> {
    let mut conflicts = Vec::new();

    for (output_path, output_plugins) in output_path_owners {
        let output_keys = build_comparison_keys(output_path)
            .into_iter()
            .collect::<HashSet<_>>();

        for rule in &guard.compiled_rules {
            let is_exact_match = rule
                .comparison_keys
                .iter()
                .any(|rule_key| output_keys.contains(rule_key));
            if !is_exact_match {
                continue;
            }

            for output_plugin in output_plugins {
                conflicts.push(CleanupProtectionConflictDto {
                    output_path: output_path.clone(),
                    output_plugin: output_plugin.clone(),
                    protected_path: rule.path.clone(),
                    protection_mode: rule.protection_mode,
                    protected_by: rule.source.clone(),
                    reason: rule.reason.clone(),
                });
            }
        }
    }

    conflicts.sort_by(|a, b| {
        a.output_path
            .cmp(&b.output_path)
            .then_with(|| a.protected_path.cmp(&b.protected_path))
    });
    conflicts
}

#[derive(Debug, Clone)]
struct ProtectedGlobCleanupTarget {
    path: String,
    protection_mode: ProtectionModeDto,
    reason: String,
    source: String,
}

#[derive(Debug, Clone)]
struct DeleteGlobCleanupTarget {
    target: CleanupTargetDto,
}

fn default_protection_mode_for_target(target: &CleanupTargetDto) -> ProtectionModeDto {
    target.protection_mode.unwrap_or(match target.kind {
        CleanupTargetKindDto::File => ProtectionModeDto::Direct,
        CleanupTargetKindDto::Directory | CleanupTargetKindDto::Glob => {
            ProtectionModeDto::Recursive
        }
    })
}

pub fn plan_cleanup(snapshot: CleanupSnapshot) -> Result<CleanupPlan, String> {
    let mut delete_files = HashSet::new();
    let mut delete_dirs = HashSet::new();
    let mut protected_rules = snapshot.protected_rules.clone();
    let mut exclude_scan_globs = BTreeSet::from_iter(
        DEFAULT_CLEANUP_SCAN_EXCLUDE_GLOBS
            .iter()
            .map(|value| (*value).to_string()),
    );
    let mut output_path_owners = HashMap::<String, Vec<String>>::new();
    let mut protected_glob_targets = Vec::<ProtectedGlobCleanupTarget>::new();
    let mut delete_glob_targets = Vec::<DeleteGlobCleanupTarget>::new();

    for plugin_snapshot in &snapshot.plugin_snapshots {
        for output in &plugin_snapshot.outputs {
            let resolved_output_path = path_to_string(&resolve_absolute_path(output));
            delete_files.insert(resolved_output_path.clone());
            output_path_owners
                .entry(resolved_output_path)
                .or_default()
                .push(plugin_snapshot.plugin_name.clone());
        }

        for ignore_glob in &plugin_snapshot.cleanup.exclude_scan_globs {
            exclude_scan_globs.insert(normalize_glob_pattern(ignore_glob));
        }
    }

    let ignore_globs = exclude_scan_globs.iter().cloned().collect::<Vec<_>>();

    for plugin_snapshot in &snapshot.plugin_snapshots {
        for target in &plugin_snapshot.cleanup.protect {
            if target.kind == CleanupTargetKindDto::Glob {
                protected_glob_targets.push(ProtectedGlobCleanupTarget {
                    path: target.path.clone(),
                    protection_mode: default_protection_mode_for_target(target),
                    reason: target
                        .label
                        .as_ref()
                        .map(|label| format!("plugin cleanup protect declaration ({label})"))
                        .unwrap_or_else(|| "plugin cleanup protect declaration".to_string()),
                    source: format!("plugin-cleanup-protect:{}", plugin_snapshot.plugin_name),
                });
                continue;
            }

            let reason = target
                .label
                .as_ref()
                .map(|label| format!("plugin cleanup protect declaration ({label})"))
                .unwrap_or_else(|| "plugin cleanup protect declaration".to_string());
            protected_rules.push(create_protected_rule(
                &target.path,
                default_protection_mode_for_target(target),
                reason,
                format!("plugin-cleanup-protect:{}", plugin_snapshot.plugin_name),
                None,
            ));
        }

        for target in &plugin_snapshot.cleanup.delete {
            if target.kind == CleanupTargetKindDto::Glob {
                delete_glob_targets.push(DeleteGlobCleanupTarget {
                    target: target.clone(),
                });
                continue;
            }

            match target.kind {
                CleanupTargetKindDto::Directory => {
                    delete_dirs.insert(path_to_string(&resolve_absolute_path(&target.path)));
                }
                CleanupTargetKindDto::File => {
                    delete_files.insert(path_to_string(&resolve_absolute_path(&target.path)));
                }
                CleanupTargetKindDto::Glob => {}
            }
        }
    }

    // Batch all glob patterns (both protected and delete) into a single planner
    // to minimize directory walks. This is the key performance optimization.
    let mut planner = BatchedGlobPlanner::new(&ignore_globs)?;

    // Add protected glob targets
    for (index, target) in protected_glob_targets.iter().enumerate() {
        planner.add_pattern(
            &target.path,
            true, // is_protected
            index,
            Vec::new(), // protected globs don't use exclude_basenames
        );
    }

    // Add delete glob targets
    for (index, target) in delete_glob_targets.iter().enumerate() {
        planner.add_pattern(
            &target.target.path,
            false, // is_delete
            index,
            target.target.exclude_basenames.clone(),
        );
    }

    // Execute the batched glob expansion
    let (protected_results, delete_results) = planner.execute()?;

    // Fan protected glob results back to their targets
    for (target_index, matched_paths) in protected_results {
        let target = &protected_glob_targets[target_index];
        for matched_path in matched_paths {
            protected_rules.push(create_protected_rule(
                &matched_path,
                target.protection_mode,
                target.reason.clone(),
                target.source.clone(),
                None,
            ));
        }
    }

    // Fan delete glob results back to their targets
    for (_target_index, matched_paths) in delete_results {
        for matched_path in matched_paths {
            let Ok(metadata) = fs::symlink_metadata(&matched_path) else {
                continue;
            };
            if metadata.is_dir() {
                delete_dirs.insert(path_to_string(&resolve_absolute_path(&matched_path)));
            } else {
                delete_files.insert(path_to_string(&resolve_absolute_path(&matched_path)));
            }
        }
    }

    let guard = create_guard(&snapshot, &protected_rules)?;
    let conflicts = detect_cleanup_protection_conflicts(&output_path_owners, &guard);
    if !conflicts.is_empty() {
        return Ok(CleanupPlan {
            files_to_delete: Vec::new(),
            dirs_to_delete: Vec::new(),
            empty_dirs_to_delete: Vec::new(),
            violations: Vec::new(),
            conflicts,
            excluded_scan_globs: ignore_globs,
        });
    }

    let file_partition =
        partition_deletion_targets(&delete_files.into_iter().collect::<Vec<_>>(), &guard);
    let dir_partition =
        partition_deletion_targets(&delete_dirs.into_iter().collect::<Vec<_>>(), &guard);
    let (files_to_delete, dirs_to_delete) =
        compact_deletion_targets(&file_partition.safe_paths, &dir_partition.safe_paths);
    let empty_dir_absolute_exclude_set = build_globset(
        &snapshot
            .empty_dir_exclude_globs
            .iter()
            .map(|pattern| {
                if expand_home_path(pattern).is_absolute() {
                    normalize_glob_pattern(pattern)
                } else {
                    path_to_glob_string(&resolve_absolute_path(&format!(
                        "{}/{}",
                        snapshot.workspace_dir, pattern
                    )))
                }
            })
            .collect::<Vec<_>>(),
    )?;
    let empty_dir_relative_exclude_set = build_globset(
        &snapshot
            .empty_dir_exclude_globs
            .iter()
            .filter(|pattern| !expand_home_path(pattern).is_absolute())
            .map(|pattern| normalize_relative_glob_pattern(pattern))
            .collect::<Vec<_>>(),
    )?;
    let (empty_dirs_to_delete, empty_dir_violations) = plan_workspace_empty_directory_cleanup(
        &snapshot.workspace_dir,
        &files_to_delete,
        &dirs_to_delete,
        &guard,
        &empty_dir_absolute_exclude_set,
        &empty_dir_relative_exclude_set,
    );

    let mut violations = file_partition.violations;
    violations.extend(dir_partition.violations);
    violations.extend(empty_dir_violations);
    violations.sort_by(|a, b| a.target_path.cmp(&b.target_path));

    Ok(CleanupPlan {
        files_to_delete,
        dirs_to_delete,
        empty_dirs_to_delete,
        violations,
        conflicts: Vec::new(),
        excluded_scan_globs: ignore_globs,
    })
}

pub fn perform_cleanup(snapshot: CleanupSnapshot) -> Result<CleanupExecutionResultDto, String> {
    let plan = plan_cleanup(snapshot)?;
    if !plan.conflicts.is_empty() || !plan.violations.is_empty() {
        return Ok(CleanupExecutionResultDto {
            deleted_files: 0,
            deleted_dirs: 0,
            errors: Vec::new(),
            violations: plan.violations,
            conflicts: plan.conflicts,
            files_to_delete: plan.files_to_delete,
            dirs_to_delete: plan.dirs_to_delete,
            empty_dirs_to_delete: plan.empty_dirs_to_delete,
            excluded_scan_globs: plan.excluded_scan_globs,
        });
    }

    let delete_result = desk_paths::delete_targets(&plan.files_to_delete, &plan.dirs_to_delete);
    let empty_dir_result = desk_paths::delete_empty_directories(&plan.empty_dirs_to_delete);
    let mut errors = delete_result
        .file_errors
        .into_iter()
        .map(|error| CleanupErrorDto {
            path: error.path,
            kind: CleanupErrorKindDto::File,
            error: error.error,
        })
        .collect::<Vec<_>>();
    errors.extend(
        delete_result
            .dir_errors
            .into_iter()
            .map(|error| CleanupErrorDto {
                path: error.path,
                kind: CleanupErrorKindDto::Directory,
                error: error.error,
            }),
    );
    errors.extend(
        empty_dir_result
            .errors
            .into_iter()
            .map(|error| CleanupErrorDto {
                path: error.path,
                kind: CleanupErrorKindDto::Directory,
                error: error.error,
            }),
    );

    Ok(CleanupExecutionResultDto {
        deleted_files: delete_result.deleted_files.len(),
        deleted_dirs: delete_result.deleted_dirs.len() + empty_dir_result.deleted_paths.len(),
        errors,
        violations: Vec::new(),
        conflicts: Vec::new(),
        files_to_delete: plan.files_to_delete,
        dirs_to_delete: plan.dirs_to_delete,
        empty_dirs_to_delete: plan.empty_dirs_to_delete,
        excluded_scan_globs: plan.excluded_scan_globs,
    })
}

#[cfg(feature = "napi")]
mod napi_binding {
    use napi_derive::napi;

    use super::{CleanupExecutionResultDto, CleanupPlan, CleanupSnapshot};

    fn parse_snapshot(snapshot_json: String) -> napi::Result<CleanupSnapshot> {
        serde_json::from_str(&snapshot_json)
            .map_err(|error| napi::Error::from_reason(error.to_string()))
    }

    fn serialize_result<T: serde::Serialize>(result: &T) -> napi::Result<String> {
        serde_json::to_string(result).map_err(|error| napi::Error::from_reason(error.to_string()))
    }

    #[napi]
    pub fn plan_cleanup(snapshot_json: String) -> napi::Result<String> {
        let snapshot = parse_snapshot(snapshot_json)?;
        let result: CleanupPlan =
            super::plan_cleanup(snapshot).map_err(napi::Error::from_reason)?;
        serialize_result(&result)
    }

    #[napi]
    pub fn perform_cleanup(snapshot_json: String) -> napi::Result<String> {
        let snapshot = parse_snapshot(snapshot_json)?;
        let result: CleanupExecutionResultDto =
            super::perform_cleanup(snapshot).map_err(napi::Error::from_reason)?;
        serialize_result(&result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn empty_snapshot(workspace_dir: &Path) -> CleanupSnapshot {
        CleanupSnapshot {
            workspace_dir: path_to_string(workspace_dir),
            aindex_dir: Some(path_to_string(&workspace_dir.join("aindex"))),
            project_roots: vec![path_to_string(&workspace_dir.join("project-a"))],
            protected_rules: Vec::new(),
            plugin_snapshots: Vec::new(),
            empty_dir_exclude_globs: Vec::new(),
        }
    }

    fn single_plugin_snapshot(
        workspace_dir: &Path,
        outputs: Vec<String>,
        cleanup: CleanupDeclarationsDto,
    ) -> CleanupSnapshot {
        CleanupSnapshot {
            plugin_snapshots: vec![PluginCleanupSnapshotDto {
                plugin_name: "MockOutputPlugin".to_string(),
                outputs,
                cleanup,
            }],
            ..empty_snapshot(workspace_dir)
        }
    }

    #[test]
    fn detects_exact_output_protection_conflicts() {
        let temp_dir = tempdir().unwrap();
        let workspace_dir = temp_dir.path().join("workspace");
        let output_path = workspace_dir.join("project-a/AGENTS.md");
        fs::create_dir_all(output_path.parent().unwrap()).unwrap();
        fs::write(&output_path, "# output").unwrap();

        let snapshot = single_plugin_snapshot(
            &workspace_dir,
            vec![path_to_string(&output_path)],
            CleanupDeclarationsDto {
                protect: vec![CleanupTargetDto {
                    path: path_to_string(&output_path),
                    kind: CleanupTargetKindDto::File,
                    exclude_basenames: Vec::new(),
                    protection_mode: None,
                    scope: None,
                    label: None,
                }],
                ..CleanupDeclarationsDto::default()
            },
        );

        let plan = plan_cleanup(snapshot).unwrap();
        assert_eq!(plan.conflicts.len(), 1);
        assert!(plan.files_to_delete.is_empty());
        assert!(plan.dirs_to_delete.is_empty());
    }

    #[test]
    fn expands_delete_globs_and_respects_excluded_basenames() {
        let temp_dir = tempdir().unwrap();
        let workspace_dir = temp_dir.path().join("workspace");
        let skills_dir = workspace_dir.join(".codex/skills");
        let system_dir = skills_dir.join(".system");
        let stale_dir = skills_dir.join("legacy");
        fs::create_dir_all(&system_dir).unwrap();
        fs::create_dir_all(&stale_dir).unwrap();

        let snapshot = single_plugin_snapshot(
            &workspace_dir,
            vec![],
            CleanupDeclarationsDto {
                delete: vec![CleanupTargetDto {
                    path: path_to_string(&skills_dir.join("*")),
                    kind: CleanupTargetKindDto::Glob,
                    exclude_basenames: vec![".system".to_string()],
                    protection_mode: None,
                    scope: None,
                    label: None,
                }],
                ..CleanupDeclarationsDto::default()
            },
        );

        let plan = plan_cleanup(snapshot).unwrap();
        assert!(plan.dirs_to_delete.contains(&path_to_string(&stale_dir)));
        assert!(!plan.dirs_to_delete.contains(&path_to_string(&system_dir)));
    }

    #[test]
    fn preserves_direct_vs_recursive_guard_behavior() {
        let temp_dir = tempdir().unwrap();
        let workspace_dir = temp_dir.path().join("workspace");
        let direct_dir = workspace_dir.join("project-a");
        let recursive_dir = workspace_dir.join("aindex/dist");
        let direct_file = direct_dir.join("AGENTS.md");
        let recursive_file = recursive_dir.join("commands/demo.mdx");

        let snapshot = single_plugin_snapshot(
            &workspace_dir,
            vec![
                path_to_string(&direct_file),
                path_to_string(&recursive_file),
            ],
            CleanupDeclarationsDto {
                protect: vec![
                    CleanupTargetDto {
                        path: path_to_string(&direct_dir),
                        kind: CleanupTargetKindDto::Directory,
                        exclude_basenames: Vec::new(),
                        protection_mode: Some(ProtectionModeDto::Direct),
                        scope: None,
                        label: None,
                    },
                    CleanupTargetDto {
                        path: path_to_string(&recursive_dir),
                        kind: CleanupTargetKindDto::Directory,
                        exclude_basenames: Vec::new(),
                        protection_mode: Some(ProtectionModeDto::Recursive),
                        scope: None,
                        label: None,
                    },
                ],
                ..CleanupDeclarationsDto::default()
            },
        );

        let plan = plan_cleanup(snapshot).unwrap();
        assert!(plan.files_to_delete.contains(&path_to_string(&direct_file)));
        assert!(plan
            .violations
            .iter()
            .any(|violation| violation.target_path == path_to_string(&recursive_file)));
    }

    #[test]
    fn blocks_reserved_workspace_mdx_descendants() {
        let temp_dir = tempdir().unwrap();
        let workspace_dir = temp_dir.path().join("workspace");
        let protected_file = workspace_dir.join("aindex/dist/commands/demo.mdx");
        fs::create_dir_all(protected_file.parent().unwrap()).unwrap();
        fs::write(&protected_file, "# demo").unwrap();

        let snapshot = single_plugin_snapshot(
            &workspace_dir,
            vec![],
            CleanupDeclarationsDto {
                delete: vec![CleanupTargetDto {
                    path: path_to_string(&workspace_dir.join("aindex/dist")),
                    kind: CleanupTargetKindDto::Directory,
                    exclude_basenames: Vec::new(),
                    protection_mode: None,
                    scope: None,
                    label: None,
                }],
                ..CleanupDeclarationsDto::default()
            },
        );

        let plan = plan_cleanup(snapshot).unwrap();
        assert!(plan.dirs_to_delete.is_empty());
        assert_eq!(plan.violations.len(), 1);
        assert_eq!(
            plan.violations[0].protected_path,
            path_to_string(&protected_file)
        );
    }

    #[cfg(unix)]
    #[test]
    fn matches_symlink_realpaths_against_protected_paths() {
        use std::os::unix::fs::symlink;

        let temp_dir = tempdir().unwrap();
        let workspace_dir = temp_dir.path().join("workspace");
        let symlink_path = temp_dir.path().join("workspace-link");
        fs::create_dir_all(&workspace_dir).unwrap();
        symlink(&workspace_dir, &symlink_path).unwrap();

        let snapshot = single_plugin_snapshot(
            &workspace_dir,
            vec![],
            CleanupDeclarationsDto {
                delete: vec![CleanupTargetDto {
                    path: path_to_string(&symlink_path),
                    kind: CleanupTargetKindDto::Directory,
                    exclude_basenames: Vec::new(),
                    protection_mode: None,
                    scope: None,
                    label: None,
                }],
                ..CleanupDeclarationsDto::default()
            },
        );

        let plan = plan_cleanup(snapshot).unwrap();
        assert!(plan.dirs_to_delete.is_empty());
        assert!(plan
            .violations
            .iter()
            .any(|violation| violation.target_path == path_to_string(&symlink_path)));
    }

    #[test]
    fn compacts_nested_directory_targets() {
        let temp_dir = tempdir().unwrap();
        let workspace_dir = temp_dir.path().join("workspace");
        let base_dir = workspace_dir.join(".claude");
        let rules_dir = base_dir.join("rules");
        let rule_file = rules_dir.join("demo.md");
        fs::create_dir_all(&rules_dir).unwrap();
        fs::write(&rule_file, "# demo").unwrap();

        let snapshot = single_plugin_snapshot(
            &workspace_dir,
            vec![path_to_string(&rule_file)],
            CleanupDeclarationsDto {
                delete: vec![
                    CleanupTargetDto {
                        path: path_to_string(&base_dir),
                        kind: CleanupTargetKindDto::Directory,
                        exclude_basenames: Vec::new(),
                        protection_mode: None,
                        scope: None,
                        label: None,
                    },
                    CleanupTargetDto {
                        path: path_to_string(&rules_dir),
                        kind: CleanupTargetKindDto::Directory,
                        exclude_basenames: Vec::new(),
                        protection_mode: None,
                        scope: None,
                        label: None,
                    },
                    CleanupTargetDto {
                        path: path_to_string(&rule_file),
                        kind: CleanupTargetKindDto::File,
                        exclude_basenames: Vec::new(),
                        protection_mode: None,
                        scope: None,
                        label: None,
                    },
                ],
                ..CleanupDeclarationsDto::default()
            },
        );

        let plan = plan_cleanup(snapshot).unwrap();
        assert_eq!(plan.dirs_to_delete, vec![path_to_string(&base_dir)]);
        assert!(plan.files_to_delete.is_empty());
    }

    #[test]
    fn plans_workspace_empty_directories_while_skipping_excluded_trees() {
        let temp_dir = tempdir().unwrap();
        let workspace_dir = temp_dir.path().join("workspace");
        let source_leaf_dir = workspace_dir.join("source/empty/leaf");
        let source_keep_file = workspace_dir.join("source/keep.md");
        let dist_empty_dir = workspace_dir.join("dist/ghost");
        let node_modules_empty_dir = workspace_dir.join("node_modules/pkg/ghost");
        let git_empty_dir = workspace_dir.join(".git/objects/info");

        fs::create_dir_all(&source_leaf_dir).unwrap();
        fs::create_dir_all(source_keep_file.parent().unwrap()).unwrap();
        fs::create_dir_all(&dist_empty_dir).unwrap();
        fs::create_dir_all(&node_modules_empty_dir).unwrap();
        fs::create_dir_all(&git_empty_dir).unwrap();
        fs::write(&source_keep_file, "# keep").unwrap();

        let snapshot =
            single_plugin_snapshot(&workspace_dir, vec![], CleanupDeclarationsDto::default());

        let plan = plan_cleanup(snapshot).unwrap();
        assert!(plan.files_to_delete.is_empty());
        assert!(plan.dirs_to_delete.is_empty());
        assert_eq!(
            plan.empty_dirs_to_delete,
            vec![
                path_to_string(&workspace_dir.join("source/empty")),
                path_to_string(&source_leaf_dir),
            ]
        );
        assert!(!plan
            .empty_dirs_to_delete
            .contains(&path_to_string(&workspace_dir)));
        assert!(!plan
            .empty_dirs_to_delete
            .contains(&path_to_string(&dist_empty_dir)));
        assert!(!plan
            .empty_dirs_to_delete
            .contains(&path_to_string(&node_modules_empty_dir)));
        assert!(!plan
            .empty_dirs_to_delete
            .contains(&path_to_string(&git_empty_dir)));
    }

    #[test]
    fn performs_cleanup_and_prunes_workspace_empty_directories() {
        let temp_dir = tempdir().unwrap();
        let workspace_dir = temp_dir.path().join("workspace");
        let output_file = workspace_dir.join("generated/AGENTS.md");
        let empty_leaf_dir = workspace_dir.join("scratch/empty/leaf");
        let retained_scratch_file = workspace_dir.join("scratch/keep.md");

        fs::create_dir_all(output_file.parent().unwrap()).unwrap();
        fs::create_dir_all(&empty_leaf_dir).unwrap();
        fs::create_dir_all(retained_scratch_file.parent().unwrap()).unwrap();
        fs::write(&output_file, "# generated").unwrap();
        fs::write(&retained_scratch_file, "# keep").unwrap();

        let snapshot = single_plugin_snapshot(
            &workspace_dir,
            vec![path_to_string(&output_file)],
            CleanupDeclarationsDto::default(),
        );

        let result = perform_cleanup(snapshot).unwrap();
        assert_eq!(result.deleted_files, 1);
        assert_eq!(result.deleted_dirs, 3);
        assert!(result.errors.is_empty());
        assert!(!output_file.exists());
        assert!(!workspace_dir.join("generated").exists());
        assert!(!empty_leaf_dir.exists());
        assert!(!workspace_dir.join("scratch/empty").exists());
        assert!(workspace_dir.join("scratch").exists());
    }

    #[test]
    fn preserves_empty_directories_excluded_by_workspace_relative_globs() {
        let temp_dir = tempdir().unwrap();
        let workspace_dir = temp_dir.path().join("workspace");
        let excluded_leaf_dir = workspace_dir.join("volumes/cache/leaf");
        let regular_leaf_dir = workspace_dir.join("scratch/empty/leaf");

        fs::create_dir_all(&excluded_leaf_dir).unwrap();
        fs::create_dir_all(&regular_leaf_dir).unwrap();

        let mut snapshot =
            single_plugin_snapshot(&workspace_dir, vec![], CleanupDeclarationsDto::default());
        snapshot.empty_dir_exclude_globs = vec!["volumes/**".to_string()];

        let plan = plan_cleanup(snapshot).unwrap();
        assert!(!plan
            .empty_dirs_to_delete
            .contains(&path_to_string(&workspace_dir.join("volumes/cache"))));
        assert!(!plan
            .empty_dirs_to_delete
            .contains(&path_to_string(&excluded_leaf_dir)));
        assert!(plan
            .empty_dirs_to_delete
            .contains(&path_to_string(&workspace_dir.join("scratch/empty"))));
        assert!(plan
            .empty_dirs_to_delete
            .contains(&path_to_string(&regular_leaf_dir)));
    }

    #[test]
    fn skips_reserved_volume_trees_during_empty_directory_scan() {
        let temp_dir = tempdir().unwrap();
        let workspace_dir = temp_dir.path().join("workspace");
        let volumes_leaf_dir = workspace_dir.join("volumes/cache/leaf");
        let hidden_volumes_leaf_dir = workspace_dir.join(".volumes/cache/leaf");
        let regular_leaf_dir = workspace_dir.join("scratch/empty/leaf");

        fs::create_dir_all(&volumes_leaf_dir).unwrap();
        fs::create_dir_all(&hidden_volumes_leaf_dir).unwrap();
        fs::create_dir_all(&regular_leaf_dir).unwrap();

        let snapshot =
            single_plugin_snapshot(&workspace_dir, vec![], CleanupDeclarationsDto::default());

        let plan = plan_cleanup(snapshot).unwrap();
        assert!(!plan
            .empty_dirs_to_delete
            .contains(&path_to_string(&workspace_dir.join("volumes/cache"))));
        assert!(!plan
            .empty_dirs_to_delete
            .contains(&path_to_string(&volumes_leaf_dir)));
        assert!(!plan
            .empty_dirs_to_delete
            .contains(&path_to_string(&workspace_dir.join(".volumes/cache"))));
        assert!(!plan
            .empty_dirs_to_delete
            .contains(&path_to_string(&hidden_volumes_leaf_dir)));
        assert!(plan
            .empty_dirs_to_delete
            .contains(&path_to_string(&workspace_dir.join("scratch/empty"))));
        assert!(plan
            .empty_dirs_to_delete
            .contains(&path_to_string(&regular_leaf_dir)));
    }

    #[test]
    fn batched_glob_planner_handles_multiple_globs_sharing_root() {
        let temp_dir = tempdir().unwrap();
        let workspace_dir = temp_dir.path().join("workspace");
        let cache_dir = workspace_dir.join("cache");
        let temp_dir_path = workspace_dir.join("temp");
        let logs_dir = workspace_dir.join("logs");

        // Create test directories
        fs::create_dir_all(cache_dir.join("sub1")).unwrap();
        fs::create_dir_all(cache_dir.join("sub2")).unwrap();
        fs::create_dir_all(temp_dir_path.join("tmp1")).unwrap();
        fs::create_dir_all(logs_dir.join("2024")).unwrap();

        let snapshot = single_plugin_snapshot(
            &workspace_dir,
            vec![],
            CleanupDeclarationsDto {
                delete: vec![
                    CleanupTargetDto {
                        path: path_to_string(&cache_dir.join("*")),
                        kind: CleanupTargetKindDto::Glob,
                        exclude_basenames: Vec::new(),
                        protection_mode: None,
                        scope: None,
                        label: Some("cache-cleanup".to_string()),
                    },
                    CleanupTargetDto {
                        path: path_to_string(&temp_dir_path.join("*")),
                        kind: CleanupTargetKindDto::Glob,
                        exclude_basenames: Vec::new(),
                        protection_mode: None,
                        scope: None,
                        label: Some("temp-cleanup".to_string()),
                    },
                ],
                ..CleanupDeclarationsDto::default()
            },
        );

        let plan = plan_cleanup(snapshot).unwrap();
        // Should match subdirectories under cache/ and temp/ but not logs/
        assert_eq!(plan.dirs_to_delete.len(), 3);
        assert!(plan
            .dirs_to_delete
            .contains(&path_to_string(&cache_dir.join("sub1"))));
        assert!(plan
            .dirs_to_delete
            .contains(&path_to_string(&cache_dir.join("sub2"))));
        assert!(plan
            .dirs_to_delete
            .contains(&path_to_string(&temp_dir_path.join("tmp1"))));
        assert!(!plan
            .dirs_to_delete
            .contains(&path_to_string(&logs_dir.join("2024"))));
    }

    #[test]
    fn batched_glob_planner_handles_mixed_protect_and_delete_globs() {
        let temp_dir = tempdir().unwrap();
        let workspace_dir = temp_dir.path().join("workspace");
        let data_dir = workspace_dir.join("data");
        let keep_dir = data_dir.join("keep");
        let delete_dir = data_dir.join("delete");

        fs::create_dir_all(&keep_dir).unwrap();
        fs::create_dir_all(&delete_dir).unwrap();

        let snapshot = single_plugin_snapshot(
            &workspace_dir,
            vec![],
            CleanupDeclarationsDto {
                delete: vec![CleanupTargetDto {
                    path: path_to_string(&data_dir.join("*")),
                    kind: CleanupTargetKindDto::Glob,
                    exclude_basenames: Vec::new(),
                    protection_mode: None,
                    scope: None,
                    label: None,
                }],
                protect: vec![CleanupTargetDto {
                    // Protect the keep_dir itself using Recursive mode to protect its descendants too
                    path: path_to_string(&keep_dir),
                    kind: CleanupTargetKindDto::Directory,
                    exclude_basenames: Vec::new(),
                    protection_mode: Some(ProtectionModeDto::Recursive),
                    scope: None,
                    label: Some("protect-keep".to_string()),
                }],
                ..CleanupDeclarationsDto::default()
            },
        );

        let plan = plan_cleanup(snapshot).unwrap();
        // delete_dir should be deleted, keep_dir should NOT be deleted (protected by Directory target)
        assert!(plan.dirs_to_delete.contains(&path_to_string(&delete_dir)));
        assert!(!plan.dirs_to_delete.contains(&path_to_string(&keep_dir)));
        // keep_dir is protected, so attempting to delete it is a violation
        assert!(plan
            .violations
            .iter()
            .any(|v| v.target_path == path_to_string(&keep_dir)));
    }

    #[test]
    fn batched_glob_planner_respects_exclude_basenames() {
        let temp_dir = tempdir().unwrap();
        let workspace_dir = temp_dir.path().join("workspace");
        let build_dir = workspace_dir.join("build");
        let release_dir = build_dir.join("release");
        let debug_dir = build_dir.join("debug");
        let keep_dir = build_dir.join(".gitkeep");

        fs::create_dir_all(&release_dir).unwrap();
        fs::create_dir_all(&debug_dir).unwrap();
        fs::create_dir_all(&keep_dir).unwrap();

        let snapshot = single_plugin_snapshot(
            &workspace_dir,
            vec![],
            CleanupDeclarationsDto {
                delete: vec![CleanupTargetDto {
                    path: path_to_string(&build_dir.join("*")),
                    kind: CleanupTargetKindDto::Glob,
                    exclude_basenames: vec![".gitkeep".to_string()],
                    protection_mode: None,
                    scope: None,
                    label: Some("build-cleanup".to_string()),
                }],
                ..CleanupDeclarationsDto::default()
            },
        );

        let plan = plan_cleanup(snapshot).unwrap();
        // Should delete release and debug, but not .gitkeep
        assert!(plan.dirs_to_delete.contains(&path_to_string(&release_dir)));
        assert!(plan.dirs_to_delete.contains(&path_to_string(&debug_dir)));
        assert!(!plan.dirs_to_delete.contains(&path_to_string(&keep_dir)));
    }

    #[test]
    fn batched_glob_planner_produces_stable_sorted_output() {
        let temp_dir = tempdir().unwrap();
        let workspace_dir = temp_dir.path().join("workspace");
        let outputs_dir = workspace_dir.join("outputs");

        // Create directories in non-alphabetical order
        let dirs = vec!["zeta", "alpha", "beta", "gamma", "delta"];
        for dir in &dirs {
            fs::create_dir_all(outputs_dir.join(dir)).unwrap();
        }

        let snapshot = single_plugin_snapshot(
            &workspace_dir,
            vec![],
            CleanupDeclarationsDto {
                delete: vec![CleanupTargetDto {
                    path: path_to_string(&outputs_dir.join("*")),
                    kind: CleanupTargetKindDto::Glob,
                    exclude_basenames: Vec::new(),
                    protection_mode: None,
                    scope: None,
                    label: None,
                }],
                ..CleanupDeclarationsDto::default()
            },
        );

        let plan = plan_cleanup(snapshot).unwrap();

        // Verify output is sorted
        let expected_order: Vec<String> = dirs
            .iter()
            .map(|d| path_to_string(&outputs_dir.join(d)))
            .collect::<Vec<_>>()
            .into_iter()
            .collect::<std::collections::BTreeSet<_>>()
            .into_iter()
            .collect();

        assert_eq!(plan.dirs_to_delete, expected_order);

        // Run multiple times to ensure stability
        for _ in 0..3 {
            let plan2 = plan_cleanup(single_plugin_snapshot(
                &workspace_dir,
                vec![],
                CleanupDeclarationsDto {
                    delete: vec![CleanupTargetDto {
                        path: path_to_string(&outputs_dir.join("*")),
                        kind: CleanupTargetKindDto::Glob,
                        exclude_basenames: Vec::new(),
                        protection_mode: None,
                        scope: None,
                        label: None,
                    }],
                    ..CleanupDeclarationsDto::default()
                },
            ))
            .unwrap();
            assert_eq!(plan.dirs_to_delete, plan2.dirs_to_delete);
        }
    }

    #[test]
    fn batched_glob_planner_handles_file_vs_directory_classification() {
        let temp_dir = tempdir().unwrap();
        let workspace_dir = temp_dir.path().join("workspace");
        let mixed_dir = workspace_dir.join("mixed");
        let file_path = mixed_dir.join("file.txt");
        let dir_path = mixed_dir.join("subdir");

        fs::create_dir_all(&dir_path).unwrap();
        fs::write(&file_path, "content").unwrap();

        let snapshot = single_plugin_snapshot(
            &workspace_dir,
            vec![],
            CleanupDeclarationsDto {
                delete: vec![CleanupTargetDto {
                    path: path_to_string(&mixed_dir.join("*")),
                    kind: CleanupTargetKindDto::Glob,
                    exclude_basenames: Vec::new(),
                    protection_mode: None,
                    scope: None,
                    label: None,
                }],
                ..CleanupDeclarationsDto::default()
            },
        );

        let plan = plan_cleanup(snapshot).unwrap();

        // Files should be in files_to_delete, dirs in dirs_to_delete
        assert!(plan.files_to_delete.contains(&path_to_string(&file_path)));
        assert!(plan.dirs_to_delete.contains(&path_to_string(&dir_path)));
    }

    #[test]
    fn batched_glob_planner_handles_cross_plugin_glob_batching() {
        let temp_dir = tempdir().unwrap();
        let workspace_dir = temp_dir.path().join("workspace");
        let project_a = workspace_dir.join("project-a/temp");
        let project_b = workspace_dir.join("project-b/temp");

        fs::create_dir_all(project_a.join("old")).unwrap();
        fs::create_dir_all(project_b.join("cache")).unwrap();

        // Multi-plugin snapshot to test cross-plugin batching
        let snapshot = CleanupSnapshot {
            workspace_dir: path_to_string(&workspace_dir),
            aindex_dir: Some(path_to_string(&workspace_dir.join("aindex"))),
            project_roots: vec![
                path_to_string(&workspace_dir.join("project-a")),
                path_to_string(&workspace_dir.join("project-b")),
            ],
            protected_rules: Vec::new(),
            plugin_snapshots: vec![
                PluginCleanupSnapshotDto {
                    plugin_name: "PluginA".to_string(),
                    outputs: vec![],
                    cleanup: CleanupDeclarationsDto {
                        delete: vec![CleanupTargetDto {
                            path: path_to_string(&project_a.join("*")),
                            kind: CleanupTargetKindDto::Glob,
                            exclude_basenames: Vec::new(),
                            protection_mode: None,
                            scope: None,
                            label: None,
                        }],
                        ..CleanupDeclarationsDto::default()
                    },
                },
                PluginCleanupSnapshotDto {
                    plugin_name: "PluginB".to_string(),
                    outputs: vec![],
                    cleanup: CleanupDeclarationsDto {
                        delete: vec![CleanupTargetDto {
                            path: path_to_string(&project_b.join("*")),
                            kind: CleanupTargetKindDto::Glob,
                            exclude_basenames: Vec::new(),
                            protection_mode: None,
                            scope: None,
                            label: None,
                        }],
                        ..CleanupDeclarationsDto::default()
                    },
                },
            ],
            empty_dir_exclude_globs: Vec::new(),
        };

        let plan = plan_cleanup(snapshot).unwrap();

        // Both plugins' globs should be resolved
        assert_eq!(plan.dirs_to_delete.len(), 2);
        assert!(plan
            .dirs_to_delete
            .contains(&path_to_string(&project_a.join("old"))));
        assert!(plan
            .dirs_to_delete
            .contains(&path_to_string(&project_b.join("cache"))));
    }
}
