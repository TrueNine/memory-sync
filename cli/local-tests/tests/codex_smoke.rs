//! 本地裸机 codex 测试：验证 CodexCLIOutputAdaptor 生成的 codex 文件。
//!
//! **前提**：项目已配置，codex 插件已启用（plugins.codex = true）。

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

fn expected_installed_skill_names(
  aindex_skills_dir: &std::path::Path,
) -> std::collections::HashSet<String> {
  let mut names = std::collections::HashSet::new();

  for entry in std::fs::read_dir(aindex_skills_dir).unwrap().flatten() {
    if !entry.file_type().map(|file_type| file_type.is_dir()).unwrap_or(false) {
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

/// Verify that install generates the global ~/.codex/AGENTS.md with non-empty content.
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
  assert!(
    !content.is_empty(),
    "~/.codex/AGENTS.md should not be empty"
  );
}

/// Verify that the global ~/.codex/AGENTS.md content exactly matches the aindex
/// `global.mdx` source.
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

/// Verify that install creates the ~/.codex/prompts/ directory.
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

/// Verify that prompt files in ~/.codex/prompts/ are all .md files with correct format
/// (kebab-case fields like argument-hint, not camelCase argumentHint).
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

  // Verify all files are .md with correct codex prompts format
  for file in &prompt_files {
    let name = file.file_name();
    let name_str = name.to_string_lossy();
    assert!(
      name_str.ends_with(".md"),
      "every file in ~/.codex/prompts must be .md, got: {}",
      name_str
    );
    let content = std::fs::read_to_string(file.path()).unwrap();

    // If file has front matter, validate it
    if content.starts_with("---\n") {
      // Codex prompts use kebab-case for field names (e.g., argument-hint, not argumentHint)
      if content.contains("argument") {
        assert!(
          !content.contains("argumentHint:"),
          "prompt file {} should use 'argument-hint' (kebab-case), not 'argumentHint' (camelCase)",
          name_str
        );
      }
    }
  }
}

/// Verify that codex prompt files do NOT contain a `command:` field (compatibility issue)
/// and that all YAML values are enclosed in double quotes.
#[test]
fn local_codex_prompts_no_command_field_and_quoted_values() {
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

  for file in &prompt_files {
    let name = file.file_name();
    let name_str = name.to_string_lossy();
    let content = std::fs::read_to_string(file.path()).unwrap();

    // Extract front matter between --- markers
    let fm_end = content.find("\n---\n").unwrap_or(content.len());
    let front_matter = &content[..fm_end];

    // 1. Codex prompts must NOT contain "command" field (compatibility issue)
    assert!(
      !front_matter.contains("command:"),
      "prompt file {} must NOT contain 'command:' field (codex compatibility issue), got:\n{}",
      name_str,
      front_matter
    );

    // 2. All YAML field values must be enclosed in double quotes
    // In codex prompts, only "description" and "argument-hint" fields are valid
    for line in front_matter.lines() {
      if let Some(pos) = line.find(": ") {
        let key = &line[..pos];
        let value = &line[pos + 2..];

        // Only check known codex prompt fields
        let key_trimmed = key.trim();
        if key_trimmed != "description" && key_trimmed != "argument-hint" {
          continue;
        }

        // Skip empty values
        if value.trim().is_empty() {
          continue;
        }

        // Check that value is enclosed in double quotes
        let trimmed = value.trim();
        assert!(
          trimmed.starts_with('"') && trimmed.ends_with('"'),
          "prompt file {} has unquoted value '{}' in line '{}' (all codex prompt values must be quoted)",
          name_str,
          value,
          line
        );
      }
    }
  }
}

/// Verify that install creates the project-level .codex/ directory.
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

/// Verify that the project .codex/skills/ directory names exactly match the transformed
/// aindex/skills/ names (same count, same names).
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
  let aindex_dir = runner
    .resolve_aindex_dir()
    .expect("aindex dir should exist");
  let aindex_skills_dir = aindex_dir.join("skills");
  let project_skills_dir = runner.cwd().join(".codex").join("skills");
  let expected_names = expected_installed_skill_names(&aindex_skills_dir);
  let project_names: std::collections::HashSet<String> = std::fs::read_dir(&project_skills_dir)
    .unwrap()
    .flatten()
    .filter(|entry| entry.file_type().map(|file_type| file_type.is_dir()).unwrap_or(false))
    .map(|entry| entry.file_name().to_string_lossy().to_string())
    .collect();

  assert_eq!(
    expected_names.len(),
    project_names.len(),
    "project .codex/skills should have same count as aindex/skills"
  );

  assert_eq!(
    expected_names, project_names,
    "project .codex/skills directory names should match transformed aindex/skills names"
  );
}

/// Verify that global ~/.codex/agents/*.toml files are also present in the project
/// .codex/agents/ directory with matching filenames.
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

/// Verify that all files in the project .codex/agents/ directory are .toml files with
/// the expected `name` and `developer_instructions` fields.
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

/// Verify that `tnmsc clean` removes the generated .codex/ directory.
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

/// Verify that `tnmsc dry-run` does NOT create the .codex/ directory.
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
  let skill_dir = aindex_dir.join("skills").join("browser").join("agent-browser");

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
        "warp": false,
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

  let install = runner.run_at_with_env(
    &workspace_dir,
    &["install"],
    &[("HOME", &temp_home_str)],
  );
  install.assert_success("isolated tnmsc install");

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
      browser_skill_dir.join("references").join("linux-wsl.md").is_file(),
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
      !browser_skill_dir.join("references").join("linux-wsl.mdx").exists(),
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
  assert!(stale_file.is_file(), "stale test file should exist before clean");

  let clean = runner.run_at_with_env(&workspace_dir, &["clean"], &[("HOME", &temp_home_str)]);
  clean.assert_success("isolated tnmsc clean");

  assert!(
    !workspace_dir.join(".codex").exists(),
    "clean should remove the entire generated .codex tree"
  );
  assert!(
    !workspace_dir.join(".opencode").exists(),
    "clean should remove the entire generated .opencode tree"
  );
}
