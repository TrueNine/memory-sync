pub mod context;
pub mod domain;
pub mod endpoint;
pub mod infra;
pub mod policy;
pub mod repositories;
pub mod services;

pub use endpoint::{
  MemorySyncCommandOptions, MemorySyncCommandResult, SdkError, clean, dry_run, install,
  load_config, version,
};

pub type CliError = endpoint::SdkError;

pub use domain::config;
pub use infra::md_compiler;
pub use services::clean_service;
pub use services::dry_run_service;
pub use services::install_service;
pub use services::prompts::{
  ListPromptsOptions, ManagedPromptKind, PromptArtifactRecord, PromptArtifactState,
  PromptCatalogItem, PromptCatalogPaths, PromptCatalogPresence, PromptDetails,
  PromptServiceOptions, PromptSourceLocale, UpsertPromptSourceInput, WritePromptArtifactsInput,
  get_prompt, list_prompts, upsert_prompt_source, write_prompt_artifacts,
};

// ---------------------------------------------------------------------------
// Property-based tests — Property 1: Library API returns typed results
// ---------------------------------------------------------------------------
#[cfg(test)]
mod property_tests {
  use super::*;
  use proptest::prelude::*;

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
  }

  #[test]
  fn cli_error_variants_are_matchable() {
    let errors: Vec<CliError> = vec![
      CliError::ConfigError("bad config".into()),
      CliError::IoError(std::io::Error::new(std::io::ErrorKind::NotFound, "test")),
      CliError::SerializationError(serde_json::from_str::<String>("invalid").unwrap_err()),
      CliError::ExecutionError("execution failed".into()),
    ];

    for err in &errors {
      match err {
        CliError::ConfigError(msg) => assert!(!msg.is_empty()),
        CliError::IoError(e) => assert!(!e.to_string().is_empty()),
        CliError::SerializationError(e) => assert!(!e.to_string().is_empty()),
        CliError::ExecutionError(msg) => assert!(!msg.is_empty()),
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
