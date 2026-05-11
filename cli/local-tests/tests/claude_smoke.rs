//! Isolated CLAUDE.md smoke tests for ClaudeCodeCLIOutputAdaptor.
//!
//! These tests use a temporary HOME and workspace so they do not rely on or
//! mutate the caller's real `~/.aindex/.tnmsc.json`.

use std::fs;
use std::path::{Path, PathBuf};

use tnmsc_local_tests::LocalTestRunner;

struct IsolatedClaudeFixture {
  runner: LocalTestRunner,
  temp_home: PathBuf,
  project_dir: PathBuf,
  aindex_project_dir: PathBuf,
}

impl IsolatedClaudeFixture {
  fn new() -> Self {
    let temp_root = std::env::temp_dir().join(format!(
      "tnmsc-local-claude-{}-{}",
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

    // issue local-tests-claude-isolation: claude smoke tests must validate
    // generated CLAUDE.md files in an isolated HOME/workspace fixture.
    write_claude_config(&temp_home, &workspace_dir, true);
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

  fn overwrite_claude_enabled(&self, enabled: bool) {
    let workspace_dir = self.project_dir.parent().unwrap_or(&self.project_dir);
    write_claude_config(&self.temp_home, workspace_dir, enabled);
  }

  fn project_claude_path(&self) -> PathBuf {
    self.project_dir.join("CLAUDE.md")
  }

  fn child_claude_path(&self) -> PathBuf {
    self.project_dir.join(".github").join("CLAUDE.md")
  }

  fn global_claude_path(&self) -> PathBuf {
    self.temp_home.join(".claude").join("CLAUDE.md")
  }
}

fn init_git_repo(project_dir: &Path) {
  let output = std::process::Command::new("git")
    .arg("init")
    .arg("--quiet")
    .current_dir(project_dir)
    .output()
    .unwrap_or_else(|error| panic!("failed to run git init in {}: {error}", project_dir.display()));

  assert!(
    output.status.success(),
    "git init should succeed in {}\nstdout:\n{}\nstderr:\n{}",
    project_dir.display(),
    String::from_utf8_lossy(&output.stdout),
    String::from_utf8_lossy(&output.stderr)
  );
}

fn write_claude_config(temp_home: &Path, workspace_dir: &Path, enabled: bool) {
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
        "claudeCode": enabled,
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
fn local_claude_install_generates_project_claude_md() {
  let fixture = IsolatedClaudeFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before claude install");
  fixture
    .install()
    .assert_failure("isolated tnmsc install should be blocked by protected root CLAUDE.md");

  assert!(
    fixture.project_claude_path().is_file(),
    "project CLAUDE.md should be generated after install"
  );
  assert!(
    fixture.child_claude_path().is_file(),
    "child .github/CLAUDE.md should be generated after install"
  );
  assert!(
    !fs::read_to_string(fixture.project_claude_path())
      .unwrap()
      .trim()
      .is_empty(),
    "project CLAUDE.md should not be empty"
  );
  assert!(
    !fs::read_to_string(fixture.child_claude_path())
      .unwrap()
      .trim()
      .is_empty(),
    "child .github/CLAUDE.md should not be empty"
  );
}

#[test]
fn local_claude_project_content_matches_aindex_source() {
  let fixture = IsolatedClaudeFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before claude install");
  fixture
    .install()
    .assert_failure("isolated tnmsc install should be blocked by protected root CLAUDE.md");

  let aindex_content = fs::read_to_string(fixture.aindex_project_dir.join("agt.mdx")).unwrap();
  let generated_content = fs::read_to_string(fixture.project_claude_path()).unwrap();

  assert_eq!(
    aindex_content.trim(),
    generated_content.trim(),
    "generated CLAUDE.md should match aindex source agt.mdx"
  );
}

#[test]
fn local_claude_child_content_matches_aindex_source() {
  let fixture = IsolatedClaudeFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before claude install");
  fixture
    .install()
    .assert_failure("isolated tnmsc install should be blocked by protected root CLAUDE.md");

  let aindex_child_content =
    fs::read_to_string(fixture.aindex_project_dir.join(".github").join("agt.mdx")).unwrap();
  let generated_child_content = fs::read_to_string(fixture.child_claude_path()).unwrap();

  assert_eq!(
    aindex_child_content.trim(),
    generated_child_content.trim(),
    "generated .github/CLAUDE.md should match aindex source .github/agt.mdx"
  );
}

#[test]
fn local_claude_clean_removes_all_project_files() {
  let fixture = IsolatedClaudeFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before claude install");
  fixture
    .install()
    .assert_failure("isolated tnmsc install before claude clean should hit protected root");

  assert!(fixture.project_claude_path().is_file());

  fixture.clean().assert_success("isolated tnmsc clean");

  assert!(
    !fixture.project_claude_path().exists(),
    "project CLAUDE.md should be removed after clean"
  );

  fn collect_claude_md_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else {
      return files;
    };
    for entry in entries.flatten() {
      let path = entry.path();
      let Ok(file_type) = entry.file_type() else {
        continue;
      };
      if file_type.is_dir() {
        if let Some(name) = path.file_name() {
          let name = name.to_string_lossy();
          if name.starts_with('.') && name != ".github"
            || name == "node_modules"
            || name == "target"
            || name == "dist"
            || name == "out"
          {
            continue;
          }
        }
        if path.join("CLAUDE.md").is_file() {
          files.push(path.join("CLAUDE.md"));
        }
        files.extend(collect_claude_md_files(&path));
      }
    }
    files
  }

  let remaining = collect_claude_md_files(&fixture.project_dir);
  assert!(
    remaining.is_empty(),
    "clean should remove all project CLAUDE.md files, found:\n{}",
    remaining
      .iter()
      .map(|path| format!("  - {}", path.display()))
      .collect::<Vec<_>>()
      .join("\n")
  );
}

#[test]
fn regression_claude_clean_removes_child_memory_files_even_when_plugin_disabled() {
  let fixture = IsolatedClaudeFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before claude install");
  fixture
    .install()
    .assert_failure("isolated tnmsc install before claude clean should hit protected root");

  assert!(fixture.project_claude_path().is_file());
  assert!(fixture.child_claude_path().is_file());

  // issue #385: clean must keep deleting generated child CLAUDE.md files even
  // after claudeCode is disabled, otherwise stale project memory survives.
  fixture.overwrite_claude_enabled(false);
  fixture.clean().assert_success(
    "isolated tnmsc clean should remove stale claude files even when plugin is disabled",
  );

  assert!(
    !fixture.project_claude_path().exists(),
    "project CLAUDE.md should be removed after clean with plugin disabled"
  );
  assert!(
    !fixture.child_claude_path().exists(),
    "child .github/CLAUDE.md should be removed after clean with plugin disabled"
  );
}

#[test]
fn local_claude_global_file_still_generated() {
  let fixture = IsolatedClaudeFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before claude install");
  fixture
    .install()
    .assert_failure("isolated tnmsc install should be blocked by protected root CLAUDE.md");

  assert!(
    fixture.global_claude_path().is_file(),
    "global ~/.claude/CLAUDE.md should be generated after install"
  );
  assert!(
    !fs::read_to_string(fixture.global_claude_path())
      .unwrap()
      .trim()
      .is_empty(),
    "global CLAUDE.md should not be empty"
  );
}

#[test]
fn regression_isolated_claude_skill_name_and_child_doc_extensions() {
  let runner = LocalTestRunner::new();

  let temp_root = std::env::temp_dir().join(format!(
    "tnmsc-local-claude-reverse-{}-{}",
    std::process::id(),
    std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .unwrap_or_default()
      .as_nanos()
  ));
  let temp_home = temp_root.join("home");
  let workspace_dir = temp_root.join("workspace");
  let aindex_dir = workspace_dir.join("aindex");
  let skill_dir = aindex_dir
    .join("skills")
    .join("dev-tools")
    .join("reverse-engineering");

  std::fs::create_dir_all(temp_home.join(".aindex")).unwrap();
  std::fs::create_dir_all(&aindex_dir).unwrap();
  std::fs::create_dir_all(&skill_dir).unwrap();

  std::fs::write(
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
        "cursor": false,
        "droid": false,
        "gemini": false,
        "kiro": false,
        "qoder": false,
        "trae": false,
        "traeCn": false,
        "windsurf": false,
        "codex": false,
        "claudeCode": true,
        "opencode": false
      }
    })
    .to_string(),
  )
  .unwrap();

