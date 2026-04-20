//! 本地裸机 codex 测试：验证 CodexCLIOutputAdaptor 生成的 codex 文件。
//!
//! **前提**：项目已配置，codex 插件已启用（plugins.codex = true）。

use std::path::Path;
use tnmsc_local_tests::LocalTestRunner;

fn assert_codex_plugin_enabled() {
  let config_path = dirs::home_dir()
    .expect("should have home directory")
    .join(".aindex")
    .join(".tnmsc.json");
  let raw = std::fs::read_to_string(&config_path).expect("~/.aindex/.tnmsc.json should exist");
  let parsed: serde_json::Value = serde_json::from_str(&raw).expect("should be valid JSON");
  let codex_enabled = parsed
    .get("plugins")
    .and_then(|p| p.get("codex"))
    .and_then(|v| v.as_bool())
    .unwrap_or(false);
  assert!(
    codex_enabled,
    "plugins.codex must be set to true in ~/.aindex/.tnmsc.json"
  );
}

#[test]
fn local_codex_install_generates_global_agents_md() {
  assert_codex_plugin_enabled();

  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  assert!(
    runner.codex_global_file_exists(),
    "~/.codex/AGENTS.md should be generated after install"
  );

  let content = runner
    .read_codex_global_file()
    .expect("~/.codex/AGENTS.md should be readable");
  assert!(!content.is_empty(), "~/.codex/AGENTS.md should not be empty");
}

#[test]
fn local_codex_global_agents_md_matches_aindex_source() {
  assert_codex_plugin_enabled();

  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  let aindex_global = runner
    .read_aindex_file("global.mdx")
    .expect("aindex global.mdx should be readable");

  let codex_global = runner
    .read_codex_global_file()
    .expect("~/.codex/AGENTS.md should be readable after install");

  assert_eq!(
    aindex_global.trim(),
    codex_global.trim(),
    "~/.codex/AGENTS.md should match aindex/global.mdx"
  );
}

#[test]
fn local_codex_install_generates_global_prompts_dir() {
  assert_codex_plugin_enabled();

  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  assert!(
    runner.codex_global_prompts_dir_exists(),
    "~/.codex/prompts/ should be generated after install"
  );
}

#[test]
fn local_codex_prompts_match_aindex_commands() {
  assert_codex_plugin_enabled();

  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  assert!(
    runner.codex_global_prompts_dir_exists(),
    "~/.codex/prompts/ should exist after install"
  );

  let prompts_dir = dirs::home_dir()
    .expect("should have home directory")
    .join(".codex")
    .join("prompts");
  let prompt_files: Vec<_> = std::fs::read_dir(&prompts_dir)
    .unwrap()
    .flatten()
    .filter(|e| e.file_type().map(|ft| ft.is_file()).unwrap_or(false))
    .collect();

  assert!(
    !prompt_files.is_empty(),
    "~/.codex/prompts/ should contain at least one file"
  );

  // Verify all files are .md
  for file in &prompt_files {
    let name = file.file_name();
    let name_str = name.to_string_lossy();
    assert!(
      name_str.ends_with(".md"),
      "every file in ~/.codex/prompts must be .md, got: {}",
      name_str
    );
    let content = std::fs::read_to_string(file.path()).unwrap();
    assert!(
      content.starts_with("---\n"),
      "prompt file {} should start with YAML front matter '---'",
      name_str
    );
    assert!(
      content.contains("command:"),
      "prompt file {} should contain 'command:' source identifier",
      name_str
    );
  }
}

#[test]
fn local_codex_install_generates_project_codex_dir() {
  assert_codex_plugin_enabled();

  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  assert!(
    runner.codex_project_dir_exists(),
    "~/workspace/memory-sync/.codex/ should be generated after install"
  );
}

