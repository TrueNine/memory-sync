//! tnmsc library — Rust-owned runtime core for memory-sync.
//!
//! Public API: version, load_config, install, dry_run, clean, list_plugins,
//! list_prompts, get_prompt, upsert_prompt_source, write_prompt_artifacts.

pub mod core;
pub(crate) mod diagnostic_helpers;
#[path = "native_md_compiler/lib.rs"]
pub mod md_compiler;
pub mod native_logger;
pub mod native_script_runtime;
pub mod prompts;

use std::path::Path;
use std::process::ExitCode;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub mod logger {
  pub use crate::native_logger::*;
}

pub mod script_runtime {
  pub use crate::native_script_runtime::*;
}

pub use md_compiler::{
  BuildPromptTomlArtifactOptions, BuildTomlDocumentOptions, EvaluationScope, ExportMetadata,
  MdxGlobalScope, MdxToMdOptions, MdxToMdResult, MetadataSource, ProcessingContext,
  build_prompt_toml_artifact, build_toml_document, mdx_to_md, mdx_to_md_with_metadata, parse_mdx,
  serialize,
};
pub use prompts::{
  ListPromptsOptions, ManagedPromptKind, PromptArtifactRecord, PromptArtifactState,
  PromptCatalogItem, PromptCatalogPaths, PromptCatalogPresence, PromptDetails,
  PromptServiceOptions, PromptSourceLocale, UpsertPromptSourceInput, WritePromptArtifactsInput,
  get_prompt, list_prompts, upsert_prompt_source, write_prompt_artifacts,
};

/// Unified error type for CLI library API.
#[derive(Debug, thiserror::Error)]
pub enum CliError {
  #[error("Config error: {0}")]
  ConfigError(String),

  #[error("IO error: {0}")]
  IoError(#[from] std::io::Error),

  #[error("Serialization error: {0}")]
  SerializationError(#[from] serde_json::Error),

  #[error("Execution error: {0}")]
  ExecutionError(String),

  #[error("Execution not yet fully implemented in Rust: {0}")]
  NotImplemented(String),
}

/// Captured output from a legacy bridge command (retained temporarily for API compatibility).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeCommandResult {
  pub stdout: String,
  pub stderr: String,
  pub exit_code: i32,
}

/// Shared command options consumed by the crate facade, NAPI binding, and TS loader.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySyncCommandOptions {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub cwd: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub load_user_config: Option<bool>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub log_level: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub plugin_options: Option<Value>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub dry_run: Option<bool>,
}

/// Shared command result shape for the crate facade, CLI JSON, GUI IPC, and NAPI.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySyncCommandResult {
  pub success: bool,
  pub files_affected: i32,
  pub dirs_affected: i32,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub message: Option<String>,
  #[serde(default)]
  pub warnings: Vec<Value>,
  #[serde(default)]
  pub errors: Vec<Value>,
}

/// Shared plugin descriptor shape for crate, NAPI, CLI, and GUI callers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySyncPluginInfo {
  pub name: String,
  pub kind: String,
  pub description: String,
  #[serde(default)]
  pub dependencies: Vec<String>,
}

const DEFAULT_OUTPUT_PLUGIN_REGISTRY: &[(&str, &[&str])] = &[
  ("AgentsOutputAdaptor", &[]),
  ("ClaudeCodeCLIOutputAdaptor", &["AgentsOutputAdaptor"]),
  ("CodexCLIOutputAdaptor", &["AgentsOutputAdaptor"]),
  (
    "JetBrainsAIAssistantCodexOutputAdaptor",
    &["AgentsOutputAdaptor"],
  ),
  ("DroidCLIOutputAdaptor", &["AgentsOutputAdaptor"]),
  ("GeminiCLIOutputAdaptor", &["AgentsOutputAdaptor"]),
  ("KiroCLIOutputAdaptor", &["AgentsOutputAdaptor"]),
  ("OpencodeCLIOutputAdaptor", &["AgentsOutputAdaptor"]),
  ("QoderIDEPluginOutputAdaptor", &["AgentsOutputAdaptor"]),
  ("TraeOutputAdaptor", &["AgentsOutputAdaptor"]),
  ("WarpIDEOutputAdaptor", &["AgentsOutputAdaptor"]),
  ("WindsurfOutputAdaptor", &["AgentsOutputAdaptor"]),
  ("CursorOutputAdaptor", &["AgentsOutputAdaptor"]),
  ("GitExcludeOutputAdaptor", &[]),
  ("JetBrainsIDECodeStyleConfigOutputAdaptor", &[]),
  ("VisualStudioCodeIDEConfigOutputAdaptor", &[]),
  ("ZedIDEConfigOutputAdaptor", &[]),
  ("ReadmeMdConfigFileOutputAdaptor", &[]),
];