  std::fs::write(
    aindex_dir.join("workspace.mdx"),
    "---\ndescription: workspace\n---\nWorkspace prompt\n",
  )
  .unwrap();
  std::fs::write(
    aindex_dir.join("workspace.src.mdx"),
    "---\ndescription: workspace\n---\nWorkspace prompt\n",
  )
  .unwrap();

  std::fs::write(
    skill_dir.join("skill.src.mdx"),
    "export default { name: 'reverse-engineering', description: 'Reverse engineering skill' }\n\n# Reverse\n",
  )
  .unwrap();
  std::fs::write(
    skill_dir.join("skill.mdx"),
    "export default { name: 'reverse-engineering', description: 'Reverse engineering skill' }\n\n# Reverse\n",
  )
  .unwrap();

  for name in ["packet-capture", "reverse-tools"] {
    std::fs::write(
      skill_dir.join(format!("{name}.src.mdx")),
      format!("---\ndescription: {name}\n---\n# {name}\n"),
    )
    .unwrap();
    std::fs::write(
      skill_dir.join(format!("{name}.mdx")),
      format!("---\ndescription: {name}\n---\n# {name}\n"),
    )
    .unwrap();
  }

  let temp_home_str = temp_home.to_string_lossy().into_owned();

  let install = runner.run_at_with_env(&workspace_dir, &["install"], &[("HOME", &temp_home_str)]);
  install.assert_failure(
    "isolated tnmsc install for claude should be blocked by protected root CLAUDE.md",
  );
  assert!(
    install.stderr.contains("Refusing to write protected path.")
      || install
        .stderr
        .contains("CLAUDE.md: Refusing to write protected path."),
    "expected protected-path failure for root CLAUDE.md, got stderr:\n{}",
    install.stderr
  );