#[test]
fn local_codex_project_skills_match_aindex_skills() {
  assert_codex_plugin_enabled();

  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  assert!(
    runner.codex_project_skills_dir_exists(),
    "~/workspace/memory-sync/.codex/skills/ should exist after install"
  );

  // Count aindex skills
  let aindex_dir = runner.resolve_aindex_dir().expect("aindex dir should exist");
  let aindex_skills_dir = aindex_dir.join("skills");
  let aindex_skill_entries: Vec<_> = std::fs::read_dir(&aindex_skills_dir)
    .unwrap()
    .flatten()
    .filter(|e| e.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
    .collect();

  // Count project codex skills
  let project_skills_dir = runner.cwd().join(".codex").join("skills");
  let project_skill_entries: Vec<_> = std::fs::read_dir(&project_skills_dir)
    .unwrap()
    .flatten()
    .filter(|e| e.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
    .collect();

  assert_eq!(
    aindex_skill_entries.len(),
    project_skill_entries.len(),
    "project .codex/skills should have same count as aindex/skills"
  );

  // Verify same directory names
  let aindex_names: std::collections::HashSet<String> = aindex_skill_entries
    .iter()
    .map(|e| e.file_name().to_string_lossy().to_string())
    .collect();
  let project_names: std::collections::HashSet<String> = project_skill_entries
    .iter()
    .map(|e| e.file_name().to_string_lossy().to_string())
    .collect();

  assert_eq!(
    aindex_names, project_names,
    "project .codex/skills directory names should match aindex/skills"
  );
}

#[test]
fn local_codex_global_agents_copied_to_project() {
  assert_codex_plugin_enabled();

  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  assert!(
    runner.codex_global_agents_dir_exists(),
    "~/.codex/agents/ should exist after install"
  );

  assert!(
    runner.codex_project_agents_dir_exists(),
    "~/workspace/memory-sync/.codex/agents/ should exist after install"
  );

  // Compare global and project agents
  let global_agents_dir = dirs::home_dir()
    .expect("should have home directory")
    .join(".codex")
    .join("agents");
  let project_agents_dir = runner.cwd().join(".codex").join("agents");

  let global_agent_files: Vec<_> = std::fs::read_dir(&global_agents_dir)
    .unwrap()
    .flatten()
    .filter(|e| {
      e.file_type().map(|ft| ft.is_file()).unwrap_or(false)
        && e.file_name().to_string_lossy().ends_with(".toml")
    })
    .collect();

  let project_agent_files: Vec<_> = std::fs::read_dir(&project_agents_dir)
    .unwrap()
    .flatten()
    .filter(|e| {
      e.file_type().map(|ft| ft.is_file()).unwrap_or(false)
        && e.file_name().to_string_lossy().ends_with(".toml")
    })
    .collect();

  assert_eq!(
    global_agent_files.len(),
    project_agent_files.len(),
    "project .codex/agents should have same count as global ~/.codex/agents"
  );

  let global_names: std::collections::HashSet<String> = global_agent_files
    .iter()
    .map(|e| e.file_name().to_string_lossy().to_string())
    .collect();
  let project_names: std::collections::HashSet<String> = project_agent_files
    .iter()
    .map(|e| e.file_name().to_string_lossy().to_string())
    .collect();

  assert_eq!(
    global_names, project_names,
    "project .codex/agents file names should match global ~/.codex/agents"
  );
}

#[test]
fn local_codex_project_agents_are_all_toml() {
  assert_codex_plugin_enabled();

  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  assert!(
    runner.codex_project_agents_dir_exists(),
    "~/workspace/memory-sync/.codex/agents/ should exist after install"
  );

  let agents_dir = runner.cwd().join(".codex").join("agents");
  let agent_files: Vec<_> = std::fs::read_dir(&agents_dir)
    .unwrap()
    .flatten()
    .filter(|e| e.file_type().map(|ft| ft.is_file()).unwrap_or(false))
    .collect();

  assert!(
    !agent_files.is_empty(),
    "~/workspace/memory-sync/.codex/agents/ should contain at least one file"
  );

  for file in &agent_files {
    let name = file.file_name();
    let name_str = name.to_string_lossy();
    assert!(
      name_str.ends_with(".toml"),
      "every file in .codex/agents must be .toml, got: {}",
      name_str
    );

    // Verify it's valid TOML with expected fields
    let content = std::fs::read_to_string(file.path()).unwrap();
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
  assert_codex_plugin_enabled();

  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let install = runner.install();
  install.assert_success("tnmsc install before clean");

  assert!(
    runner.codex_project_dir_exists(),
    ".codex/ should exist after install"
  );

  let clean = runner.clean();
  clean.assert_success("tnmsc clean");

  assert!(
    !runner.codex_project_dir_exists(),
    ".codex/ should be removed after clean"
  );
}

#[test]
fn local_codex_dry_run_does_not_write() {
  assert_codex_plugin_enabled();

  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before dry-run");

  assert!(
    !runner.codex_project_dir_exists(),
    ".codex/ should not exist before dry-run"
  );

  let dry = runner.dry_run();
  dry.assert_success("tnmsc dry-run");

  assert!(
    !runner.codex_project_dir_exists(),
    ".codex/ should not be created by dry-run"
  );
}