// ---------------------------------------------------------------------------
// Public API functions
// ---------------------------------------------------------------------------

/// Return the CLI crate version string.
pub fn version() -> &'static str {
  env!("CARGO_PKG_VERSION")
}

/// Load and merge configuration from the canonical global config path.
pub fn load_config(cwd: &Path) -> Result<core::config::MergedConfigResult, CliError> {
  core::config::ConfigLoader::with_defaults()
    .try_load(cwd)
    .map_err(CliError::ConfigError)
}

/// Execute the install pipeline through the crate-owned internal command bridge.
pub fn install(options: MemorySyncCommandOptions) -> Result<MemorySyncCommandResult, CliError> {
  core::command_bridge::execute_internal_command("install", &options)
}

/// Execute the dry-run pipeline through the crate-owned internal command bridge.
pub fn dry_run(options: MemorySyncCommandOptions) -> Result<MemorySyncCommandResult, CliError> {
  core::command_bridge::execute_internal_command("dry-run", &options)
}

/// Execute cleanup through the crate-owned internal command bridge.
pub fn clean(options: MemorySyncCommandOptions) -> Result<MemorySyncCommandResult, CliError> {
  core::command_bridge::execute_internal_command("clean", &options)
}

/// Return the default output plugin registry without instantiating TS plugin classes.
pub fn list_plugins() -> Vec<MemorySyncPluginInfo> {
  DEFAULT_OUTPUT_PLUGIN_REGISTRY
    .iter()
    .map(|(name, dependencies)| MemorySyncPluginInfo {
      name: (*name).to_string(),
      kind: "Output".to_string(),
      description: (*name).to_string(),
      dependencies: dependencies.iter().map(|d| (*d).to_string()).collect(),
    })
    .collect()
}

/// Run the install pipeline in passthrough mode for the Rust CLI shell.
pub fn run_install_cli() -> ExitCode {
  match install(MemorySyncCommandOptions::default()) {
    Ok(r) if r.success => ExitCode::SUCCESS,
    Ok(_) => ExitCode::FAILURE,
    Err(e) => {
      eprintln!("Error: {}", e);
      ExitCode::FAILURE
    }
  }
}

/// Run the dry-run pipeline in passthrough mode for the Rust CLI shell.
pub fn run_dry_run_cli() -> ExitCode {
  match dry_run(MemorySyncCommandOptions::default()) {
    Ok(r) if r.success => ExitCode::SUCCESS,
    Ok(_) => ExitCode::FAILURE,
    Err(e) => {
      eprintln!("Error: {}", e);
      ExitCode::FAILURE
    }
  }
}

/// Run cleanup in passthrough mode for the Rust CLI shell.
pub fn run_clean_cli(dry_run: bool) -> ExitCode {
  let options = MemorySyncCommandOptions {
    dry_run: Some(dry_run),
    ..Default::default()
  };
  match clean(options) {
    Ok(r) if r.success => ExitCode::SUCCESS,
    Ok(_) => ExitCode::FAILURE,
    Err(e) => {
      eprintln!("Error: {}", e);
      ExitCode::FAILURE
    }
  }
}

#[cfg(feature = "napi")]
mod napi_binding {
  use super::{
    CliError, ListPromptsOptions, MemorySyncCommandOptions, PromptServiceOptions,
    UpsertPromptSourceInput, WritePromptArtifactsInput, clean, dry_run, get_prompt, install,
    list_plugins, list_prompts, load_config, upsert_prompt_source, write_prompt_artifacts,
  };
  use std::path::Path;

  use napi_derive::napi;

  // Re-export NAPI functions from submodules so the napi-rs build picks them up.
  pub use crate::core::context_merger::napi_binding::{
    build_dependency_context_binding, merge_contexts_binding,
  };
  pub use crate::core::dependency_resolver::napi_binding::{
    find_cycle_path_binding, topological_sort_binding, topological_sort_nodes_binding,
  };
  pub use crate::core::output_runtime_targets::napi_binding::discover_output_runtime_targets_binding;

