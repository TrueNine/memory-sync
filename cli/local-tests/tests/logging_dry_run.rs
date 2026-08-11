//! Dry-run observability tests for isolated local fixtures.

use std::fs;
use std::path::PathBuf;

use tnmsc_local_tests::LocalTestRunner;

struct IsolatedLoggingDryRunFixture {
  runner: LocalTestRunner,
  temp_home: PathBuf,
  project_dir: PathBuf,
}

impl IsolatedLoggingDryRunFixture {
  fn new() -> Self {
    let temp_root = std::env::temp_dir().join(format!(
      "tnmsc-local-logging-dry-run-{}-{}",
      std::process::id(),
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
    ));
    let temp_home = temp_root.join("home");
    let workspace_dir = temp_root.join("workspace");
    let project_dir = workspace_dir.join("memory-sync");
    let aindex_dir = workspace_dir.join("aindex");

    fs::create_dir_all(temp_home.join(".aindex")).unwrap();
    fs::create_dir_all(&project_dir).unwrap();
    fs::create_dir_all(&aindex_dir).unwrap();
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
    fs::write(aindex_dir.join("workspace.mdx"), "# Workspace memory\n").unwrap();

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

#[test]
fn dry_run_outputs_key_spans_and_events() {
  let fixture = IsolatedLoggingDryRunFixture::new();
  let result = fixture.run(&["--trace", "dry-run"]);
  result.assert_success("isolated tnmsc --trace dry-run");

  assert!(
    result.stdout.contains("### Running dry-run"),
    "dry-run should output 'Running dry-run'. stdout:\n{}",
    result.stdout
  );
  assert!(
    result.stdout.contains("### config.load started"),
    "dry-run should output 'config.load' span. stdout:\n{}",
    result.stdout
  );
  assert!(
    result.stdout.contains("### context.collect started"),
    "dry-run should output 'context.collect' span. stdout:\n{}",
    result.stdout
  );
  assert!(
    result.stdout.contains("### output.build started"),
    "dry-run should output 'output.build' span. stdout:\n{}",
    result.stdout
  );
}

#[test]
fn dry_run_outputs_plan_preview() {
  let fixture = IsolatedLoggingDryRunFixture::new();
  let result = fixture.run(&["--info", "dry-run"]);
  result.assert_success("isolated tnmsc --info dry-run");

  assert!(
    result.stdout.contains("Planned") || result.stdout.contains("No files needed updates"),
    "dry-run should output plan summary. stdout:\n{}",
    result.stdout
  );
}
