//! 本地裸机 CLAUDE.md 测试：验证 ClaudeCodeCLIOutputAdaptor 生成的 CLAUDE.md 文件。
//!
//! **核心设计断言**：项目级 CLAUDE.md 的内容应如同 AGENTS.md 一样，直接输出
//! 项目内存（root_memory_prompt / child_memory_prompts），而非全局内存或
//! 全局+项目混合内容。Claude Code 是专属 IDE 插件，其项目级记忆文件
//! 必须承载完整的项目上下文。
//!
//! **前提**：项目已配置，aindex 目录已存在且有内容。

use tnmsc_local_tests::LocalTestRunner;

/// Verify that install generates both the project-root CLAUDE.md and a child
/// .github/CLAUDE.md, both with non-empty content.
#[test]
fn local_claude_install_generates_project_claude_md() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  assert!(
    runner.claude_project_file_exists(),
    "~/workspace/memory-sync/CLAUDE.md should be generated after install"
  );

  let content = runner
    .read_claude_project_file()
    .expect("CLAUDE.md should be readable");
  assert!(!content.is_empty(), "CLAUDE.md should not be empty");

  assert!(
    runner.claude_child_file_exists(".github"),
    "~/workspace/memory-sync/.github/CLAUDE.md should be generated after install"
  );

  let child_content = runner
    .read_claude_child_file(".github")
    .expect(".github/CLAUDE.md should be readable");
  assert!(
    !child_content.is_empty(),
    ".github/CLAUDE.md should not be empty"
  );
}

/// Verify that the generated project CLAUDE.md content exactly matches the aindex
/// source file `app/memory-sync/agt.mdx`. Ensures no content drift.
#[test]
fn local_claude_project_content_matches_aindex_source() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  let aindex_content = runner
    .read_aindex_file("app/memory-sync/agt.mdx")
    .expect("aindex source agt.mdx should be readable");

  let generated_content = runner
    .read_claude_project_file()
    .expect("CLAUDE.md should be readable after install");

  assert_eq!(
    aindex_content.trim(),
    generated_content.trim(),
    "generated CLAUDE.md should match aindex source agt.mdx"
  );
}

/// Verify that the generated .github/CLAUDE.md content exactly matches the aindex
/// source `app/memory-sync/.github/agt.mdx`.
#[test]
fn local_claude_child_content_matches_aindex_source() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  let aindex_child_content = runner
    .read_aindex_file("app/memory-sync/.github/agt.mdx")
    .expect("aindex source .github/agt.mdx should be readable");

  let generated_child_content = runner
    .read_claude_child_file(".github")
    .expect(".github/CLAUDE.md should be readable after install");

  assert_eq!(
    aindex_child_content.trim(),
    generated_child_content.trim(),
    "generated .github/CLAUDE.md should match aindex source .github/agt.mdx"
  );
}

/// Verify that `tnmsc clean` removes ALL CLAUDE.md files recursively throughout
/// the project tree, not just the root one.
#[test]
fn local_claude_clean_removes_all_project_files() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install before clean");

  assert!(
    runner.claude_project_file_exists(),
    "CLAUDE.md should exist after install"
  );

  let clean = runner.clean();
  clean.assert_success("tnmsc clean");

  assert!(
    !runner.claude_project_file_exists(),
    "CLAUDE.md should be removed after clean"
  );

  // 递归检查：项目内不应残留任何 CLAUDE.md
  fn collect_claude_md_files(dir: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut files = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
      return files;
    };
    for entry in entries.flatten() {
      let path = entry.path();
      let Ok(ft) = entry.file_type() else { continue };
      if ft.is_dir() {
        // 跳过 .git、node_modules、target 等
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

  let remaining = collect_claude_md_files(runner.cwd());
  assert!(
    remaining.is_empty(),
    "clean should remove ALL project CLAUDE.md files, found:\n{}",
    remaining
      .iter()
      .map(|p| format!("  - {}", p.display()))
      .collect::<Vec<_>>()
      .join("\n")
  );
}

/// Verify that the global ~/.claude/CLAUDE.md is generated (it persists independently
/// of project-level clean).
#[test]
fn local_claude_global_file_still_generated() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  assert!(
    runner.claude_global_file_exists(),
    "global ~/.claude/CLAUDE.md should be generated after install"
  );

  let content = runner
    .read_claude_global_file()
    .expect("global CLAUDE.md should be readable");
  assert!(!content.is_empty(), "global CLAUDE.md should not be empty");
}

/// Isolated regression test for categorized skills in Claude output.
/// Verifies that:
/// 1. `name` in SKILL.md matches the generated directory name
/// 2. child docs are compiled and emitted as `.md`, not `.mdx`
/// 3. clean removes the generated project tree
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
        "warp": false,
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

  let install = runner.run_at_with_env(
    &workspace_dir,
    &["install"],
    &[("HOME", &temp_home_str)],
  );
  install.assert_failure("isolated tnmsc install for claude should be blocked by protected root CLAUDE.md");
  assert!(
    install.stderr.contains("Refusing to write protected path.")
      || install.stderr.contains("CLAUDE.md: Refusing to write protected path."),
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