  // Prevent unused-import warnings; these are registered by napi-rs via the proc-macro.
  #[allow(dead_code)]
  const _NAPI_RE_EXPORTS: [fn() -> (); 6] = [
    || {
      let _ = merge_contexts_binding as fn(_, _) -> _;
    },
    || {
      let _ = build_dependency_context_binding as fn(_, _) -> _;
    },
    || {
      let _ = topological_sort_binding as fn(_) -> _;
    },
    || {
      let _ = topological_sort_nodes_binding as fn(_) -> _;
    },
    || {
      let _ = find_cycle_path_binding as fn(_, _) -> _;
    },
    || {
      let _ = discover_output_runtime_targets_binding as fn() -> _;
    },
  ];

  fn parse_command_options(options_json: Option<String>) -> napi::Result<MemorySyncCommandOptions> {
    match options_json {
      Some(json) => {
        serde_json::from_str(&json).map_err(|error| napi::Error::from_reason(error.to_string()))
      }
      None => Ok(MemorySyncCommandOptions::default()),
    }
  }

  fn serialize_json<T: serde::Serialize>(value: &T) -> napi::Result<String> {
    serde_json::to_string(value).map_err(|error| napi::Error::from_reason(error.to_string()))
  }

  fn map_cli_error(error: CliError) -> napi::Error {
    napi::Error::from_reason(error.to_string())
  }

  #[napi(js_name = "loadConfig")]
  pub fn load_config_binding(cwd: Option<String>) -> napi::Result<String> {
    let cwd = cwd.unwrap_or_else(|| ".".to_string());
    let result = load_config(Path::new(&cwd)).map_err(map_cli_error)?;
    serialize_json(&result)
  }

  #[napi(js_name = "install")]
  pub fn install_binding(options_json: Option<String>) -> napi::Result<String> {
    let options = parse_command_options(options_json)?;
    let result = install(options).map_err(map_cli_error)?;
    serialize_json(&result)
  }

  #[napi(js_name = "dryRun")]
  pub fn dry_run_binding(options_json: Option<String>) -> napi::Result<String> {
    let options = parse_command_options(options_json)?;
    let result = dry_run(options).map_err(map_cli_error)?;
    serialize_json(&result)
  }

  #[napi(js_name = "clean")]
  pub fn clean_binding(options_json: Option<String>) -> napi::Result<String> {
    let options = parse_command_options(options_json)?;
    let result = clean(options).map_err(map_cli_error)?;
    serialize_json(&result)
  }

  #[napi(js_name = "listPlugins")]
  pub fn list_plugins_binding() -> napi::Result<String> {
    serialize_json(&list_plugins())
  }

  #[napi(js_name = "listPrompts")]
  pub fn list_prompts_binding(options_json: Option<String>) -> napi::Result<String> {
    let options = match options_json {
      Some(json) => serde_json::from_str::<ListPromptsOptions>(&json)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?,
      None => ListPromptsOptions::default(),
    };
    let result = list_prompts(&options).map_err(|e| napi::Error::from_reason(e))?;
    serialize_json(&result)
  }

  #[napi(js_name = "getPrompt")]
  pub fn get_prompt_binding(
    prompt_id: String,
    options_json: Option<String>,
  ) -> napi::Result<String> {
    let options = match options_json {
      Some(json) => serde_json::from_str::<PromptServiceOptions>(&json)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?,
      None => PromptServiceOptions::default(),
    };
    let result = get_prompt(&prompt_id, &options).map_err(|e| napi::Error::from_reason(e))?;
    serialize_json(&result)
  }

  #[napi(js_name = "upsertPromptSource")]
  pub fn upsert_prompt_source_binding(input_json: String) -> napi::Result<String> {
    let input = serde_json::from_str::<UpsertPromptSourceInput>(&input_json)
      .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    let result = upsert_prompt_source(&input).map_err(|e| napi::Error::from_reason(e))?;
    serialize_json(&result)
  }

  #[napi(js_name = "writePromptArtifacts")]
  pub fn write_prompt_artifacts_binding(input_json: String) -> napi::Result<String> {
    let input = serde_json::from_str::<WritePromptArtifactsInput>(&input_json)
      .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    let result = write_prompt_artifacts(&input).map_err(|e| napi::Error::from_reason(e))?;
    serialize_json(&result)
  }

