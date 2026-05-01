//! 本地裸机 opencode 测试：验证 tnmsc install 生成的 opencode 文件。
//!
//! **前提**：项目已配置，opencode 插件已启用。

use tnmsc_local_tests::LocalTestRunner;

/// Comprehensive verification of the .opencode/ directory after install: AGENTS.md
/// exists, and agents/, skills/, commands/, rules/ subdirectories all contain correctly
/// formatted files with YAML front matter and expected source identifiers.
#[test]
fn local_opencode_install_generates_project_agents_md() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  assert!(
    runner.opencode_project_file_exists(),
    "~/workspace/memory-sync/.opencode/AGENTS.md should be generated after install"
  );

  let content = runner
    .read_file(".opencode/AGENTS.md")
    .expect(".opencode/AGENTS.md should be readable");
  assert!(
    !content.is_empty(),
    ".opencode/AGENTS.md should not be empty"
  );

  // 验证子目录存在
  for subdir in ["agents", "skills", "commands", "rules"] {
    assert!(
      runner.dir_exists(format!(".opencode/{}", subdir)),
      "~/workspace/memory-sync/.opencode/{} should exist after install",
      subdir
    );
  }

  // 验证 agents 目录非空且所有文件有 YAML front matter
  let agents_dir = runner.cwd().join(".opencode").join("agents");
  let agent_files: Vec<_> = std::fs::read_dir(&agents_dir)
    .unwrap()
    .flatten()
    .filter(|e| e.file_type().map(|ft| ft.is_file()).unwrap_or(false))
    .collect();
  assert!(
    !agent_files.is_empty(),
    "~/workspace/memory-sync/.opencode/agents should contain at least one file"
  );
  for file in &agent_files {
    let file_name = file.file_name();
    let name = file_name.to_string_lossy();
    assert!(
      name.ends_with(".md"),
      "every file in .opencode/agents must be .md, got: {}",
      name
    );
    let content = std::fs::read_to_string(file.path()).unwrap();
    assert!(
      content.starts_with("---\n"),
      "agent file {} should start with YAML front matter '---'",
      name
    );
    assert!(
      content.contains("agent:"),
      "agent file {} should contain 'agent:' source identifier",
      name
    );
    assert!(
      content.contains("mode: subagent") || content.contains("mode: \"subagent\""),
      "agent file {} should contain mode: \"subagent\" in front matter",
      name
    );
  }

  // 验证 commands 目录非空且所有文件有 YAML front matter
  let commands_dir = runner.cwd().join(".opencode").join("commands");
  let command_files: Vec<_> = std::fs::read_dir(&commands_dir)
    .unwrap()
    .flatten()
    .filter(|e| e.file_type().map(|ft| ft.is_file()).unwrap_or(false))
    .collect();
  assert!(
    !command_files.is_empty(),
    "~/workspace/memory-sync/.opencode/commands should contain at least one file"
  );
  for file in &command_files {
    let file_name = file.file_name();
    let name = file_name.to_string_lossy();
    assert!(
      name.ends_with(".md"),
      "every file in .opencode/commands must be .md, got: {}",
      name
    );
    let content = std::fs::read_to_string(file.path()).unwrap();
    assert!(
      content.starts_with("---\n"),
      "command file {} should start with YAML front matter '---'",
      name
    );
    assert!(
      content.contains("command:"),
      "command file {} should contain 'command:' source identifier",
      name
    );
  }

  // 验证 skills 目录：每个 skill 是子目录，包含 SKILL.md
  let skills_dir = runner.cwd().join(".opencode").join("skills");
  let skill_entries: Vec<_> = std::fs::read_dir(&skills_dir)
    .unwrap()
    .flatten()
    .filter(|e| e.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
    .collect();
  assert!(
    !skill_entries.is_empty(),
    "~/workspace/memory-sync/.opencode/skills should contain at least one subdirectory"
  );
  for entry in &skill_entries {
    let skill_name = entry.file_name();
    let name = skill_name.to_string_lossy();
    let skill_md_path = entry.path().join("SKILL.md");
    assert!(
      skill_md_path.is_file(),
      "skill directory {} should contain SKILL.md",
      name
    );
    let content = std::fs::read_to_string(&skill_md_path).unwrap();
    assert!(
      content.starts_with("---\n"),
      "SKILL.md in {} should start with YAML front matter '---'",
      name
    );
    assert!(
      content.contains("skill:"),
      "SKILL.md in {} should contain 'skill:' source identifier",
      name
    );
  }

  // 验证规则文件：递归遍历，所有文件必须以 rule- 前缀开头且符合命名规范
  let rules_dir = runner.cwd().join(".opencode").join("rules");

  fn collect_rule_files(dir: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
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

  let all_files = collect_rule_files(&rules_dir);
  assert!(
    !all_files.is_empty(),
    "~/workspace/memory-sync/.opencode/rules should contain at least one file"
  );

  for file_path in &all_files {
    let file_name = file_path.file_name().unwrap_or_default();
    let name = file_name.to_string_lossy();
    assert!(
      name.starts_with("rule-") && name.ends_with(".md"),
      "every file in .opencode/rules must match 'rule-*.md' pattern, got: {}",
      name
    );

    let stem = &name[5..name.len() - 3];
    assert!(
      !stem.is_empty() && !stem.contains('.'),
      "rule file name stem must not be empty and must not contain dots, got: {}",
      name
    );

    let content = std::fs::read_to_string(file_path).unwrap();
    assert!(
      content.starts_with("---\n"),
      "rule file {} should start with YAML front matter '---'",
      name
    );
    assert!(
      content.contains("rule:"),
      "rule file {} should contain 'rule:' source identifier",
      name
    );

    // 验证 front matter 使用 paths 而不是 globs
    assert!(
      !content.contains("\nglobs:\n"),
      "rule file {} must NOT contain 'globs:' field; use 'paths:' instead",
      name
    );
    assert!(
      content.contains("\npaths:\n"),
      "rule file {} must contain 'paths:' field",
      name
    );
  }
}

/// Verify that the global ~/.config/opencode/AGENTS.md is generated with non-empty content.
#[test]
fn local_opencode_install_generates_global_agents_md() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  assert!(
    runner.opencode_global_file_exists(),
    "~/.config/opencode/AGENTS.md should be generated after install"
  );

  let content = runner
    .read_opencode_global_file()
    .expect("~/.config/opencode/AGENTS.md should be readable after install");
  assert!(
    !content.is_empty(),
    "~/.config/opencode/AGENTS.md should not be empty"
  );
}

