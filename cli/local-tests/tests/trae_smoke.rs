//! Isolated Trae smoke tests.
//!
//! 验证 `.trae/steering/GLOBAL.md` 正确生成，`.trae-cn/` 不被输出，
//! 且清理时兼容清理旧的 `.trae-cn/`。

use std::fs;
use std::path::{Path, PathBuf};

use tnmsc_local_tests::LocalTestRunner;

struct IsolatedTraeFixture {
  runner: LocalTestRunner,
  temp_home: PathBuf,
  project_dir: PathBuf,
}

impl IsolatedTraeFixture {
  fn new() -> Self {
    let temp_root = std::env::temp_dir().join(format!(
      "tnmsc-local-trae-{}-{}",
      std::process::id(),
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
    ));
    let temp_home = temp_root.join("home");
    let workspace_dir = temp_root.join("workspace");
    let project_dir = workspace_dir.join("croessweave");
    let aindex_dir = workspace_dir.join("aindex");
    let aindex_project_dir = aindex_dir.join("app").join("croessweave");

    fs::create_dir_all(temp_home.join(".aindex")).unwrap();
    fs::create_dir_all(&project_dir).unwrap();
    fs::create_dir_all(project_dir.join("cli")).unwrap();
    fs::create_dir_all(&aindex_project_dir).unwrap();
    fs::create_dir_all(aindex_project_dir.join("cli")).unwrap();
    init_git_repo(&project_dir);

    // issue local-tests-trae-isolation: trae local tests must validate steering
    // output in a temp HOME/workspace instead of the host project tree.
    write_trae_config(&temp_home, &workspace_dir);
    write_trae_prompt_sources(&aindex_dir, &aindex_project_dir);

    Self {
      runner: LocalTestRunner::with_cwd(&project_dir),
      temp_home,
      project_dir,
    }
  }

  fn env_home(&self) -> String {
    self.temp_home.to_string_lossy().into_owned()
  }

  fn run(&self, args: &[&str]) -> tnmsc_local_tests::CommandResult {
    let temp_home = self.env_home();
    self
      .runner
      .run_at_with_env(&self.project_dir, args, &[("HOME", &temp_home)])
  }

  fn clean(&self) -> tnmsc_local_tests::CommandResult {
    self.run(&["clean"])
  }

  fn install(&self) -> tnmsc_local_tests::CommandResult {
    self.run(&["install"])
  }

  fn steering_path(&self) -> PathBuf {
    self
      .project_dir
      .join(".trae")
      .join("steering")
      .join("GLOBAL.md")
  }

  fn child_steering_path(&self) -> PathBuf {
    self
      .project_dir
      .join("cli")
      .join(".trae")
      .join("steering")
      .join("GLOBAL.md")
  }

  fn trae_cn_path(&self) -> PathBuf {
    self
      .project_dir
      .join(".trae-cn")
      .join("user_rules")
      .join("GLOBAL.md")
  }

  fn legacy_child_trae_dir(&self) -> PathBuf {
    self.project_dir.join("cli").join(".trae")
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

fn write_trae_config(temp_home: &Path, workspace_dir: &Path) {
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
        "claudeCode": false,
        "codex": false,
        "cursor": false,
        "droid": false,
        "gemini": false,
        "kiro": false,
        "opencode": false,
        "qoder": false,
        "trae": true,
        "traeCn": false,
        "windsurf": false
      }
    })
    .to_string(),
  )
  .unwrap();
}

fn write_trae_prompt_sources(aindex_dir: &Path, aindex_project_dir: &Path) {
  fs::write(
    aindex_dir.join("global.mdx"),
    "# Global memory\n\nTrae global memory\n",
  )
  .unwrap();
  fs::write(
    aindex_dir.join("workspace.mdx"),
    "# Workspace memory\n\nTrae workspace memory\n",
  )
  .unwrap();
  fs::write(
    aindex_dir.join("workspace.src.mdx"),
    "# Workspace memory\n\nTrae workspace memory\n",
  )
  .unwrap();
  fs::write(
    aindex_project_dir.join("agt.mdx"),
    "# Trae project root\n\nProject root instructions\n",
  )
  .unwrap();
  fs::write(
    aindex_project_dir.join("cli").join("agt.mdx"),
    "# Trae child\n\nChild instructions\n",
  )
  .unwrap();
}

