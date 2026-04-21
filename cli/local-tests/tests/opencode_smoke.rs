//! 本地裸机 opencode 测试：验证 tnmsc install 生成的 opencode 文件。
//!
//! **前提**：项目已配置，opencode 插件已启用。

use tnmsc_local_tests::LocalTestRunner;

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
      content.contains("mode: subagnet") || content.contains("mode: \"subagnet\""),
      "agent file {} should contain mode: \"subagnet\" in front matter",
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

/// 断言生成的 .opencode/agents/*.md 中不包含 `model` 字段。
///
/// NOTE: `model` 是未来功能（per-agent model override），当前不实现，
/// 因此生成时必须将其剥离。此测试在功能落地前充当回归保护。
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
      content.contains("mode: subagnet") || content.contains("mode: \"subagnet\""),
      "agent file {} must include mode: \"subagnet\" in YAML front matter",
      file.file_name().to_string_lossy()
    );
  }
}

/// 回归测试：opencode agent 的 `color` 字段必须匹配 hex 格式 `^#[0-9a-fA-F]{6}$`。
///
/// opencode 配置 schema 要求 color 为 6 位 hex 值（如 `#FF5733`），
/// 不接受 CSS 命名颜色（如 `blue`、`red`）。
/// 参见: https://github.com/opencode-ai/opencode 配置 schema 中 color 字段的 pattern 约束。
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
        if !color_value.is_empty() && !color_value.starts_with(' ') && !color_value.starts_with('\t') {
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

/// 回归测试：opencode 不应在任何子目录下生成嵌套的 .opencode/AGENTS.md。
///
/// opencode 只支持两个位置的 AGENTS.md：
///   1. 全局 ~/.config/opencode/AGENTS.md
///   2. 项目根目录 <project>/.opencode/AGENTS.md
///
/// 子目录（如 cli/.opencode/AGENTS.md）属于严重错误，会导致 opencode 行为异常。
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
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
      let path = entry.path();
      let Ok(ft) = entry.file_type() else { continue };
      if ft.is_dir() {
        // 跳过 .git、node_modules、target 等
        if let Some(name) = path.file_name() {
          let name = name.to_string_lossy();
          if name.starts_with('.')
            && name != ".opencode"
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