  let generated_skill_dir = workspace_dir
    .join(".claude")
    .join("skills")
    .join("dev-tools-reverse-engineering");
  assert!(
    generated_skill_dir.join("SKILL.md").is_file(),
    "claude should generate SKILL.md for dev-tools-reverse-engineering"
  );
  assert!(
    generated_skill_dir.join("packet-capture.md").is_file(),
    "claude should emit packet-capture child doc as .md"
  );
  assert!(
    generated_skill_dir.join("reverse-tools.md").is_file(),
    "claude should emit reverse-tools child doc as .md"
  );
  assert!(
    !generated_skill_dir.join("packet-capture.mdx").exists(),
    "claude must not emit packet-capture child doc as .mdx"
  );
  assert!(
    !generated_skill_dir.join("reverse-tools.mdx").exists(),
    "claude must not emit reverse-tools child doc as .mdx"
  );

  let skill_content = std::fs::read_to_string(generated_skill_dir.join("SKILL.md")).unwrap();
  assert!(
    skill_content.contains("name: dev-tools-reverse-engineering"),
    "claude SKILL.md name field must match generated directory name"
  );
  assert!(
    skill_content.contains("skill: aindex/skills/dev-tools/reverse-engineering"),
    "claude SKILL.md should keep the categorized source identifier"
  );

  let clean = runner.run_at_with_env(&workspace_dir, &["clean"], &[("HOME", &temp_home_str)]);
  clean.assert_success("isolated tnmsc clean for claude");

  assert!(
    !workspace_dir.join(".claude").exists(),
    "clean should remove the generated .claude tree"
  );
}
