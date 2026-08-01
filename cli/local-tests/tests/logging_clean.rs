//! Clean observability tests for isolated local fixtures.

use std::fs;
use std::path::PathBuf;

use tnmsc_local_tests::LocalTestRunner;

struct IsolatedLoggingCleanFixture {
  runner: LocalTestRunner,
  temp_home: PathBuf,
  project_dir: PathBuf,
}

impl IsolatedLoggingCleanFixture {
  fn new() -> Self {
    let temp_root = std::env::temp_dir().join(format!(
      "tnmsc-local-logging-clean-{}-{}",
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

    // issue local-tests-logging-clean-isolation: logging assertions should not
    // depend on a host install that fails on protected workspace roots.
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

  fn install(&self) -> tnmsc_local_tests::CommandResult {
    self.run(&["install"])
  }
}

/// Verify that `--trace` clean outputs all major spans:
/// cleanup.discover and cleanup.execute.
#[test]
fn clean_outputs_key_spans_and_events() {
  let fixture = IsolatedLoggingCleanFixture::new();

  let install = fixture.install();
  install.assert_failure("isolated tnmsc install before clean should hit protected root CLAUDE.md");

  let result = fixture.run(&["--trace", "clean"]);
  result.assert_success("isolated tnmsc --trace clean");

  assert!(
    result.stdout.contains("### Running clean"),
    "clean should output 'Running clean'. stdout:\n{}",
    result.stdout
  );
  assert!(
    result.stdout.contains("### cleanup.discover started"),
    "clean should output 'cleanup.discover' span. stdout:\n{}",
    result.stdout
  );
  assert!(
    result.stdout.contains("### cleanup.execute started"),
    "clean should output 'cleanup.execute' span. stdout:\n{}",
    result.stdout
  );
}

/// Verify that `--info` clean outputs a deletion summary.
#[test]
fn clean_outputs_deletion_summary() {
  let fixture = IsolatedLoggingCleanFixture::new();

  let install = fixture.install();
  install.assert_failure("isolated tnmsc install before clean should hit protected root CLAUDE.md");

  let result = fixture.run(&["--info", "clean"]);
  result.assert_success("isolated tnmsc --info clean");

  assert!(
    result.stdout.contains("Deleted") || result.stdout.contains("No files needed updates"),
    "clean should output deletion summary. stdout:\n{}",
    result.stdout
  );
}