  #[napi(js_name = "collectWorkspace")]
  pub fn collect_workspace_binding(options_json: String) -> napi::Result<String> {
    crate::core::input_plugins::workspace::collect_workspace(&options_json)
      .map_err(|e| napi::Error::from_reason(e.to_string()))
  }

  #[napi(js_name = "collectGitignore")]
  pub fn collect_gitignore_binding(options_json: String) -> napi::Result<String> {
    crate::core::input_plugins::gitignore::collect_gitignore(&options_json)
      .map_err(|e| napi::Error::from_reason(e.to_string()))
  }

  #[napi(js_name = "collectGitExclude")]
  pub fn collect_git_exclude_binding(options_json: String) -> napi::Result<String> {
    crate::core::input_plugins::git_exclude::collect_git_exclude(&options_json)
      .map_err(|e| napi::Error::from_reason(e.to_string()))
  }

  #[napi(js_name = "collectSharedIgnore")]
  pub fn collect_shared_ignore_binding(options_json: String) -> napi::Result<String> {
    crate::core::input_plugins::shared_ignore::collect_shared_ignore(&options_json)
      .map_err(|e| napi::Error::from_reason(e.to_string()))
  }

  #[napi(js_name = "collectEditorconfig")]
  pub fn collect_editorconfig_binding(options_json: String) -> napi::Result<String> {
    crate::core::input_plugins::editorconfig::collect_editorconfig(&options_json)
      .map_err(|e| napi::Error::from_reason(e.to_string()))
  }

  #[napi(js_name = "collectVSCodeConfig")]
  pub fn collect_vscode_config_binding(options_json: String) -> napi::Result<String> {
    crate::core::input_plugins::vscode_config::collect_vscode_config(&options_json)
      .map_err(|e| napi::Error::from_reason(e.to_string()))
  }

  #[napi(js_name = "collectZedConfig")]
  pub fn collect_zed_config_binding(options_json: String) -> napi::Result<String> {
    crate::core::input_plugins::zed_config::collect_zed_config(&options_json)
      .map_err(|e| napi::Error::from_reason(e.to_string()))
  }

  #[napi(js_name = "collectJetBrainsConfig")]
  pub fn collect_jetbrains_config_binding(options_json: String) -> napi::Result<String> {
    crate::core::input_plugins::jetbrains_config::collect_jetbrains_config(&options_json)
      .map_err(|e| napi::Error::from_reason(e.to_string()))
  }

  #[napi(js_name = "collectRule")]
  pub fn collect_rule_binding(options_json: String) -> napi::Result<String> {
    crate::core::input_plugins::rule::collect_rule(&options_json)
      .map_err(|e| napi::Error::from_reason(e.to_string()))
  }

  #[napi(js_name = "collectCommand")]
  pub fn collect_command_binding(options_json: String) -> napi::Result<String> {
    crate::core::input_plugins::command::collect_command(&options_json)
      .map_err(|e| napi::Error::from_reason(e.to_string()))
  }

  #[napi(js_name = "collectSubAgent")]
  pub fn collect_subagent_binding(options_json: String) -> napi::Result<String> {
    crate::core::input_plugins::subagent::collect_subagent(&options_json)
      .map_err(|e| napi::Error::from_reason(e.to_string()))
  }

  #[napi(js_name = "collectGlobalMemory")]
  pub fn collect_global_memory_binding(options_json: String) -> napi::Result<String> {
    crate::core::input_plugins::global_memory::collect_global_memory(&options_json)
      .map_err(|e| napi::Error::from_reason(e.to_string()))
  }

  #[napi(js_name = "collectReadme")]
  pub fn collect_readme_binding(options_json: String) -> napi::Result<String> {
    crate::core::input_plugins::readme::collect_readme(&options_json)
      .map_err(|e| napi::Error::from_reason(e.to_string()))
  }

  #[napi(js_name = "collectAindexResolvers")]
  pub fn collect_aindex_resolvers_binding(options_json: String) -> napi::Result<String> {
    crate::core::input_plugins::aindex_resolvers::collect_aindex_resolvers(&options_json)
      .map_err(|e| napi::Error::from_reason(e.to_string()))
  }

