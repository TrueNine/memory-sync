//! 本地裸机 CLAUDE.md 测试：验证 ClaudeCodeCLIOutputAdaptor 生成的 CLAUDE.md 文件。
//!
//! **核心设计断言**：项目级 CLAUDE.md 的内容应如同 AGENTS.md 一样，直接输出
//! 项目内存（root_memory_prompt / child_memory_prompts），而非全局内存或
//! 全局+项目混合内容。Claude Code 是专属 IDE 插件，其项目级记忆文件
//! 必须承载完整的项目上下文。
//!
//! **前提**：项目已配置，aindex 目录已存在且有内容。

use tnmsc_local_tests::LocalTestRunner;

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

#[test]
fn local_claude_clean_removes_all_project_files() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

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
    let Ok(entries) = std::fs::read_dir(dir) else { return files };
    for entry in entries.flatten() {
      let path = entry.path();
      let Ok(ft) = entry.file_type() else { continue };
      if ft.is_dir() {
        // 跳过 .git、node_modules、target 等
        if let Some(name) = path.file_name() {
          let name = name.to_string_lossy();
          if name.starts_with('.')
            && name != ".github"
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
  assert!(
    !content.is_empty(),
    "global CLAUDE.md should not be empty"
  );
}
