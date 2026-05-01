//! 本地裸机 install 测试：直接在真实项目上运行 tnmsc install。
//!
//! **前提**：
//! - 当前目录或其祖先目录已配置 `.tnmsc.json`
//! - `aindex/` 目录已存在且有内容
//! - **测试不会创建任何文件或目录**，缺少配置则直接失败

use tnmsc_local_tests::LocalTestRunner;

/// Verify that `tnmsc install` generates both project-level CLAUDE.md and global
/// ~/.claude/CLAUDE.md with non-empty content.
#[test]
fn local_install_generates_project_claude_md() {
  let runner = LocalTestRunner::new();

  // 验证项目已就绪（不创建任何文件）
  runner.assert_project_ready();

  // 先 clean 确保干净状态
  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  // 执行 install
  let install = runner.install();
  install.assert_success("tnmsc install");

  // 验证 ~/workspace/memory-sync/CLAUDE.md 已生成
  assert!(
    runner.file_exists("CLAUDE.md"),
    "~/workspace/memory-sync/CLAUDE.md should be generated after install"
  );

  // 验证文件非空
  let content = runner
    .read_file("CLAUDE.md")
    .expect("CLAUDE.md should be readable");
  assert!(
    !content.is_empty(),
    "CLAUDE.md should not be empty.\nstdout:\n{}\nstderr:\n{}",
    install.stdout,
    install.stderr
  );

  // 验证 ~/.claude/CLAUDE.md 已生成
  assert!(
    runner.claude_global_file_exists(),
    "~/.claude/CLAUDE.md should be generated after install"
  );
}

/// Verify that running `tnmsc install` twice in a row produces identical output.
/// Install must be safely repeatable without side effects.
#[test]
fn local_install_idempotent() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  // 先 clean 确保干净状态
  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  // 第一次 install
  let first = runner.install();
  first.assert_success("first tnmsc install");
  assert!(
    runner.file_exists("CLAUDE.md"),
    "~/workspace/memory-sync/CLAUDE.md should exist after first install"
  );

  let content_first = runner.read_file("CLAUDE.md").unwrap();

  // 第二次 install（应该幂等）
  let second = runner.install();
  second.assert_success("second tnmsc install");

  let content_second = runner.read_file("CLAUDE.md").unwrap();
  assert_eq!(
    content_first, content_second,
    "consecutive installs should produce identical output"
  );

  // 全局文件也应存在
  assert!(
    runner.claude_global_file_exists(),
    "~/.claude/CLAUDE.md should exist after install"
  );
}