#[test]
fn local_trae_steering_generated_after_install() {
  let fixture = IsolatedTraeFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before trae install");
  fixture
    .install()
    .assert_success("isolated tnmsc install for trae");

  assert!(
    fixture.steering_path().is_file(),
    ".trae/steering/GLOBAL.md should be generated after install"
  );
  assert!(
    fixture.child_steering_path().is_file(),
    "child .trae/steering/GLOBAL.md should be generated after install"
  );
  assert!(
    !fixture.trae_cn_path().is_file(),
    ".trae-cn/user_rules/GLOBAL.md must not be generated after install"
  );
}

#[test]
fn local_trae_steering_idempotent() {
  let fixture = IsolatedTraeFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before trae install");

  let first = fixture.install();
  first.assert_success("first isolated tnmsc install for trae");
  assert!(fixture.steering_path().is_file());

  let content_first = fs::read_to_string(fixture.steering_path()).unwrap();

  let second = fixture.install();
  second.assert_success("second isolated tnmsc install for trae");

  let content_second = fs::read_to_string(fixture.steering_path()).unwrap();
  assert_eq!(
    content_first, content_second,
    "consecutive installs should produce identical .trae/steering/GLOBAL.md"
  );
}

#[test]
fn local_trae_steering_removed_after_clean() {
  let fixture = IsolatedTraeFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before trae install");
  fixture
    .install()
    .assert_success("isolated tnmsc install for trae");
  assert!(fixture.steering_path().is_file());

  fixture
    .clean()
    .assert_success("isolated tnmsc clean for trae");

  assert!(
    !fixture.steering_path().is_file(),
    ".trae/steering/GLOBAL.md should be removed after clean"
  );
  assert!(
    !fixture.child_steering_path().is_file(),
    "child .trae/steering/GLOBAL.md should be removed after clean"
  );
}

#[test]
fn local_trae_cn_cleaned_for_compatibility() {
  let fixture = IsolatedTraeFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before trae install");
  fixture
    .install()
    .assert_success("isolated tnmsc install for trae");
  assert!(fixture.steering_path().is_file());

  fs::create_dir_all(fixture.trae_cn_path().parent().unwrap()).unwrap();
  fs::write(fixture.trae_cn_path(), "# legacy\n").unwrap();
  assert!(
    fixture.trae_cn_path().is_file(),
    "fake .trae-cn should exist before clean"
  );

  fixture
    .clean()
    .assert_success("isolated tnmsc clean removes legacy .trae-cn");

  assert!(
    !fixture.trae_cn_path().is_file(),
    "legacy .trae-cn/user_rules/GLOBAL.md should be removed during clean"
  );
  assert!(
    !fixture.steering_path().is_file(),
    ".trae/steering/GLOBAL.md should also be removed after clean"
  );
}

#[test]
fn local_trae_clean_removes_legacy_trae_directories_recursively() {
  let fixture = IsolatedTraeFixture::new();

  let legacy_file = fixture
    .legacy_child_trae_dir()
    .join("legacy")
    .join("note.md");
  fs::create_dir_all(legacy_file.parent().unwrap()).unwrap();
  fs::write(&legacy_file, "# legacy\n").unwrap();
  assert!(
    legacy_file.is_file(),
    "legacy nested .trae file should exist before clean"
  );

  fixture
    .clean()
    .assert_success("isolated tnmsc clean removes legacy .trae directories");

  assert!(
    !fixture.legacy_child_trae_dir().exists(),
    "legacy nested .trae directory should be removed during clean"
  );
}

#[test]
fn binary_exists_before_tests() {
  let binary = tnmsc_local_tests::binary_path();
  assert!(
    binary.is_file(),
    "binary not found at: {}\n\nplease compile it first:\n  cargo build -p tnmsc\n",
    binary.display()
  );
}