/// Verify that two consecutive installs produce identical .opencode/AGENTS.md content.
#[test]
fn local_opencode_install_idempotent() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let first = runner.install();
  first.assert_success("first tnmsc install");
  assert!(
    runner.opencode_project_file_exists(),
    ".opencode/AGENTS.md should exist after first install"
  );

  let content_first = runner.read_file(".opencode/AGENTS.md").unwrap();

  let second = runner.install();
  second.assert_success("second tnmsc install");

  let content_second = runner.read_file(".opencode/AGENTS.md").unwrap();
  assert_eq!(
    content_first, content_second,
    "consecutive installs should produce identical .opencode/AGENTS.md"
  );

  assert!(
    runner.opencode_global_file_exists(),
    "~/.config/opencode/AGENTS.md should exist after install"
  );
}

/// Verify that `tnmsc clean` removes the generated .opencode/ directory.
#[test]
fn local_opencode_clean_removes_files() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let install = runner.install();
  install.assert_success("tnmsc install before clean");
  assert!(
    runner.opencode_project_file_exists(),
    ".opencode/AGENTS.md should exist after install"
  );

  let clean = runner.clean();
  clean.assert_success("tnmsc clean");

  assert!(
    !runner.opencode_project_file_exists(),
    ".opencode/AGENTS.md should be removed after clean"
  );
}

/// Verify that `tnmsc dry-run` does NOT create .opencode/AGENTS.md.
#[test]
fn local_opencode_dry_run_does_not_write() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before dry-run");

  assert!(
    !runner.opencode_project_file_exists(),
    ".opencode/AGENTS.md should not exist before dry-run"
  );

  let dry = runner.dry_run();
  dry.assert_success("tnmsc dry-run");

  assert!(
    !runner.opencode_project_file_exists(),
    ".opencode/AGENTS.md should not be created by dry-run"
  );
}

/// Verify that `{profile.username}` template interpolation works in the global opencode
/// AGENTS.md — both inline text and URLs are correctly evaluated.
#[test]
fn local_opencode_global_md_url_interpolation() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  let content = runner
    .read_opencode_global_file()
    .expect("~/.config/opencode/AGENTS.md should be readable after install");

  assert!(
    content.contains("TrueNine"),
    "inline expression should be evaluated to 'TrueNine'\ngot:\n{content}",
  );

  assert!(
    content.contains("[TrueNineGithub]"),
    "link text interpolation should be evaluated\ngot:\n{content}",
  );

  assert!(
    content.contains("https://github.com/TrueNine"),
    "URL interpolation should be evaluated\ngot:\n{content}",
  );

  assert!(
    !content.contains("github.com/{profile"),
    "unreplaced URL interpolation found\ngot:\n{content}",
  );
}