/// Verify the full .claude/ directory structure after install: agents/, skills/,
/// commands/, rules/ subdirectories, all with correctly formatted files
/// (YAML front matter, expected fields like agent:/command:/skill:/rule:).
#[test]
fn local_install_generates_claude_directory_structure() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  // 先 clean 确保干净状态
  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  // 执行 install
  let install = runner.install();
  install.assert_success("tnmsc install");

  // 验证 ~/workspace/memory-sync/.claude/ 已生成
  assert!(
    runner.dir_exists(".claude"),
    "~/workspace/memory-sync/.claude should be generated after install"
  );

  // 验证子目录存在
  for subdir in ["agents", "skills", "commands", "rules"] {
    assert!(
      runner.dir_exists(format!(".claude/{}", subdir)),
      "~/workspace/memory-sync/.claude/{} should exist after install",
      subdir
    );
  }

  // 验证 agents 目录非空且所有文件有 YAML front matter
  let agents_dir = runner.cwd().join(".claude").join("agents");
  let agent_files: Vec<_> = std::fs::read_dir(&agents_dir)
    .unwrap()
    .flatten()
    .filter(|e| e.file_type().map(|ft| ft.is_file()).unwrap_or(false))
    .collect();
  assert!(
    !agent_files.is_empty(),
    "~/workspace/memory-sync/.claude/agents should contain at least one file"
  );
  for file in &agent_files {
    let file_name = file.file_name();
    let name = file_name.to_string_lossy();
    assert!(
      name.ends_with(".md"),
      "every file in .claude/agents must be .md, got: {}",
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
  }

  // 验证 commands 目录非空且所有文件有 YAML front matter
  let commands_dir = runner.cwd().join(".claude").join("commands");
  let command_files: Vec<_> = std::fs::read_dir(&commands_dir)
    .unwrap()
    .flatten()
    .filter(|e| e.file_type().map(|ft| ft.is_file()).unwrap_or(false))
    .collect();
  assert!(
    !command_files.is_empty(),
    "~/workspace/memory-sync/.claude/commands should contain at least one file"
  );
  for file in &command_files {
    let file_name = file.file_name();
    let name = file_name.to_string_lossy();
    assert!(
      name.ends_with(".md"),
      "every file in .claude/commands must be .md, got: {}",
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
  let skills_dir = runner.cwd().join(".claude").join("skills");
  let skill_entries: Vec<_> = std::fs::read_dir(&skills_dir)
    .unwrap()
    .flatten()
    .filter(|e| e.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
    .collect();
  assert!(
    !skill_entries.is_empty(),
    "~/workspace/memory-sync/.claude/skills should contain at least one subdirectory"
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
  let rules_dir = runner.cwd().join(".claude").join("rules");

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
    "~/workspace/memory-sync/.claude/rules should contain at least one file"
  );

  for file_path in &all_files {
    let file_name = file_path.file_name().unwrap_or_default();
    let name = file_name.to_string_lossy();
    assert!(
      name.starts_with("rule-") && name.ends_with(".md"),
      "every file in .claude/rules must match 'rule-*.md' pattern, got: {}",
      name
    );

    // Validate naming: rule-<series>-<name>.md or rule-<name>.md
    // Extract the middle part(s) between "rule-" and ".md"
    let stem = &name[5..name.len() - 3]; // strip "rule-" prefix and ".md" suffix
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
  }
}

/// Verify that template interpolation in the global CLAUDE.md works correctly:
/// `{profile.username}` is replaced with `TrueNine` in both inline text and URLs.
#[test]
fn local_install_claude_global_md_url_interpolation() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  // 先 clean 确保干净状态
  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  // 执行 install
  let install = runner.install();
  install.assert_success("tnmsc install");

  // 读取 ~/.claude/CLAUDE.md
  let content = runner
    .read_claude_global_file()
    .expect("~/.claude/CLAUDE.md should be readable after install");

  // 验证 global.mdx 中的 inline expression 被替换
  // 原始: 你是 {profile.username} 的协作者
  let expr = "{profile.username}";
  assert!(
    content.contains("TrueNine"),
    "inline expression {expr} should be evaluated to 'TrueNine'\ngot:\n{content}",
  );

  // 验证链接文本中的插值被替换
  // 原始: [{profile.username}Github](...)
  assert!(
    content.contains("[TrueNineGithub]"),
    "link text interpolation should be evaluated\ngot:\n{content}",
  );

  // 验证 URL 中的插值被替换
  // 原始: (https://github.com/{profile.username})
  assert!(
    content.contains("https://github.com/TrueNine"),
    "URL interpolation should be evaluated\ngot:\n{content}",
  );

  // 反向断言：不应残留未替换的 {var} 模式
  assert!(
    !content.contains("github.com/{profile"),
    "unreplaced URL interpolation found\ngot:\n{content}",
  );
}

/// Guard test: ensure the compiled tnmsc binary exists before running other tests.
/// Provides a clear error message with build instructions if missing.
#[test]
fn binary_exists_before_tests() {
  let binary = tnmsc_local_tests::binary_path();
  assert!(
    binary.is_file(),
    "binary not found at: {}\n\nplease compile it first:\n  cargo build -p tnmsc\n",
    binary.display()
  );
}