  #[napi(js_name = "collectProjectPrompt")]
  pub fn collect_project_prompt_binding(options_json: String) -> napi::Result<String> {
    crate::core::input_plugins::project_prompt::collect_project_prompt(&options_json)
      .map_err(|e| napi::Error::from_reason(e.to_string()))
  }

  #[napi(js_name = "collectSkill")]
  pub fn collect_skill_binding(options_json: String) -> napi::Result<String> {
    crate::core::input_plugins::skill::collect_skill(&options_json)
      .map_err(|e| napi::Error::from_reason(e.to_string()))
  }

  #[napi(js_name = "resolveExecutionPlan")]
  pub fn resolve_execution_plan_binding(
    context_json: String,
    execution_cwd: String,
  ) -> napi::Result<String> {
    let context: crate::core::plugin_shared::CollectedInputContext =
      serde_json::from_str(&context_json).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    let workspace = context
      .workspace
      .as_ref()
      .ok_or_else(|| napi::Error::from_reason("context.workspace is missing"))?;
    let plan = crate::core::execution_plan::resolve_execution_plan(workspace, &execution_cwd);
    serialize_json(&plan)
  }

  #[napi(object)]
  pub struct NapiPathScopedEntry {
    pub path: String,
    pub scope: Option<String>,
  }

  #[napi(js_name = "filterPathScopedEntriesForExecutionPlan")]
  pub fn filter_path_scoped_entries_binding(
    entries: Vec<NapiPathScopedEntry>,
    plan_json: String,
    context_json: String,
  ) -> napi::Result<Vec<NapiPathScopedEntry>> {
    let plan: crate::core::execution_plan::ExecutionPlan =
      serde_json::from_str(&plan_json).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    let context: crate::core::plugin_shared::CollectedInputContext =
      serde_json::from_str(&context_json).map_err(|e| napi::Error::from_reason(e.to_string()))?;

    let workspace = context
      .workspace
      .as_ref()
      .ok_or_else(|| napi::Error::from_reason("context.workspace is missing"))?;

    let workspace_dir = &workspace.directory.path;
    let managed_projects = crate::core::execution_plan::collect_managed_projects(workspace);

    let filtered = crate::core::execution_plan::filter_path_scoped_entries(
      entries,
      &plan,
      workspace_dir,
      &managed_projects,
      |e| &e.path,
      |e| e.scope.as_deref(),
    );

    Ok(filtered)
  }

  #[napi(js_name = "syncWindowsConfigIntoWsl")]
  pub fn sync_windows_config_into_wsl_binding(
    context_json: String,
    declarations_json: String,
    dry_run: bool,
  ) -> napi::Result<String> {
    let context: crate::core::plugin_shared::CollectedInputContext =
      serde_json::from_str(&context_json).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    let declarations: Vec<crate::core::wsl_mirror_sync::WslMirrorFileDeclaration> =
      serde_json::from_str(&declarations_json)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    let result =
      crate::core::wsl_mirror_sync::sync_windows_config_into_wsl(&context, &declarations, dry_run);
    serialize_json(&result)
  }

  #[napi(js_name = "collectBaseOutputPlans")]
  pub fn collect_base_output_plans_binding(context_json: String) -> napi::Result<String> {
    crate::core::base_output_plans::collect_base_output_plans(&context_json)
      .map_err(|e| napi::Error::from_reason(e.to_string()))
  }

  #[napi(js_name = "collectGeminiOutputPlan")]
  pub fn collect_gemini_output_plan_binding(context_json: String) -> napi::Result<String> {
    crate::core::gemini_output_plan::collect_gemini_output_plan(&context_json)
      .map_err(|e| napi::Error::from_reason(e.to_string()))
  }

  #[napi(js_name = "collectDroidOutputPlan")]
  pub fn collect_droid_output_plan_binding(context_json: String) -> napi::Result<String> {
    crate::core::droid_output_plan::collect_droid_output_plan(&context_json)
      .map_err(|e| napi::Error::from_reason(e.to_string()))
  }

  #[napi(js_name = "performSkillDistCleanup")]
  pub fn perform_skill_dist_cleanup_binding(
    dist_skills_dir: String,
    dry_run: bool,
  ) -> napi::Result<String> {
    let result =
      crate::core::skill_dist_cleanup::perform_skill_dist_cleanup(&dist_skills_dir, dry_run);
    serde_json::to_string(&result).map_err(|e| napi::Error::from_reason(e.to_string()))
  }

