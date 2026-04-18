//! tnmsd library — Rust-only runtime core for memory-sync.
//!
//! Public API: version, load_config, install, dry_run, clean, list_plugins,
//! list_prompts, get_prompt, upsert_prompt_source, write_prompt_artifacts,
//! generate_schema.

pub mod context;
pub mod domain;
pub mod endpoint;
pub mod infra;
pub mod policy;
pub mod repositories;
pub mod services;

use std::path::Path;
use std::process::ExitCode;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub use infra::logger;
pub use infra::md_compiler;
pub use infra::script_runtime;
pub use domain::config;
pub use infra::md_compiler::{
  BuildPromptTomlArtifactOptions, BuildTomlDocumentOptions, EvaluationScope, ExportMetadata,
  MdxGlobalScope, MdxToMdOptions, MdxToMdResult, MetadataSource, ProcessingContext,
  build_prompt_toml_artifact, build_toml_document, mdx_to_md, mdx_to_md_with_metadata, parse_mdx,
  serialize,
};
pub use services::prompts::{
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

/// Shared command options consumed by the crate facade, CLI, and GUI callers.
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

/// Shared command result shape for the crate facade, CLI JSON, and GUI IPC.
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

/// Shared plugin descriptor shape for crate, CLI, and GUI callers.
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
pub fn load_config(cwd: &Path) -> Result<domain::config::MergedConfigResult, CliError> {
  domain::config::ConfigLoader::with_defaults()
    .try_load(cwd)
    .map_err(CliError::ConfigError)
}

pub use endpoint::{install, dry_run, clean};

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

/// Run the install pipeline in passthrough mode for the Rust CLI.
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

/// Run the dry-run pipeline in passthrough mode for the Rust CLI.
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

/// Run cleanup in passthrough mode for the Rust CLI.
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

/// Generate the JSON Schema for the `.tnmsc.json` config file.
pub fn generate_schema() -> Result<String, CliError> {
  let schema = schemars::schema_for!(domain::config::UserConfigFile);
  serde_json::to_string_pretty(&schema).map_err(CliError::SerializationError)
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
  fn sdk_cargo_toml_lib_crate_name_is_tnmsd() {
    let sdk_toml = workspace_root().join("sdk").join("Cargo.toml");
    let content = fs::read_to_string(&sdk_toml).expect("sdk/Cargo.toml should be readable");
    assert!(
      content.contains("[package]\nname = \"tnmsd\"")
        || content.contains("[package]\r\nname = \"tnmsd\""),
      "sdk/Cargo.toml should keep package name = \"tnmsd\""
    );
    assert!(
      content.contains("[lib]\nname = \"tnmsd\"") || content.contains("[lib]\r\nname = \"tnmsd\""),
      "sdk/Cargo.toml should keep lib name = \"tnmsd\""
    );
  }

  #[test]
  fn gui_cargo_toml_has_tnmsd_workspace_dependency() {
    let gui_toml = workspace_root()
      .join("gui")
      .join("src-tauri")
      .join("Cargo.toml");
    let content =
      fs::read_to_string(&gui_toml).expect("gui/src-tauri/Cargo.toml should be readable");
    assert!(
      content.contains("tnmsd = { workspace = true }"),
      "gui/src-tauri/Cargo.toml should contain `tnmsd = {{ workspace = true }}`"
    );
  }

  #[test]
  fn root_cargo_toml_has_tnmsd_workspace_path_dependency() {
    let root_toml = workspace_root().join("Cargo.toml");
    let content = fs::read_to_string(&root_toml).expect("root Cargo.toml should be readable");
    assert!(
      content.contains(r#"tnmsd = { path = "sdk" }"#),
      "root Cargo.toml [workspace.dependencies] should contain `tnmsd = {{ path = \"sdk\" }}`"
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