/// Verify that the project-level .opencode/AGENTS.md includes global memory content
/// (is at least as long as the global file and contains workspace-level data like 'TrueNine').
#[test]
fn local_opencode_project_content_includes_workspace_memory() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  let project_content = runner
    .read_file(".opencode/AGENTS.md")
    .expect(".opencode/AGENTS.md should be readable");

  let global_content = runner
    .read_opencode_global_file()
    .expect("~/.config/opencode/AGENTS.md should be readable");

  assert!(
    project_content.len() >= global_content.len(),
    "project .opencode/AGENTS.md should be at least as long as global content"
  );

  assert!(
    project_content.contains("TrueNine"),
    "project .opencode/AGENTS.md should contain global memory content"
  );
}

/// Regression guard: generated agent .md files must NOT contain a `model:` field.
/// Per-agent model override is a future feature — premature inclusion would break
/// opencode schema validation.
#[test]
fn local_opencode_agent_md_should_not_contain_model_field() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  let agents_dir = runner.cwd().join(".opencode").join("agents");
  let agent_files: Vec<_> = std::fs::read_dir(&agents_dir)
    .unwrap()
    .flatten()
    .filter(|e| e.file_type().map(|ft| ft.is_file()).unwrap_or(false))
    .collect();

  assert!(
    !agent_files.is_empty(),
    ".opencode/agents should contain at least one file"
  );

  for file in &agent_files {
    let content = std::fs::read_to_string(file.path()).unwrap();
    assert!(
      !content.contains("\nmodel:"),
      "agent file {} must NOT contain 'model:' field (future feature, not yet implemented)",
      file.file_name().to_string_lossy()
    );
  }
}

/// Verify that every generated agent file contains `mode: subagent` (or `mode: "subagent"`)
/// in its YAML front matter. Subagent mode is the expected default for memory-sync agents.
#[test]
fn local_opencode_agent_md_must_include_subagent_mode() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  let agents_dir = runner.cwd().join(".opencode").join("agents");
  let agent_files: Vec<_> = std::fs::read_dir(&agents_dir)
    .unwrap()
    .flatten()
    .filter(|e| e.file_type().map(|ft| ft.is_file()).unwrap_or(false))
    .collect();

  assert!(
    !agent_files.is_empty(),
    ".opencode/agents should contain at least one file"
  );

  for file in &agent_files {
    let content = std::fs::read_to_string(file.path()).unwrap();
    assert!(
      content.contains("mode: subagent") || content.contains("mode: \"subagent\""),
      "agent file {} must include mode: \"subagent\" in YAML front matter",
      file.file_name().to_string_lossy()
    );
  }
}

/// Regression guard: the `color` field in agent files must be a 6-digit hex value (#RRGGBB).
/// opencode's config schema rejects CSS named colors like `blue` or `red`.
/// See: https://github.com/opencode-ai/opencode config schema pattern constraint.
#[test]
fn local_opencode_agent_md_color_must_be_hex_format() {
  fn is_valid_hex_color(s: &str) -> bool {
    if s.len() != 7 {
      return false;
    }
    let bytes = s.as_bytes();
    if bytes[0] != b'#' {
      return false;
    }
    bytes[1..].iter().all(|&b| b.is_ascii_hexdigit())
  }

  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  let agents_dir = runner.cwd().join(".opencode").join("agents");
  let agent_files: Vec<_> = std::fs::read_dir(&agents_dir)
    .unwrap()
    .flatten()
    .filter(|e| e.file_type().map(|ft| ft.is_file()).unwrap_or(false))
    .collect();

  assert!(
    !agent_files.is_empty(),
    ".opencode/agents should contain at least one file"
  );

  for file in &agent_files {
    let content = std::fs::read_to_string(file.path()).unwrap();
    let file_name = file.file_name().to_string_lossy().to_string();

    for line in content.lines() {
      let trimmed = line.trim();
      if let Some(color_value) = trimmed.strip_prefix("color:") {
        if !color_value.is_empty()
          && !color_value.starts_with(' ')
          && !color_value.starts_with('\t')
        {
          continue;
        }
        let color_value = color_value.trim().trim_matches('"').trim_matches('\'');
        assert!(
          is_valid_hex_color(color_value),
          "agent file {} has invalid color '{}': must match hex pattern #RRGGBB (e.g. #0000FF), \
           CSS named colors (e.g. blue, red) are not accepted by opencode schema",
          file_name,
          color_value
        );
      }
    }
  }
}

