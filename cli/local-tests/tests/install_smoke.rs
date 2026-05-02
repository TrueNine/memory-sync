//! Isolated install smoke tests for ClaudeCodeCLIOutputAdaptor.
//!
//! These tests use a temporary HOME/workspace so install expectations do not
//! depend on the caller's real `~/.aindex/.tnmsc.json`, `~/.claude`, or
//! workspace prompts.

use std::fs;
use std::path::{Path, PathBuf};

use tnmsc_local_tests::LocalTestRunner;

struct IsolatedInstallFixture {
  runner: LocalTestRunner,
  temp_home: PathBuf,
  project_dir: PathBuf,
}

impl IsolatedInstallFixture {
  fn new() -> Self {
    let temp_root = std::env::temp_dir().join(format!(
      "tnmsc-local-install-{}-{}",
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
    let commands_dir = workspace_dir.join("aindex").join("commands");
    let subagents_dir = workspace_dir.join("aindex").join("subagents");
    let skills_dir = workspace_dir.join("aindex").join("skills");
    let rules_dir = workspace_dir.join("aindex").join("rules").join("qa");

    fs::create_dir_all(temp_home.join(".aindex")).unwrap();
    fs::create_dir_all(project_dir.join(".github")).unwrap();
    fs::create_dir_all(aindex_project_dir.join(".github")).unwrap();
    fs::create_dir_all(&commands_dir).unwrap();
    fs::create_dir_all(&subagents_dir).unwrap();
    fs::create_dir_all(skills_dir.join("browser").join("agent-browser")).unwrap();
    fs::create_dir_all(&rules_dir).unwrap();

    // issue local-tests-install-isolation: install smoke must validate install
    // outputs in a self-owned fixture instead of the host workspace.
    write_install_config(&temp_home, &workspace_dir);
    write_install_prompt_sources(
      &workspace_dir,
      &aindex_project_dir,
      &commands_dir,
      &subagents_dir,
      &skills_dir,
      &rules_dir,
    );

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

  fn install(&self) -> tnmsc_local_tests::CommandResult {
    self.run(&["install"])
  }

  fn clean(&self) -> tnmsc_local_tests::CommandResult {
    self.run(&["clean"])
  }

  fn project_claude_path(&self) -> PathBuf {
    self.project_dir.join("CLAUDE.md")
  }

  fn global_claude_path(&self) -> PathBuf {
    self.temp_home.join(".claude").join("CLAUDE.md")
  }

  fn project_claude_dir(&self) -> PathBuf {
    self.project_dir.join(".claude")
  }
}

fn write_install_config(temp_home: &Path, workspace_dir: &Path) {
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
}

fn write_install_prompt_sources(
  workspace_dir: &Path,
  aindex_project_dir: &Path,
  commands_dir: &Path,
  subagents_dir: &Path,
  skills_dir: &Path,
  rules_dir: &Path,
) {
  fs::write(
    workspace_dir.join("aindex").join("global.mdx"),
    "你是 TrueNine 的协作者。\n\n[TrueNineGithub](https://github.com/TrueNine)\n",
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

  fs::write(
    commands_dir.join("demo.mdx"),
    "---\ndescription: Demo command\nscope: global\n---\nRun demo command\n",
  )
  .unwrap();
  fs::write(
    commands_dir.join("qa_boot.mdx"),
    "---\ndescription: QA boot command\nscope: global\n---\nRun QA boot command\n",
  )
  .unwrap();

  fs::write(
    subagents_dir.join("demo.mdx"),
    "---\ndescription: Demo agent\nscope: global\n---\nDemo agent instructions\n",
  )
  .unwrap();

  let browser_skill_dir = skills_dir.join("browser").join("agent-browser");
  fs::create_dir_all(browser_skill_dir.join("references")).unwrap();
  fs::create_dir_all(browser_skill_dir.join("templates")).unwrap();
  fs::write(
    browser_skill_dir.join("skill.mdx"),
    "export default { description: 'Browser skill' }\n\n# Browser Skill\n",
  )
  .unwrap();
  fs::write(
    browser_skill_dir.join("skill.src.mdx"),
    "export default { description: 'Browser skill' }\n\n# Browser Skill\n",
  )
  .unwrap();
  fs::write(
    browser_skill_dir.join("references").join("linux-wsl.mdx"),
    "---\ndescription: Linux WSL reference\n---\n# Linux WSL\n",
  )
  .unwrap();
  fs::write(
    browser_skill_dir
      .join("references")
      .join("linux-wsl.src.mdx"),
    "---\ndescription: Linux WSL reference\n---\n# Linux WSL\n",
  )
  .unwrap();
  fs::write(
    browser_skill_dir
      .join("templates")
      .join("capture-workflow.sh"),
    "#!/usr/bin/env bash\necho capture\n",
  )
  .unwrap();

  fs::write(
    rules_dir.join("boot.mdx"),
    "---\ndescription: QA boot rule\npaths:\n  - \"**/*.rs\"\nscope: project\n---\nRule body\n",
  )
  .unwrap();
}

/// Verify that `tnmsc install` generates both project-level CLAUDE.md and global
/// ~/.claude/CLAUDE.md with non-empty content.
#[test]
fn local_install_generates_project_claude_md() {
  let fixture = IsolatedInstallFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before install");
  fixture
    .install()
    .assert_failure("isolated tnmsc install should be blocked by protected root CLAUDE.md");

  assert!(
    fixture.project_claude_path().is_file(),
    "project CLAUDE.md should be generated after install"
  );

  let content = fs::read_to_string(fixture.project_claude_path()).unwrap();
  assert!(!content.is_empty(), "CLAUDE.md should not be empty");

  assert!(
    fixture.global_claude_path().is_file(),
    "~/.claude/CLAUDE.md should be generated after install"
  );
}

/// Verify that running `tnmsc install` twice in a row produces identical output.
#[test]
fn local_install_idempotent() {
  let fixture = IsolatedInstallFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before install");

  let first = fixture.install();
  first.assert_failure("first isolated tnmsc install should hit protected root CLAUDE.md");
  assert!(fixture.project_claude_path().is_file());

  let content_first = fs::read_to_string(fixture.project_claude_path()).unwrap();

  let second = fixture.install();
  second.assert_failure("second isolated tnmsc install should hit protected root CLAUDE.md");

  let content_second = fs::read_to_string(fixture.project_claude_path()).unwrap();
  assert_eq!(
    content_first, content_second,
    "consecutive installs should produce identical output"
  );

  assert!(
    fixture.global_claude_path().is_file(),
    "~/.claude/CLAUDE.md should exist after install"
  );
}

/// Verify the full .claude/ directory structure after install.
#[test]
fn local_install_generates_claude_directory_structure() {
  let fixture = IsolatedInstallFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before install");
  fixture
    .install()
    .assert_failure("isolated tnmsc install should be blocked by protected root CLAUDE.md");

  assert!(
    fixture.project_claude_dir().is_dir(),
    "project .claude should be generated after install"
  );

  for subdir in ["agents", "skills", "commands", "rules"] {
    assert!(
      fixture.project_claude_dir().join(subdir).is_dir(),
      "project .claude/{subdir} should exist after install"
    );
  }

  let agents_dir = fixture.project_claude_dir().join("agents");
  let agent_files: Vec<_> = fs::read_dir(&agents_dir)
    .unwrap()
    .flatten()
    .filter(|entry| entry.file_type().map(|ft| ft.is_file()).unwrap_or(false))
    .collect();
  assert!(
    !agent_files.is_empty(),
    "project .claude/agents should contain at least one file"
  );
  for file in &agent_files {
    let name = file.file_name().to_string_lossy().to_string();
    assert!(name.ends_with(".md"));
    let content = fs::read_to_string(file.path()).unwrap();
    assert!(content.starts_with("---\n"));
    assert!(content.contains("agent:"));
  }

  let commands_dir = fixture.project_claude_dir().join("commands");
  let command_files: Vec<_> = fs::read_dir(&commands_dir)
    .unwrap()
    .flatten()
    .filter(|entry| entry.file_type().map(|ft| ft.is_file()).unwrap_or(false))
    .collect();
  assert!(
    !command_files.is_empty(),
    "project .claude/commands should contain at least one file"
  );
  for file in &command_files {
    let name = file.file_name().to_string_lossy().to_string();
    assert!(name.ends_with(".md"));
    let content = fs::read_to_string(file.path()).unwrap();
    assert!(content.starts_with("---\n"));
    assert!(content.contains("command:"));
  }

  let skills_dir = fixture.project_claude_dir().join("skills");
  let skill_entries: Vec<_> = fs::read_dir(&skills_dir)
    .unwrap()
    .flatten()
    .filter(|entry| entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
    .collect();
  assert!(
    !skill_entries.is_empty(),
    "project .claude/skills should contain at least one subdirectory"
  );
  for entry in &skill_entries {
    let skill_md_path = entry.path().join("SKILL.md");
    assert!(skill_md_path.is_file());
    let content = fs::read_to_string(&skill_md_path).unwrap();
    assert!(content.starts_with("---\n"));
    assert!(content.contains("skill:"));
  }

  fn collect_rule_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
      for entry in entries.flatten() {
        let path = entry.path();
        if let Ok(ft) = entry.file_type() {
          if ft.is_file() {
            files.push(path);
          } else if ft.is_dir() {
            files.extend(collect_rule_files(&path));
          }
        }
      }
    }
    files
  }

  let all_rule_files = collect_rule_files(&fixture.project_claude_dir().join("rules"));
  assert!(
    !all_rule_files.is_empty(),
    "project .claude/rules should contain at least one file"
  );
  for file_path in &all_rule_files {
    let name = file_path.file_name().unwrap().to_string_lossy().to_string();
    assert!(name.starts_with("rule-") && name.ends_with(".md"));
    let content = fs::read_to_string(file_path).unwrap();
    assert!(content.starts_with("---\n"));
    assert!(content.contains("rule:"));
  }
}

/// Verify that template interpolation in the global CLAUDE.md works correctly.
#[test]
fn local_install_claude_global_md_url_interpolation() {
  let fixture = IsolatedInstallFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before install");
  fixture
    .install()
    .assert_failure("isolated tnmsc install should be blocked by protected root CLAUDE.md");

  let content = fs::read_to_string(fixture.global_claude_path()).unwrap();
  assert!(
    content.contains("TrueNine"),
    "inline expression should be evaluated to TrueNine\ngot:\n{content}"
  );
  assert!(
    content.contains("[TrueNineGithub]"),
    "link text interpolation should be evaluated\ngot:\n{content}"
  );
  assert!(
    content.contains("https://github.com/TrueNine"),
    "URL interpolation should be evaluated\ngot:\n{content}"
  );
  assert!(
    !content.contains("github.com/{profile"),
    "unreplaced URL interpolation found\ngot:\n{content}"
  );
}

/// Guard test: ensure the compiled tnmsc binary exists before running other tests.
#[test]
fn binary_exists_before_tests() {
  let binary = tnmsc_local_tests::binary_path();
  assert!(
    binary.is_file(),
    "binary not found at: {}\n\nplease compile it first:\n  cargo build -p tnmsc\n",
    binary.display()
  );
}
