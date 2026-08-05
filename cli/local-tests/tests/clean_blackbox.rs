//! Isolated clean black-box tests for `tnmsc clean`.
//!
//! These tests use a temporary HOME/workspace so clean-scope assertions do not
//! depend on the caller's real `~/.aindex/.tnmsc.json` or `~/workspace/*`.

use std::fs;
use std::path::{Path, PathBuf};

use tnmsc_local_tests::LocalTestRunner;

struct IsolatedCleanFixture {
  runner: LocalTestRunner,
  temp_home: PathBuf,
  home_dir: PathBuf,
  memory_sync_dir: PathBuf,
  aindex_dir: PathBuf,
  knowladge_dir: PathBuf,
}

impl IsolatedCleanFixture {
  fn new(claude_enabled: bool, agents_enabled: bool) -> Self {
    let temp_root = std::env::temp_dir().join(format!(
      "tnmsc-local-clean-{}-{}",
      std::process::id(),
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
    ));
    let home_dir = temp_root.join("home");
    let workspace_dir = temp_root.join("workspace");
    let memory_sync_dir = workspace_dir.join("memory-sync");
    let aindex_dir = workspace_dir.join("aindex");
    let knowladge_dir = workspace_dir.join("knowladge");
    let aindex_project_dir = aindex_dir.join("app").join("memory-sync");

    fs::create_dir_all(home_dir.join(".aindex")).unwrap();
    fs::create_dir_all(memory_sync_dir.join(".github")).unwrap();
    fs::create_dir_all(&knowladge_dir).unwrap();
    fs::create_dir_all(aindex_project_dir.join(".github")).unwrap();
    init_git_repo(&memory_sync_dir);
    init_git_repo(&knowladge_dir);

    // issue local-tests-clean-isolation: clean black-box tests must own their
    // workspace fixture so scope assertions do not depend on the host machine.
    write_config(&home_dir, &workspace_dir, claude_enabled, agents_enabled);
    write_prompt_sources(&aindex_dir, &aindex_project_dir);

    Self {
      runner: LocalTestRunner::with_cwd(&memory_sync_dir),
      temp_home: home_dir.clone(),
      home_dir,
      memory_sync_dir,
      aindex_dir,
      knowladge_dir,
    }
  }

  fn env_home(&self) -> String {
    self.temp_home.to_string_lossy().into_owned()
  }

  fn run_at(&self, cwd: &Path, args: &[&str]) -> tnmsc_local_tests::CommandResult {
    let temp_home = self.env_home();
    self
      .runner
      .run_at_with_env(cwd, args, &[("HOME", &temp_home)])
  }

  fn install(&self) -> tnmsc_local_tests::CommandResult {
    self.run_at(&self.memory_sync_dir, &["install"])
  }

  fn clean_at(&self, cwd: &Path) -> tnmsc_local_tests::CommandResult {
    self.run_at(cwd, &["clean"])
  }

  fn dry_run_at(&self, cwd: &Path) -> tnmsc_local_tests::CommandResult {
    self.run_at(cwd, &["clean", "--dry-run"])
  }

  fn project_claude_path(&self) -> PathBuf {
    self.memory_sync_dir.join("CLAUDE.md")
  }

  fn project_agents_path(&self) -> PathBuf {
    self.memory_sync_dir.join("AGENTS.md")
  }

  fn knowladge_agents_path(&self) -> PathBuf {
    self.knowladge_dir.join("AGENTS.md")
  }