/// Regression guard: opencode only supports AGENTS.md at the project root .opencode/ —
/// no nested subdirectory .opencode/AGENTS.md files should be generated.
/// Nested files cause opencode to behave incorrectly.
#[test]
fn local_opencode_no_nested_agents_md() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  // 收集 cwd 下所有 .opencode/AGENTS.md 文件路径
  let mut nested_agents = Vec::new();
  fn collect_opencode_agents(dir: &std::path::Path, nested: &mut Vec<std::path::PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
      return;
    };
    for entry in entries.flatten() {
      let path = entry.path();
      let Ok(ft) = entry.file_type() else { continue };
      if ft.is_dir() {
        // 跳过 .git、node_modules、target 等
        if let Some(name) = path.file_name() {
          let name = name.to_string_lossy();
          if name.starts_with('.') && name != ".opencode"
            || name == "node_modules"
            || name == "target"
            || name == "dist"
            || name == "out"
          {
            continue;
          }
        }
        if path.join(".opencode").join("AGENTS.md").is_file() {
          nested.push(path.join(".opencode").join("AGENTS.md"));
        }
        collect_opencode_agents(&path, nested);
      }
    }
  }

  collect_opencode_agents(runner.cwd(), &mut nested_agents);

  let root_agents = runner.cwd().join(".opencode").join("AGENTS.md");
  let unexpected: Vec<_> = nested_agents
    .into_iter()
    .filter(|p| *p != root_agents)
    .collect();

  assert!(
    unexpected.is_empty(),
    "opencode must NOT generate nested .opencode/AGENTS.md files.\nunexpected paths:\n{}",
    unexpected
      .iter()
      .map(|p| format!("  - {}", p.display()))
      .collect::<Vec<_>>()
      .join("\n")
  );
}

/// Isolated regression test for categorized skills with nested child docs.
/// Verifies that:
/// 1. `name` in SKILL.md matches the generated directory name
/// 2. child docs are compiled and emitted as `.md`, not `.mdx`
/// 3. clean removes the generated project tree
#[test]
fn regression_isolated_opencode_skill_name_and_child_doc_extensions() {
  let runner = LocalTestRunner::new();

  let temp_root = std::env::temp_dir().join(format!(
    "tnmsc-local-opencode-reverse-{}-{}",
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
        "warp": false,
        "windsurf": false,
        "codex": false,
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

  let install = runner.run_at_with_env(
    &workspace_dir,
    &["install"],
    &[("HOME", &temp_home_str)],
  );
  install.assert_success("isolated tnmsc install for opencode");

  let generated_skill_dir = workspace_dir
    .join(".opencode")
    .join("skills")
    .join("dev-tools-reverse-engineering");
  assert!(
    generated_skill_dir.join("SKILL.md").is_file(),
    "opencode should generate SKILL.md for dev-tools-reverse-engineering"
  );
  assert!(
    generated_skill_dir.join("packet-capture.md").is_file(),
    "opencode should emit packet-capture child doc as .md"
  );
  assert!(
    generated_skill_dir.join("reverse-tools.md").is_file(),
    "opencode should emit reverse-tools child doc as .md"
  );
  assert!(
    !generated_skill_dir.join("packet-capture.mdx").exists(),
    "opencode must not emit packet-capture child doc as .mdx"
  );
  assert!(
    !generated_skill_dir.join("reverse-tools.mdx").exists(),
    "opencode must not emit reverse-tools child doc as .mdx"
  );

  let skill_content = std::fs::read_to_string(generated_skill_dir.join("SKILL.md")).unwrap();
  assert!(
    skill_content.contains("name: dev-tools-reverse-engineering"),
    "opencode SKILL.md name field must match generated directory name"
  );
  assert!(
    skill_content.contains("skill: aindex/skills/dev-tools/reverse-engineering"),
    "opencode SKILL.md should keep the categorized source identifier"
  );

  let clean = runner.run_at_with_env(&workspace_dir, &["clean"], &[("HOME", &temp_home_str)]);
  clean.assert_success("isolated tnmsc clean for opencode");

  assert!(
    !workspace_dir.join(".opencode").exists(),
    "clean should remove the generated .opencode tree"
  );
}
