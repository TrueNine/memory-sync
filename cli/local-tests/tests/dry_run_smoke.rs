//! Isolated black-box test for the `tnmsc dry-run` no-write guarantee.

use std::fs;
use std::path::Path;

use tnmsc_local_tests::LocalTestRunner;

#[test]
fn local_dry_run_does_not_write_project_files() {
  let temp_root = std::env::temp_dir().join(format!(
    "tnmsc-local-dry-run-{}-{}",
    std::process::id(),
    std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .unwrap_or_default()
      .as_nanos()
  ));
  let temp_home = temp_root.join("home");
  let workspace_dir = temp_root.join("workspace");
  let project_dir = workspace_dir.join("croessweave");
  let prompt_dir = workspace_dir.join("aindex").join("app").join("croessweave");

  fs::create_dir_all(temp_home.join(".aindex")).unwrap();
  fs::create_dir_all(&project_dir).unwrap();
  fs::create_dir_all(&prompt_dir).unwrap();
  init_git_repo(&project_dir);
  fs::write(prompt_dir.join("agt.mdx"), "# Project memory\n").unwrap();
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

  let runner = LocalTestRunner::with_cwd(&project_dir);
  let temp_home_string = temp_home.to_string_lossy().into_owned();
  let claude_path = project_dir.join("CLAUDE.md");

  assert!(!claude_path.exists());
  runner
    .run_at_with_env(&project_dir, &["dry-run"], &[("HOME", &temp_home_string)])
    .assert_success("isolated tnmsc dry-run");
  assert!(
    !claude_path.exists(),
    "project CLAUDE.md should not be created by dry-run"
  );
}

fn init_git_repo(project_dir: &Path) {
  let output = std::process::Command::new("git")
    .arg("init")
    .arg("--quiet")
    .current_dir(project_dir)
    .output()
    .unwrap();
  assert!(output.status.success(), "git init should succeed");
}