  fn aindex_agents_path(&self) -> PathBuf {
    self.aindex_dir.join("AGENTS.md")
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

fn write_prompt_sources(aindex_dir: &Path, aindex_project_dir: &Path) {
  fs::write(
    aindex_dir.join("global.mdx"),
    "# Global memory\n\nGlobal instructions\n",
  )
  .unwrap();
  fs::write(
    aindex_dir.join("workspace.mdx"),
    "# Workspace memory\n\nWorkspace instructions\n",
  )
  .unwrap();
  fs::write(
    aindex_dir.join("workspace.src.mdx"),
    "# Workspace memory\n\nWorkspace instructions\n",
  )
  .unwrap();
  fs::write(
    aindex_project_dir.join("agt.mdx"),
    "# Project root\n\nProject root instructions\n",
  )
  .unwrap();
  fs::write(
    aindex_project_dir.join(".github").join("agt.mdx"),
    "# Child root\n\nChild instructions\n",
  )
  .unwrap();
}

fn write_config(home_dir: &Path, workspace_dir: &Path, claude_enabled: bool, agents_enabled: bool) {
  fs::write(
    home_dir.join(".aindex").join(".tnmsc.json"),
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
        "claudeCode": claude_enabled,
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

/// Verify the basic clean lifecycle: install creates CLAUDE.md, clean removes it.
#[test]
fn local_clean_removes_project_claude_md() {
  let fixture = IsolatedCleanFixture::new(true, false);

  fixture
    .clean_at(&fixture.memory_sync_dir)
    .assert_success("isolated tnmsc clean before install");

  let install = fixture.install();
  install.assert_failure("isolated tnmsc install should be blocked by protected root CLAUDE.md");
  assert!(
    fixture.project_claude_path().is_file(),
    "project CLAUDE.md should exist after install"
  );

  fixture
    .clean_at(&fixture.memory_sync_dir)
    .assert_success("isolated tnmsc clean");

  assert!(
    !fixture.project_claude_path().exists(),
    "project CLAUDE.md should be removed after clean"
  );
}

/// Verify that `tnmsc clean --dry-run` does NOT delete files — it only previews what would be cleaned.
#[test]
fn local_clean_dry_run_does_not_remove_files() {
  let fixture = IsolatedCleanFixture::new(true, false);

  fixture
    .clean_at(&fixture.memory_sync_dir)
    .assert_success("isolated tnmsc clean before install");

  let install = fixture.install();
  install.assert_failure("isolated tnmsc install should be blocked by protected root CLAUDE.md");
  assert!(fixture.project_claude_path().is_file());

  fixture
    .dry_run_at(&fixture.memory_sync_dir)
    .assert_success("isolated tnmsc clean --dry-run");

  assert!(
    fixture.project_claude_path().is_file(),
    "project CLAUDE.md should still exist after dry-run clean"
  );
}

/// Verify that running `tnmsc clean` inside memory-sync only cleans that project.
#[test]
fn local_clean_from_memory_sync_does_not_clean_other_projects() {
  let fixture = IsolatedCleanFixture::new(false, true);

  fixture
    .clean_at(&fixture.home_dir)
    .assert_success("isolated clean from home before scoped clean");

  fixture.install().assert_failure(
    "isolated tnmsc install before scoped clean should hit protected workspace AGENTS.md",
  );

  // issue local-tests-clean-scope: keep one manually managed sibling file so
  // we verify scope filtering on arbitrary workspace files, not just install outputs.
  fs::write(fixture.aindex_agents_path(), "# Test AGENTS.md\n").unwrap();
  fs::write(fixture.knowladge_agents_path(), "# Test AGENTS.md\n").unwrap();

  assert!(
    fixture.project_agents_path().is_file(),
    "memory-sync/AGENTS.md should exist after install"
  );
  assert!(
    fixture.knowladge_agents_path().is_file(),
    "knowladge/AGENTS.md should exist after install"
  );
  assert!(
    fixture.aindex_agents_path().is_file(),
    "aindex/AGENTS.md should exist after manual create"
  );

  fixture
    .clean_at(&fixture.memory_sync_dir)
    .assert_success("isolated tnmsc clean from memory-sync");

  assert!(
    !fixture.project_agents_path().exists(),
    "memory-sync/AGENTS.md should be removed after scoped clean"
  );
  assert!(
    fixture.knowladge_agents_path().is_file(),
    "knowladge/AGENTS.md should still exist after scoped clean"
  );
  assert!(
    fixture.aindex_agents_path().is_file(),
    "aindex/AGENTS.md should still exist after scoped clean"
  );
}

/// Verify the reverse: running clean inside aindex does not affect memory-sync outputs.
///
/// The prompt-source root is reserved workspace state, so this scoped clean is a
/// no-op for the manually created root-level `aindex/AGENTS.md`.
#[test]
fn local_clean_from_aindex_does_not_clean_memory_sync() {
  let fixture = IsolatedCleanFixture::new(false, true);

  fixture
    .clean_at(&fixture.home_dir)
    .assert_success("isolated clean from home before scoped clean");

  fixture.install().assert_failure(
    "isolated tnmsc install before scoped clean should hit protected workspace AGENTS.md",
  );
  fs::write(fixture.aindex_agents_path(), "# Test AGENTS.md\n").unwrap();
  fs::write(fixture.knowladge_agents_path(), "# Test AGENTS.md\n").unwrap();

  assert!(fixture.project_agents_path().is_file());
  assert!(fixture.knowladge_agents_path().is_file());
  assert!(fixture.aindex_agents_path().is_file());

  fixture
    .clean_at(&fixture.aindex_dir)
    .assert_success("isolated tnmsc clean from aindex");

  assert!(
    fixture.aindex_agents_path().is_file(),
    "aindex/AGENTS.md should remain after scoped clean from reserved aindex root"
  );
  assert!(
    fixture.project_agents_path().is_file(),
    "memory-sync/AGENTS.md should still exist after scoped clean from aindex"
  );
  assert!(
    fixture.knowladge_agents_path().is_file(),
    "knowladge/AGENTS.md should still exist after scoped clean from aindex"
  );
}

/// Verify that running clean from HOME cleans all projects under the workspace.
#[test]
fn local_clean_from_home_cleans_all_projects() {
  let fixture = IsolatedCleanFixture::new(false, true);

  fixture
    .clean_at(&fixture.home_dir)
    .assert_success("isolated clean from home before global clean");

  fixture.install().assert_failure(
    "isolated tnmsc install before global clean should hit protected workspace AGENTS.md",
  );
  fs::write(fixture.aindex_agents_path(), "# Test AGENTS.md\n").unwrap();
  fs::write(fixture.knowladge_agents_path(), "# Test AGENTS.md\n").unwrap();

  assert!(fixture.project_agents_path().is_file());
  assert!(fixture.knowladge_agents_path().is_file());
  assert!(fixture.aindex_agents_path().is_file());

  fixture
    .clean_at(&fixture.home_dir)
    .assert_success("isolated tnmsc clean from home");

  assert!(
    !fixture.project_agents_path().exists(),
    "memory-sync/AGENTS.md should be removed after global clean"
  );
  assert!(
    !fixture.knowladge_agents_path().exists(),
    "knowladge/AGENTS.md should be removed after global clean"
  );
  assert!(
    !fixture.aindex_agents_path().exists(),
    "aindex/AGENTS.md should be removed after global clean"
  );
}
