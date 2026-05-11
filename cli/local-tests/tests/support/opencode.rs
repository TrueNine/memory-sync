use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use tnmsc_local_tests::LocalTestRunner;

pub struct IsolatedOpencodeFixture {
  pub runner: LocalTestRunner,
  pub temp_home: PathBuf,
  pub project_dir: PathBuf,
  #[allow(dead_code)]
  pub aindex_dir: PathBuf,
}

impl IsolatedOpencodeFixture {
  pub fn new() -> Self {
    let temp_root = std::env::temp_dir().join(format!(
      "tnmsc-local-opencode-{}-{}",
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
    fs::create_dir_all(aindex_dir.join("commands")).unwrap();
    fs::create_dir_all(aindex_dir.join("subagents").join("qa")).unwrap();
    fs::create_dir_all(aindex_dir.join("rules").join("qa")).unwrap();
    fs::create_dir_all(
      aindex_dir
        .join("skills")
        .join("browser")
        .join("agent-browser"),
    )
    .unwrap();
    fs::create_dir_all(
      aindex_dir
        .join("skills")
        .join("dev-tools")
        .join("reverse-engineering"),
    )
    .unwrap();
    fs::create_dir_all(aindex_dir.join("skills").join("plain-skill")).unwrap();
    init_git_repo(&project_dir);

    // issue local-tests-opencode-isolation: opencode local tests must validate
    // generated output in a temp HOME/workspace instead of the host machine.
    write_opencode_config(&temp_home, &workspace_dir);
    write_opencode_prompt_sources(&aindex_dir, &aindex_project_dir);

    Self {
      runner: LocalTestRunner::with_cwd(&project_dir),
      temp_home,
      project_dir,
      aindex_dir,
    }
  }

  pub fn env_home(&self) -> String {
    self.temp_home.to_string_lossy().into_owned()
  }

  pub fn run(&self, args: &[&str]) -> tnmsc_local_tests::CommandResult {
    let temp_home = self.env_home();
    self
      .runner
      .run_at_with_env(&self.project_dir, args, &[("HOME", &temp_home)])
  }

  pub fn install(&self) -> tnmsc_local_tests::CommandResult {
    self.run(&["install"])
  }

  pub fn clean(&self) -> tnmsc_local_tests::CommandResult {
    self.run(&["clean"])
  }

  #[allow(dead_code)]
  pub fn dry_run(&self) -> tnmsc_local_tests::CommandResult {
    self.run(&["dry-run"])
  }

  #[allow(dead_code)]
  pub fn project_opencode_dir(&self) -> PathBuf {
    self.project_dir.join(".opencode")
  }

  #[allow(dead_code)]
  pub fn project_agents_path(&self) -> PathBuf {
    self.project_opencode_dir().join("AGENTS.md")
  }

  #[allow(dead_code)]
  pub fn child_agents_path(&self) -> PathBuf {
    self
      .project_dir
      .join(".github")
      .join(".opencode")
      .join("AGENTS.md")
  }

  #[allow(dead_code)]
  pub fn global_agents_path(&self) -> PathBuf {
    self
      .temp_home
      .join(".config")
      .join("opencode")
      .join("AGENTS.md")
  }

  pub fn project_agents_dir(&self) -> PathBuf {
    self.project_opencode_dir().join("agents")
  }

  #[allow(dead_code)]
  pub fn project_commands_dir(&self) -> PathBuf {
    self.project_opencode_dir().join("commands")
  }

  #[allow(dead_code)]
  pub fn project_rules_dir(&self) -> PathBuf {
    self.project_opencode_dir().join("rules")
  }

  #[allow(dead_code)]
  pub fn project_skills_dir(&self) -> PathBuf {
    self.project_opencode_dir().join("skills")
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

#[allow(dead_code)]
pub fn collect_file_names(dir: &Path, suffix: &str) -> HashSet<String> {
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

#[allow(dead_code)]
pub fn expected_installed_skill_names(aindex_skills_dir: &Path) -> HashSet<String> {
  let mut names = HashSet::new();

  for entry in fs::read_dir(aindex_skills_dir).unwrap().flatten() {
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

    for nested_entry in fs::read_dir(&first_level_dir).unwrap().flatten() {
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

fn write_opencode_config(temp_home: &Path, workspace_dir: &Path) {
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
        "opencode": true,
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

fn write_opencode_prompt_sources(aindex_dir: &Path, aindex_project_dir: &Path) {
  fs::write(
    aindex_dir.join("global.mdx"),
    "你是 TrueNine 的协作者。\n\n[TrueNineGithub](https://github.com/TrueNine)\n",
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
    "# Opencode project root\n\nProject root instructions\n",
  )
  .unwrap();
  fs::write(
    aindex_project_dir.join(".github").join("agt.mdx"),
    "# Opencode child\n\nChild instructions\n",
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
    "---\ndescription: Demo agent\ncolor: blue\nmodel: gpt-test\nscope: global\n---\nDemo agent instructions\n",
  )
  .unwrap();
  fs::write(
    aindex_dir.join("subagents").join("qa").join("boot.mdx"),
    "---\ndescription: QA boot agent\ncolor: notacolor\nscope: global\n---\nQA boot instructions\n",
  )
  .unwrap();

  fs::write(
    aindex_dir.join("rules").join("qa").join("boot.mdx"),
    "---\ndescription: QA boot rule\npaths:\n  - \"**/*.rs\"\nscope: project\n---\nRule body\n",
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

  let reverse_skill_dir = aindex_dir
    .join("skills")
    .join("dev-tools")
    .join("reverse-engineering");
  fs::write(
    reverse_skill_dir.join("skill.src.mdx"),
    "export default { name: 'reverse-engineering', description: 'Reverse engineering skill' }\n\n# Reverse\n",
  )
  .unwrap();
  fs::write(
    reverse_skill_dir.join("skill.mdx"),
    "export default { name: 'reverse-engineering', description: 'Reverse engineering skill' }\n\n# Reverse\n",
  )
  .unwrap();
  for name in ["packet-capture", "reverse-tools"] {
    fs::write(
      reverse_skill_dir.join(format!("{name}.src.mdx")),
      format!("---\ndescription: {name}\n---\n# {name}\n"),
    )
    .unwrap();
    fs::write(
      reverse_skill_dir.join(format!("{name}.mdx")),
      format!("---\ndescription: {name}\n---\n# {name}\n"),
    )
    .unwrap();
  }

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
