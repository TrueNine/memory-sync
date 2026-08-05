//! Isolated AGENTS.md smoke tests for AgentsOutputAdaptor.
//!
//! These tests intentionally avoid the caller's real `~/.aindex/.tnmsc.json`
//! because the shared local-test runner otherwise follows the host
//! `workspaceDir` and mutates unrelated workspaces.

use std::fs;
use std::path::{Path, PathBuf};

use tnmsc_local_tests::LocalTestRunner;

struct IsolatedAgentsFixture {
  runner: LocalTestRunner,
  temp_home: PathBuf,
  project_dir: PathBuf,
  aindex_project_dir: PathBuf,
}

impl IsolatedAgentsFixture {
  fn new(agents_enabled: bool) -> Self {
    let temp_root = std::env::temp_dir().join(format!(
      "tnmsc-local-agents-{}-{}",
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
    init_git_repo(&project_dir);

    // issue local-tests-agents-isolation: agents smoke tests must validate
    // generated AGENTS.md files in a self-owned fixture instead of the host workspace.
    write_config(&temp_home, &workspace_dir, agents_enabled);
    fs::write(
      aindex_project_dir.join("agt.mdx"),
      "# Issue sync root\n\nProject root instructions\n",
    )
    .unwrap();
    fs::write(
      aindex_project_dir.join(".github").join("agt.mdx"),
      "# Issue sync child\n\nChild instructions\n",
    )
    .unwrap();

    Self {
      runner: LocalTestRunner::with_cwd(&project_dir),
      temp_home,
      project_dir,
      aindex_project_dir,
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

  fn clean(&self) -> tnmsc_local_tests::CommandResult {
    self.run(&["clean"])
  }

  fn project_agents_path(&self) -> PathBuf {
    self.project_dir.join("AGENTS.md")
  }

  fn child_agents_path(&self) -> PathBuf {
    self.project_dir.join(".github").join("AGENTS.md")
  }

  fn overwrite_agents_enabled(&self, enabled: bool) {
    let workspace_dir = self.project_dir.parent().unwrap_or(&self.project_dir);
    write_config(&self.temp_home, workspace_dir, enabled);
  }
}

fn init_git_repo(project_dir: &Path) {
  let output = std::process::Command::new("git")
    .arg("init")
    .arg("--quiet")
    .current_dir(project_dir)
    .output()
    .unwrap_or_else(|error| {
      panic!(
        "failed to run git init in {}: {error}",
        project_dir.display()
      )
    });

  assert!(
    output.status.success(),
    "git init should succeed in {}\nstdout:\n{}\nstderr:\n{}",
    project_dir.display(),
    String::from_utf8_lossy(&output.stdout),
    String::from_utf8_lossy(&output.stderr)
  );
}

fn write_config(temp_home: &Path, workspace_dir: &Path, agents_enabled: bool) {
  fs::write(
    temp_home.join(".aindex").join(".tnmsc.json"),
    serde_json::json!({
      "workspaceDir": workspace_dir.to_string_lossy(),
      "plugins": {
        "agentsMd": agents_enabled,
        "git": false,
        "readme": false,
        "vscode": false,
        "zed": false,
        "jetbrains": false,
        "jetbrainsCodeStyle": false,
        "claudeCode": false,
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
}

#[test]
fn local_agents_md_install_generates_project_agents_md() {
  let fixture = IsolatedAgentsFixture::new(true);

  let clean = fixture.clean();
  clean.assert_success("isolated tnmsc clean before install");

  let install = fixture.install();
  install.assert_success("isolated tnmsc install");

  assert!(
    fixture.project_agents_path().is_file(),
    "project AGENTS.md should be generated after install"
  );
  assert!(
    fixture.child_agents_path().is_file(),
    "child .github/AGENTS.md should be generated after install"
  );
  assert!(
    !fs::read_to_string(fixture.project_agents_path())
      .unwrap()
      .trim()
      .is_empty(),
    "project AGENTS.md should not be empty"
  );
  assert!(
    !fs::read_to_string(fixture.child_agents_path())
      .unwrap()
      .trim()
      .is_empty(),
    "child .github/AGENTS.md should not be empty"
  );
}

#[test]
fn local_agents_md_content_matches_aindex_source() {
  let fixture = IsolatedAgentsFixture::new(true);

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before install");
  fixture.install().assert_success("isolated tnmsc install");

  let aindex_content = fs::read_to_string(fixture.aindex_project_dir.join("agt.mdx")).unwrap();
  let generated_content = fs::read_to_string(fixture.project_agents_path()).unwrap();

  assert_eq!(
    aindex_content.trim(),
    generated_content.trim(),
    "generated AGENTS.md should match aindex source agt.mdx"
  );
}

#[test]
fn local_agents_md_child_content_matches_aindex_source() {
  let fixture = IsolatedAgentsFixture::new(true);

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before install");
  fixture.install().assert_success("isolated tnmsc install");

  let aindex_child_content =
    fs::read_to_string(fixture.aindex_project_dir.join(".github").join("agt.mdx")).unwrap();
  let generated_child_content = fs::read_to_string(fixture.child_agents_path()).unwrap();

  assert_eq!(
    aindex_child_content.trim(),
    generated_child_content.trim(),
    "generated .github/AGENTS.md should match aindex source .github/agt.mdx"
  );
}

#[test]
fn local_agents_md_clean_removes_files() {
  let fixture = IsolatedAgentsFixture::new(true);

  fixture
    .install()
    .assert_success("isolated tnmsc install before clean");
  assert!(fixture.project_agents_path().is_file());
  assert!(fixture.child_agents_path().is_file());

  fixture.clean().assert_success("isolated tnmsc clean");

  assert!(
    !fixture.project_agents_path().exists(),
    "project AGENTS.md should be removed after clean"
  );
  assert!(
    !fixture.child_agents_path().exists(),
    "child .github/AGENTS.md should be removed after clean"
  );
}

#[test]
fn local_agents_md_disabled_by_config() {
  let fixture = IsolatedAgentsFixture::new(false);

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before disabled install");

  let install = fixture.install();
  install.assert_success("isolated tnmsc install with agentsMd disabled");

  assert!(
    !fixture.project_agents_path().exists(),
    "project AGENTS.md should not be generated when agentsMd is disabled"
  );
  assert!(
    !fixture.child_agents_path().exists(),
    "child .github/AGENTS.md should not be generated when agentsMd is disabled"
  );
}

#[test]
fn local_agents_md_clean_always_removes_files_even_when_disabled() {
  let fixture = IsolatedAgentsFixture::new(true);

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before install");
  fixture
    .install()
    .assert_success("isolated tnmsc install with agentsMd enabled");

  assert!(
    fixture.project_agents_path().is_file(),
    "project AGENTS.md should exist after install with agentsMd enabled"
  );
  assert!(
    fixture.child_agents_path().is_file(),
    "child .github/AGENTS.md should exist after install with agentsMd enabled"
  );

  fixture.overwrite_agents_enabled(false);

  fixture
    .clean()
    .assert_success("isolated tnmsc clean with agentsMd disabled");

  assert!(
    !fixture.project_agents_path().exists(),
    "project AGENTS.md should be removed by clean even when agentsMd is disabled"
  );
  assert!(
    !fixture.child_agents_path().exists(),
    "child .github/AGENTS.md should be removed by clean even when agentsMd is disabled"
  );
}
