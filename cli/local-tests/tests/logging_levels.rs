//! Logging level tests for isolated local fixtures.

use std::fs;
use std::path::PathBuf;

use tnmsc_local_tests::LocalTestRunner;

struct IsolatedLoggingLevelsFixture {
  runner: LocalTestRunner,
  temp_home: PathBuf,
  project_dir: PathBuf,
}

impl IsolatedLoggingLevelsFixture {
  fn new() -> Self {
    let temp_root = std::env::temp_dir().join(format!(
      "tnmsc-local-logging-levels-{}-{}",
      std::process::id(),
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
    ));
    let temp_home = temp_root.join("home");
    let workspace_dir = temp_root.join("workspace");
    let project_dir = workspace_dir.join("memory-sync");
    let aindex_project_dir = workspace_dir.join("aindex").join("app").join("memory-sync");

    fs::create_dir_all(temp_home.join(".aindex")).unwrap();
    fs::create_dir_all(project_dir.join(".github")).unwrap();
    fs::create_dir_all(aindex_project_dir.join(".github")).unwrap();

    // issue local-tests-logging-levels-isolation: install-level logging checks
    // should not depend on host workspace protections or host plugin inventory.
    fs::write(
      temp_home.join(".aindex").join(".tnmsc.json"),
      serde_json::json!({
        "workspaceDir": workspace_dir.to_string_lossy(),
        "plugins": {
          "agentsMd": false,
          "git": false,
          "readme": false,
          "vscode": false,
          "zed": false,
          "jetbrains": false,
          "jetbrainsCodeStyle": false,
          "claudeCode": true,
          "codex": false,
          "cursor": false,
          "droid": false,
          "gemini": false,
          "kiro": false,
          "opencode": false,
          "qoder": false,
          "trae": false,
          "traeCn": false,
          "warp": false,
          "windsurf": false
        }
      })
      .to_string(),
    )
    .unwrap();
    fs::write(
      workspace_dir.join("aindex").join("global.mdx"),
      "# Global memory\n\nGlobal instructions\n",
    )
    .unwrap();
    fs::write(
      workspace_dir.join("aindex").join("workspace.mdx"),
      "# Workspace memory\n\nWorkspace instructions\n",
    )
    .unwrap();
    fs::write(
      workspace_dir.join("aindex").join("workspace.src.mdx"),
      "# Workspace memory\n\nWorkspace instructions\n",
    )
    .unwrap();
    fs::write(
      aindex_project_dir.join("agt.mdx"),
      "# Claude project root\n\nProject root instructions\n",
    )
    .unwrap();
    fs::write(
      aindex_project_dir.join(".github").join("agt.mdx"),
      "# Claude child\n\nChild instructions\n",
    )
    .unwrap();

    Self {
      runner: LocalTestRunner::with_cwd(&project_dir),
      temp_home,
      project_dir,
    }
  }

  fn run(&self, args: &[&str]) -> tnmsc_local_tests::CommandResult {
    let temp_home = self.temp_home.to_string_lossy().into_owned();
    self
      .runner
      .run_at_with_env(&self.project_dir, args, &[("HOME", &temp_home)])
  }
}

/// Verify that `--trace` log level outputs fine-grained collector span events.
#[test]
fn trace_level_outputs_span_events() {
  let fixture = IsolatedLoggingLevelsFixture::new();

  let result = fixture.run(&["--trace", "install"]);
  result.assert_failure("isolated tnmsc --trace install should hit protected root CLAUDE.md");

  assert!(
    result
      .stdout
      .contains("### collect.aindex_resolvers started"),
    "--trace should output collector spans. stdout:\n{}",
    result.stdout
  );
  assert!(
    result.stdout.contains("### config.load started"),
    "--trace should output config span. stdout:\n{}",
    result.stdout
  );
}

/// Verify that the default (info) log level outputs top-level events.
#[test]
fn info_level_outputs_top_level_events() {
  let fixture = IsolatedLoggingLevelsFixture::new();

  let result = fixture.run(&["install"]);
  result.assert_failure("isolated tnmsc install should hit protected root CLAUDE.md");

  assert!(
    result.stdout.contains("### Install started"),
    "default level should output 'Install started'. stdout:\n{}",
    result.stdout
  );
  assert!(
    result.stdout.contains("### Install completed"),
    "default level should output 'Install completed'. stdout:\n{}",
    result.stdout
  );
}

/// Verify that `--error` log level suppresses info events but still outputs
/// error diagnostics when config is missing.
#[test]
fn error_level_only_outputs_errors() {
  let runner = LocalTestRunner::new();
  let temp_home = std::env::temp_dir().join("tnmsc_test_home");
  let _ = std::fs::remove_dir_all(&temp_home);
  std::fs::create_dir_all(&temp_home).unwrap();
  let fake_config = temp_home.join(".tnmsc.json");
  let result = runner.run_at_with_env(
    std::env::temp_dir(),
    &["--error", "install"],
    &[("TNMSC_CONFIG_PATH", fake_config.to_str().unwrap())],
  );
  result.assert_failure("tnmsc --error install without config");

  assert!(
    !result.stdout.contains("### Install started"),
    "--error should not output info events. stdout:\n{}",
    result.stdout
  );
  assert!(
    result.stderr.contains("What happened") || result.stderr.contains("error"),
    "--error should output error diagnostics. stderr:\n{}",
    result.stderr
  );
}

/// Verify that `--debug` log level outputs intermediate events.
#[test]
fn debug_level_outputs_debug_events() {
  let fixture = IsolatedLoggingLevelsFixture::new();

  let result = fixture.run(&["--debug", "install"]);
  result.assert_failure("isolated tnmsc --debug install should hit protected root CLAUDE.md");

  assert!(
    result.stdout.contains("### Context collected"),
    "--debug should output 'Context collected'. stdout:\n{}",
    result.stdout
  );
  assert!(
    result.stdout.contains("### Output files built"),
    "--debug should output 'Output files built'. stdout:\n{}",
    result.stdout
  );
}