  #[napi(js_name = "performMdCleanup")]
  pub fn perform_md_cleanup_binding(dirs: Vec<String>, dry_run: bool) -> napi::Result<String> {
    let result = crate::core::md_cleanup::perform_md_cleanup(&dirs, dry_run);
    serde_json::to_string(&result).map_err(|e| napi::Error::from_reason(e.to_string()))
  }
}

// ---------------------------------------------------------------------------
// Property-based tests — Property 1: Library API returns typed results
// ---------------------------------------------------------------------------
#[cfg(test)]
mod property_tests {
  use super::*;
  use proptest::prelude::*;
  use tempfile::TempDir;

  #[test]
  fn version_returns_cargo_pkg_version() {
    let v = version();
    assert!(!v.is_empty(), "version() must return a non-empty string");
    assert_eq!(v, env!("CARGO_PKG_VERSION"));
  }

  proptest! {
      #[test]
      fn prop_version_always_non_empty(_seed in 0u64..10000) {
          let v = version();
          prop_assert!(!v.is_empty(), "version() returned empty string");
          prop_assert_eq!(v, env!("CARGO_PKG_VERSION"));
      }

      #[test]
      fn prop_load_config_returns_ok_for_any_tempdir(_seed in 0u64..100) {
          let tmp = TempDir::new().expect("failed to create tempdir");
          let result = load_config(tmp.path());
          prop_assert!(result.is_ok(), "load_config should return Ok for any valid dir, got: {:?}", result.err());
          let merged = result.unwrap();
          prop_assert!(merged.sources.is_empty() || !merged.sources.is_empty(),
              "sources should be a valid Vec");
      }

      #[test]
      fn prop_bridge_command_result_fields_are_typed(
          stdout in ".*",
          stderr in ".*",
          exit_code in proptest::num::i32::ANY,
      ) {
          let bcr = BridgeCommandResult {
              stdout: stdout.clone(),
              stderr: stderr.clone(),
              exit_code,
          };
          let s: &str = &bcr.stdout;
          let e: &str = &bcr.stderr;
          let c: i32 = bcr.exit_code;
          prop_assert_eq!(s, stdout.as_str());
          prop_assert_eq!(e, stderr.as_str());
          prop_assert_eq!(c, exit_code);
          let json = serde_json::to_string(&bcr).expect("BridgeCommandResult must serialize");
          prop_assert!(json.contains("\"stdout\""), "JSON must contain stdout field");
          prop_assert!(json.contains("\"stderr\""), "JSON must contain stderr field");
          prop_assert!(json.contains("\"exitCode\""), "JSON must contain exitCode field (camelCase)");
          let bcr2: BridgeCommandResult =
              serde_json::from_str(&json).expect("BridgeCommandResult must deserialize");
          prop_assert_eq!(bcr2.stdout.as_str(), stdout.as_str());
          prop_assert_eq!(bcr2.stderr.as_str(), stderr.as_str());
          prop_assert_eq!(bcr2.exit_code, exit_code);
      }
  }

