//! Isolated codex smoke tests for CodexCLIOutputAdaptor.
//!
//! These tests use a temporary HOME/workspace fixture so codex output checks do
//! not depend on the caller's real `~/.aindex/.tnmsc.json` or `~/.codex`.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use tnmsc_local_tests::LocalTestRunner;

struct IsolatedCodexFixture {
  runner: LocalTestRunner,
  temp_home: PathBuf,
  project_dir: PathBuf,
  aindex_dir: PathBuf,
}

impl IsolatedCodexFixture {
  fn new() -> Self {
    let temp_root = std::env::temp_dir().join(format!(
      "tnmsc-local-codex-{}-{}",
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
    let aindex_project_dir = aindex_dir.join("app").join("memory-sync");

    fs::create_dir_all(temp_home.join(".aindex")).unwrap();
    fs::create_dir_all(project_dir.join(".github")).unwrap();
    fs::create_dir_all(aindex_project_dir.join(".github")).unwrap();
    init_git_repo(&project_dir);
    fs::create_dir_all(aindex_dir.join("commands")).unwrap();
    fs::create_dir_all(aindex_dir.join("subagents").join("qa")).unwrap();
    fs::create_dir_all(
      aindex_dir
        .join("skills")
        .join("browser")
        .join("agent-browser"),
    )
    .unwrap();
    fs::create_dir_all(aindex_dir.join("skills").join("plain-skill")).unwrap();

    // issue local-tests-codex-isolation: codex smoke tests must not depend on
    // the host ~/.codex or host workspace prompt inventory.
    write_codex_config(&temp_home, &workspace_dir);
    write_codex_prompt_sources(&aindex_dir, &aindex_project_dir);

    Self {
      runner: LocalTestRunner::with_cwd(&project_dir),
      temp_home,
      project_dir,
      aindex_dir,
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

  fn dry_run(&self) -> tnmsc_local_tests::CommandResult {
    self.run(&["dry-run"])
  }

  fn global_codex_dir(&self) -> PathBuf {
    self.temp_home.join(".codex")
  }

  fn global_agents_path(&self) -> PathBuf {
    self.global_codex_dir().join("AGENTS.md")
  }

  fn global_prompts_dir(&self) -> PathBuf {
    self.global_codex_dir().join("prompts")
  }

  fn global_agents_dir(&self) -> PathBuf {
    self.global_codex_dir().join("agents")
  }

  fn project_codex_dir(&self) -> PathBuf {
    self.project_dir.join(".codex")
  }

  fn child_codex_path(&self) -> PathBuf {
    self.project_dir.join(".github").join(".codex")
  }

  fn project_agents_dir(&self) -> PathBuf {
    self.project_codex_dir().join("agents")
  }

  fn project_skills_dir(&self) -> PathBuf {
    self.project_codex_dir().join("skills")
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

fn write_codex_config(temp_home: &Path, workspace_dir: &Path) {
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
        "codex": true,
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

fn write_codex_prompt_sources(aindex_dir: &Path, aindex_project_dir: &Path) {
  fs::write(
    aindex_dir.join("global.mdx"),
    "---\ndescription: global memory\n---\nGlobal codex memory\n",
  )
  .unwrap();
  fs::write(
    aindex_dir.join("workspace.mdx"),
    "---\ndescription: workspace memory\n---\nWorkspace codex memory\n",
  )
  .unwrap();
  fs::write(
    aindex_dir.join("workspace.src.mdx"),
    "---\ndescription: workspace memory\n---\nWorkspace codex memory\n",
  )
  .unwrap();
  fs::write(
    aindex_project_dir.join("agt.mdx"),
    "# Project codex memory\n\nProject root instructions\n",
  )
  .unwrap();
  fs::write(
    aindex_project_dir.join(".github").join("agt.mdx"),
    "# Child codex memory\n\nChild instructions\n",
  )
  .unwrap();

  fs::write(
    aindex_dir.join("commands").join("demo.mdx"),
    "---\ndescription: Demo command\nargumentHint: target\nscope: global\n---\nRun demo command\n",
  )
  .unwrap();
  fs::write(
    aindex_dir.join("commands").join("qa_boot.mdx"),
    "---\ndescription: QA boot\nargumentHint: repo\nscope: global\n---\nRun QA boot\n",
  )
  .unwrap();

  fs::write(
    aindex_dir.join("subagents").join("demo.mdx"),
    "---\ndescription: Demo agent\nscope: global\n---\nDemo agent instructions\n",
  )
  .unwrap();
  fs::write(
    aindex_dir.join("subagents").join("qa").join("boot.mdx"),
    "---\ndescription: QA boot agent\nscope: global\n---\nQA boot instructions\n",
  )
  .unwrap();

  let browser_skill_dir = aindex_dir
    .join("skills")
    .join("browser")
    .join("agent-browser");
  fs::create_dir_all(browser_skill_dir.join("references")).unwrap();
  fs::create_dir_all(browser_skill_dir.join("templates")).unwrap();
  fs::create_dir_all(browser_skill_dir.join("assets")).unwrap();
  fs::write(
    browser_skill_dir.join("skill.mdx"),
    "export default { description: 'Browser skill', name: 'Browser Agent Browser' }\n\n# Browser Skill\n",
  )
  .unwrap();
  fs::write(
    browser_skill_dir.join("skill.src.mdx"),
    "export default { description: 'Browser skill', name: 'Browser Agent Browser' }\n\n# Browser Skill\n",
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
    browser_skill_dir.join("assets").join("logo.png"),
    [0x89_u8, 0x50, 0x4E, 0x47, 0x00, 0xFF],
  )
  .unwrap();
  fs::write(
    browser_skill_dir.join("mcp.json"),
    "{\n  \"mcpServers\": {\n    \"browser\": { \"command\": \"agent-browser\" }\n  }\n}\n",
  )
  .unwrap();

  let plain_skill_dir = aindex_dir.join("skills").join("plain-skill");
  fs::write(
    plain_skill_dir.join("skill.mdx"),
    "export default { description: 'Plain skill' }\n\n# Plain Skill\n",
  )
  .unwrap();
  fs::write(
    plain_skill_dir.join("skill.src.mdx"),
    "export default { description: 'Plain skill' }\n\n# Plain Skill\n",
  )
  .unwrap();
}

fn expected_installed_skill_names(
  aindex_skills_dir: &std::path::Path,
) -> std::collections::HashSet<String> {
  let mut names = std::collections::HashSet::new();

  for entry in std::fs::read_dir(aindex_skills_dir).unwrap().flatten() {
    if !entry
      .file_type()
      .map(|file_type| file_type.is_dir())
      .unwrap_or(false)
    {
      continue;
    }

    let first_level_dir = entry.path();
    let first_level_name = entry.file_name().to_string_lossy().to_string();
    let has_root_skill = first_level_dir.join("skill.mdx").is_file()
      || first_level_dir.join("skill.src.mdx").is_file();

    if has_root_skill {
      names.insert(first_level_name);
      continue;
    }

    for nested_entry in std::fs::read_dir(&first_level_dir).unwrap().flatten() {
      if !nested_entry
        .file_type()
        .map(|file_type| file_type.is_dir())
        .unwrap_or(false)
      {
        continue;
      }

      let nested_name = nested_entry.file_name().to_string_lossy().to_string();
      names.insert(format!("{first_level_name}-{nested_name}"));
    }
  }

  names
}

fn collect_file_names(dir: &Path, suffix: &str) -> HashSet<String> {
  fs::read_dir(dir)
    .unwrap()
    .flatten()
    .filter(|entry| {
      entry
        .file_type()
        .map(|file_type| file_type.is_file())
        .unwrap_or(false)
        && entry.file_name().to_string_lossy().ends_with(suffix)
    })
    .map(|entry| entry.file_name().to_string_lossy().to_string())
    .collect()
}

#[test]
fn local_codex_install_generates_global_agents_md() {
  let fixture = IsolatedCodexFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before codex install");
  fixture
    .install()
    .assert_failure("isolated tnmsc install should surface protected workspace AGENTS.md");

  assert!(
    fixture.global_agents_path().is_file(),
    "~/.codex/AGENTS.md should be generated after install"
  );
  assert!(
    !fs::read_to_string(fixture.global_agents_path())
      .unwrap()
      .trim()
      .is_empty(),
    "~/.codex/AGENTS.md should not be empty"
  );
}

#[test]
fn local_codex_global_agents_md_matches_aindex_source() {
  let fixture = IsolatedCodexFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before codex install");
  fixture
    .install()
    .assert_failure("isolated tnmsc install should surface protected workspace AGENTS.md");

  let aindex_global = fs::read_to_string(fixture.aindex_dir.join("global.mdx")).unwrap();
  let codex_global = fs::read_to_string(fixture.global_agents_path()).unwrap();

  assert_eq!(
    aindex_global.trim(),
    codex_global.trim(),
    "~/.codex/AGENTS.md should match aindex/global.mdx"
  );
}

#[test]
fn local_codex_install_generates_global_prompts_dir() {
  let fixture = IsolatedCodexFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before codex install");
  fixture
    .install()
    .assert_failure("isolated tnmsc install should surface protected workspace AGENTS.md");

  assert!(
    fixture.global_prompts_dir().is_dir(),
    "~/.codex/prompts/ should be generated after install"
  );
}

#[test]
fn local_codex_prompts_match_aindex_commands() {
  let fixture = IsolatedCodexFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before codex install");
  fixture
    .install()
    .assert_failure("isolated tnmsc install should surface protected workspace AGENTS.md");

  let prompt_files: Vec<_> = fs::read_dir(fixture.global_prompts_dir())
    .unwrap()
    .flatten()
    .filter(|entry| entry.file_type().map(|ft| ft.is_file()).unwrap_or(false))
    .collect();

  assert!(
    !prompt_files.is_empty(),
    "~/.codex/prompts/ should contain at least one file"
  );

  let prompt_names: HashSet<String> = prompt_files
    .iter()
    .map(|entry| entry.file_name().to_string_lossy().to_string())
    .collect();
  assert!(
    prompt_names.contains("demo.md"),
    "codex prompts should include demo.md"
  );
  assert!(
    prompt_names.contains("qa-boot.md"),
    "codex prompts should include qa-boot.md"
  );

  for file in &prompt_files {
    let name = file.file_name();
    let name_str = name.to_string_lossy();
    assert!(
      name_str.ends_with(".md"),
      "every file in ~/.codex/prompts must be .md, got: {}",
      name_str
    );
    let content = fs::read_to_string(file.path()).unwrap();
    if content.contains("argument") {
      assert!(
        !content.contains("argumentHint:"),
        "prompt file {} should use 'argument-hint', not 'argumentHint'",
        name_str
      );
    }
  }
}

#[test]
fn local_codex_prompts_no_command_field_and_quoted_values() {
  let fixture = IsolatedCodexFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before codex install");
  fixture
    .install()
    .assert_failure("isolated tnmsc install should surface protected workspace AGENTS.md");

  let prompt_files: Vec<_> = fs::read_dir(fixture.global_prompts_dir())
    .unwrap()
    .flatten()
    .filter(|entry| entry.file_type().map(|ft| ft.is_file()).unwrap_or(false))
    .collect();

  assert!(
    !prompt_files.is_empty(),
    "~/.codex/prompts/ should contain at least one file"
  );

  for file in &prompt_files {
    let name_str = file.file_name().to_string_lossy().to_string();
    let content = fs::read_to_string(file.path()).unwrap();
    let fm_end = content.find("\n---\n").unwrap_or(content.len());
    let front_matter = &content[..fm_end];

    assert!(
      !front_matter.contains("command:"),
      "prompt file {} must NOT contain 'command:' field",
      name_str
    );

    for line in front_matter.lines() {
      if let Some(pos) = line.find(": ") {
        let key = &line[..pos];
        let value = &line[pos + 2..];
        let key_trimmed = key.trim();
        if key_trimmed != "description" && key_trimmed != "argument-hint" {
          continue;
        }
        if value.trim().is_empty() {
          continue;
        }
        let trimmed = value.trim();
        assert!(
          trimmed.starts_with('"') && trimmed.ends_with('"'),
          "prompt file {} has unquoted value '{}' in line '{}'",
          name_str,
          value,
          line
        );
      }
    }
  }
}

#[test]
fn local_codex_install_generates_project_codex_dir() {
  let fixture = IsolatedCodexFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before codex install");
  fixture
    .install()
    .assert_failure("isolated tnmsc install should surface protected workspace AGENTS.md");

  assert!(
    fixture.project_codex_dir().is_dir(),
    "project .codex/ should be generated after install"
  );
}

#[test]
fn local_codex_project_skills_match_aindex_skills() {
  let fixture = IsolatedCodexFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before codex install");
  fixture
    .install()
    .assert_failure("isolated tnmsc install should surface protected workspace AGENTS.md");

  assert!(
    fixture.project_skills_dir().is_dir(),
    "project .codex/skills/ should exist after install"
  );

  let aindex_skills_dir = fixture.aindex_dir.join("skills");
  let expected_names = expected_installed_skill_names(&aindex_skills_dir);
  let project_names: HashSet<String> = fs::read_dir(fixture.project_skills_dir())
    .unwrap()
    .flatten()
    .filter(|entry| {
      entry
        .file_type()
        .map(|file_type| file_type.is_dir())
        .unwrap_or(false)
    })
    .map(|entry| entry.file_name().to_string_lossy().to_string())
    .collect();

  assert_eq!(
    expected_names, project_names,
    "project .codex/skills directory names should match transformed aindex/skills names"
  );
}

#[test]
fn local_codex_global_agents_copied_to_project() {
  let fixture = IsolatedCodexFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before codex install");
  fixture
    .install()
    .assert_failure("isolated tnmsc install should surface protected workspace AGENTS.md");

  assert!(
    fixture.global_agents_dir().is_dir(),
    "~/.codex/agents/ should exist after install"
  );
  assert!(
    fixture.project_agents_dir().is_dir(),
    "project .codex/agents/ should exist after install"
  );

  let global_names = collect_file_names(&fixture.global_agents_dir(), ".toml");
  let project_names = collect_file_names(&fixture.project_agents_dir(), ".toml");

  assert_eq!(
    global_names, project_names,
    "project .codex/agents file names should match global ~/.codex/agents"
  );
}

#[test]
fn local_codex_project_agents_are_all_toml() {
  let fixture = IsolatedCodexFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before codex install");
  fixture
    .install()
    .assert_failure("isolated tnmsc install should surface protected workspace AGENTS.md");

  let agent_files: Vec<_> = fs::read_dir(fixture.project_agents_dir())
    .unwrap()
    .flatten()
    .filter(|entry| entry.file_type().map(|ft| ft.is_file()).unwrap_or(false))
    .collect();

  assert!(
    !agent_files.is_empty(),
    "project .codex/agents/ should contain at least one file"
  );

  for file in &agent_files {
    let name_str = file.file_name().to_string_lossy().to_string();
    assert!(
      name_str.ends_with(".toml"),
      "every file in .codex/agents must be .toml, got: {}",
      name_str
    );

    let content = fs::read_to_string(file.path()).unwrap();
    assert!(
      content.contains("name = "),
      "agent file {} should contain 'name' field",
      name_str
    );
    assert!(
      content.contains("developer_instructions = "),
      "agent file {} should contain 'developer_instructions' field",
      name_str
    );
  }
}

#[test]
fn local_codex_clean_removes_files() {
  let fixture = IsolatedCodexFixture::new();

  fixture.install().assert_failure(
    "isolated tnmsc install before codex clean should surface protected workspace AGENTS.md",
  );

  assert!(
    fixture.project_codex_dir().is_dir(),
    ".codex/ should exist after install"
  );

  fixture.clean().assert_success("isolated tnmsc clean");

  assert!(
    !fixture.project_codex_dir().exists(),
    ".codex/ should be removed after clean"
  );
  assert!(
    !fixture.global_codex_dir().join("agents").exists(),
    "~/.codex/agents should be removed after clean"
  );
  assert!(
    !fixture.global_codex_dir().join("prompts").exists(),
    "~/.codex/prompts should be removed after clean"
  );
}

#[test]
fn local_codex_clean_removes_legacy_codex_files_recursively() {
  let fixture = IsolatedCodexFixture::new();

  fs::write(fixture.child_codex_path(), "legacy codex file\n").unwrap();
  assert!(
    fixture.child_codex_path().is_file(),
    "legacy nested .codex file should exist before clean"
  );

  fixture
    .clean()
    .assert_success("isolated tnmsc clean removes legacy nested .codex file");

  assert!(
    !fixture.child_codex_path().exists(),
    "legacy nested .codex file should be removed during clean"
  );
}

#[test]
fn local_codex_dry_run_does_not_write() {
  let fixture = IsolatedCodexFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before codex dry-run");

  assert!(
    !fixture.project_codex_dir().exists(),
    ".codex/ should not exist before dry-run"
  );

  fixture.dry_run().assert_success("isolated tnmsc dry-run");

  assert!(
    !fixture.project_codex_dir().exists(),
    ".codex/ should not be created by dry-run"
  );
  assert!(
    !fixture.global_codex_dir().exists(),
    "~/.codex/ should not be created by dry-run"
  );
}

/// Isolated regression test: install into a temp directory (not the real project) with
/// only codex+opencode enabled, using a minimal browser skill fixture. Verifies SKILL.md,
/// references/, templates/, and mcp.json are all generated, and that clean removes the
/// entire generated tree.
#[test]
fn regression_isolated_install_outputs_full_browser_skill_and_clean_removes_it() {
  let runner = LocalTestRunner::new();

  let temp_root = std::env::temp_dir().join(format!(
    "tnmsc-local-browser-skill-{}-{}",
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
    .join("browser")
    .join("agent-browser");

  std::fs::create_dir_all(temp_home.join(".aindex")).unwrap();
  std::fs::create_dir_all(skill_dir.join("references")).unwrap();
  std::fs::create_dir_all(skill_dir.join("templates")).unwrap();
  std::fs::create_dir_all(skill_dir.join("assets")).unwrap();
  std::fs::create_dir_all(&aindex_dir).unwrap();

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
        "codex": true,
        "claudeCode": false,
        "opencode": true
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
    "export default { description: 'Browser skill' }\n\n# Browser Skill\n",
  )
  .unwrap();
  std::fs::write(
    skill_dir.join("skill.mdx"),
    "export default { description: 'Browser skill' }\n\n# Browser Skill\n",
  )
  .unwrap();
  std::fs::write(
    skill_dir.join("references").join("linux-wsl.src.mdx"),
    "---\ndescription: Linux WSL reference\n---\n# Linux WSL\n",
  )
  .unwrap();
  std::fs::write(
    skill_dir.join("references").join("linux-wsl.mdx"),
    "---\ndescription: Linux WSL reference\n---\n# Linux WSL\n",
  )
  .unwrap();
  std::fs::write(
    skill_dir.join("references").join("authentication.src.mdx"),
    "---\ndescription: Authentication reference\n---\n# Authentication\n",
  )
  .unwrap();
  std::fs::write(
    skill_dir.join("references").join("authentication.mdx"),
    "---\ndescription: Authentication reference\n---\n# Authentication\n",
  )
  .unwrap();
  std::fs::write(
    skill_dir.join("templates").join("capture-workflow.sh"),
    "#!/usr/bin/env bash\necho capture\n",
  )
  .unwrap();
  std::fs::write(
    skill_dir.join("templates").join("authenticated-session.sh"),
    "#!/usr/bin/env bash\necho auth\n",
  )
  .unwrap();
  std::fs::write(
    skill_dir.join("assets").join("logo.png"),
    [0x89_u8, 0x50, 0x4E, 0x47, 0x00, 0xFF],
  )
  .unwrap();
  std::fs::write(
    skill_dir.join("mcp.json"),
    "{\n  \"mcpServers\": {\n    \"browser\": { \"command\": \"agent-browser\" }\n  }\n}\n",
  )
  .unwrap();

  let temp_home_str = temp_home.to_string_lossy().into_owned();

  let install = runner.run_at_with_env(&workspace_dir, &["install"], &[("HOME", &temp_home_str)]);
  install.assert_failure(
    "isolated tnmsc install should surface protected root AGENTS.md while still writing codex outputs",
  );
  assert!(
    install.stderr.contains("Refusing to write protected path.")
      || install
        .stderr
        .contains("AGENTS.md: Refusing to write protected path."),
    "expected protected-path failure for root AGENTS.md, got stderr:\n{}",
    install.stderr
  );

  for (label, skill_root) in [
    ("codex", workspace_dir.join(".codex").join("skills")),
    ("opencode", workspace_dir.join(".opencode").join("skills")),
  ] {
    let browser_skill_dir = skill_root.join("browser-agent-browser");
    assert!(
      browser_skill_dir.join("SKILL.md").is_file(),
      "{label} should generate SKILL.md for browser-agent-browser"
    );
    assert!(
      browser_skill_dir
        .join("references")
        .join("linux-wsl.md")
        .is_file(),
      "{label} should generate child docs under references/"
    );
    assert!(
      browser_skill_dir
        .join("references")
        .join("authentication.md")
        .is_file(),
      "{label} should generate every child doc under references/"
    );
    assert!(
      !browser_skill_dir
        .join("references")
        .join("linux-wsl.mdx")
        .exists(),
      "{label} should not leave child docs as .mdx files"
    );
    assert!(
      !browser_skill_dir
        .join("references")
        .join("authentication.mdx")
        .exists(),
      "{label} should not leave any compiled child doc as .mdx"
    );
    assert!(
      browser_skill_dir
        .join("templates")
        .join("capture-workflow.sh")
        .is_file(),
      "{label} should generate resource files under templates/"
    );
    assert!(
      browser_skill_dir
        .join("templates")
        .join("authenticated-session.sh")
        .is_file(),
      "{label} should generate every template resource"
    );
    assert!(
      browser_skill_dir.join("assets").join("logo.png").is_file(),
      "{label} should generate binary resource files under assets/"
    );
    assert!(
      browser_skill_dir.join("mcp.json").is_file(),
      "{label} should generate mcp.json"
    );
    let skill_content = std::fs::read_to_string(browser_skill_dir.join("SKILL.md")).unwrap();
    assert!(
      skill_content.contains("name: browser-agent-browser"),
      "{label} should align SKILL.md name field with the generated skill directory"
    );
    assert_eq!(
      std::fs::read(browser_skill_dir.join("assets").join("logo.png")).unwrap(),
      vec![0x89_u8, 0x50, 0x4E, 0x47, 0x00, 0xFF],
      "{label} should preserve binary resource bytes"
    );
  }

  let stale_file = workspace_dir
    .join(".codex")
    .join("skills")
    .join("browser-agent-browser")
    .join("stale.txt");
  std::fs::write(&stale_file, "stale").unwrap();
  assert!(
    stale_file.is_file(),
    "stale test file should exist before clean"
  );

  let clean = runner.run_at_with_env(&workspace_dir, &["clean"], &[("HOME", &temp_home_str)]);
  clean.assert_success("isolated tnmsc clean");

  assert!(
    !workspace_dir.join(".codex").exists(),
    "clean should remove the entire generated .codex tree"
  );
}