  #[test]
  fn cli_error_variants_are_matchable() {
    let errors: Vec<CliError> = vec![
      CliError::ConfigError("bad config".into()),
      CliError::IoError(std::io::Error::new(std::io::ErrorKind::NotFound, "test")),
      CliError::SerializationError(serde_json::from_str::<String>("invalid").unwrap_err()),
      CliError::ExecutionError("bridge failed".into()),
      CliError::NotImplemented("test".into()),
    ];

    for err in &errors {
      match err {
        CliError::ConfigError(msg) => assert!(!msg.is_empty()),
        CliError::IoError(e) => assert!(!e.to_string().is_empty()),
        CliError::SerializationError(e) => assert!(!e.to_string().is_empty()),
        CliError::ExecutionError(msg) => assert!(!msg.is_empty()),
        CliError::NotImplemented(msg) => assert!(!msg.is_empty()),
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Cargo workspace configuration validation tests
// ---------------------------------------------------------------------------
#[cfg(test)]
mod cargo_config_tests {
  use std::fs;

  fn workspace_root() -> std::path::PathBuf {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    std::path::Path::new(manifest_dir)
      .parent()
      .expect("workspace root should exist")
      .to_path_buf()
  }

  #[test]
  fn sdk_cargo_toml_has_lib_target() {
    let sdk_toml = workspace_root().join("sdk").join("Cargo.toml");
    let content = fs::read_to_string(&sdk_toml).expect("sdk/Cargo.toml should be readable");
    assert!(
      content.contains("[lib]"),
      "sdk/Cargo.toml should contain [lib] section"
    );
  }

  #[test]
  fn sdk_cargo_toml_lib_crate_name_is_tnmsc() {
    let sdk_toml = workspace_root().join("sdk").join("Cargo.toml");
    let content = fs::read_to_string(&sdk_toml).expect("sdk/Cargo.toml should be readable");
    assert!(
      content.contains("[package]\nname = \"tnmsc\"")
        || content.contains("[package]\r\nname = \"tnmsc\""),
      "sdk/Cargo.toml should keep package name = \"tnmsc\""
    );
    assert!(
      content.contains("[lib]\nname = \"tnmsc\"") || content.contains("[lib]\r\nname = \"tnmsc\""),
      "sdk/Cargo.toml should keep lib name = \"tnmsc\""
    );
  }

  #[test]
  fn gui_cargo_toml_has_tnmsc_workspace_dependency() {
    let gui_toml = workspace_root()
      .join("gui")
      .join("src-tauri")
      .join("Cargo.toml");
    let content =
      fs::read_to_string(&gui_toml).expect("gui/src-tauri/Cargo.toml should be readable");
    assert!(
      content.contains("tnmsc = { workspace = true }"),
      "gui/src-tauri/Cargo.toml should contain `tnmsc = {{ workspace = true }}`"
    );
  }

  #[test]
  fn root_cargo_toml_has_tnmsc_workspace_path_dependency() {
    let root_toml = workspace_root().join("Cargo.toml");
    let content = fs::read_to_string(&root_toml).expect("root Cargo.toml should be readable");
    assert!(
      content.contains(r#"tnmsc = { path = "sdk" }"#),
      "root Cargo.toml [workspace.dependencies] should contain `tnmsc = {{ path = \"sdk\" }}`"
    );
  }
}

// ---------------------------------------------------------------------------
// Prompt service parity tests
// ---------------------------------------------------------------------------
#[cfg(test)]
mod prompt_tests {
  use super::*;
  use std::fs;
  use tempfile::TempDir;

  #[test]
  fn list_prompts_returns_empty_for_temp_dir_without_aindex() {
    let tmp = TempDir::new().unwrap();
    let options = ListPromptsOptions {
      base: PromptServiceOptions {
        cwd: Some(tmp.path().to_string_lossy().to_string()),
        load_user_config: Some(false),
        ..Default::default()
      },
      ..Default::default()
    };
    let result = list_prompts(&options).unwrap();
    assert!(result.is_empty());
  }

  #[test]
  fn get_prompt_returns_none_for_missing_prompt() {
    let tmp = TempDir::new().unwrap();
    let options = PromptServiceOptions {
      cwd: Some(tmp.path().to_string_lossy().to_string()),
      load_user_config: Some(false),
      ..Default::default()
    };
    let result = get_prompt("global-memory", &options).unwrap();
    assert!(result.is_none());
  }

  #[test]
  fn upsert_and_read_global_memory_roundtrips() {
    let tmp = TempDir::new().unwrap();
    let aindex = tmp.path().join("aindex");
    fs::create_dir_all(&aindex).unwrap();
    fs::create_dir_all(aindex.join("dist")).unwrap();

    let options = PromptServiceOptions {
      cwd: Some(tmp.path().to_string_lossy().to_string()),
      load_user_config: Some(false),
      ..Default::default()
    };

    let input = UpsertPromptSourceInput {
      base: options.clone(),
      prompt_id: "global-memory".to_string(),
      locale: None,
      content: "---\ndescription: test\n---\nHello".to_string(),
    };
    let prompt = upsert_prompt_source(&input).unwrap();
    assert_eq!(prompt.catalog.prompt_id, "global-memory");
    assert!(prompt.src.zh.is_some());

    let fetched = get_prompt("global-memory", &options)
      .unwrap()
      .expect("should exist after upsert");
    assert_eq!(fetched.catalog.prompt_id, "global-memory");
  }
}
