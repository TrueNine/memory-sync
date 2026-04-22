//! 验证 `tnmsc clean` 命令: 递归删除空项目目录和孤立的 Agent 文件 (无对应 agt.mdx 的 AGENTS.md/CLAUDE.md)。
//!
//! **断言**:
//! - 工作区下的空项目目录被移除 (递归清理)
//! - 无对应 agt.mdx 时,孤立的 AGENTS.md 和 CLAUDE.md 被删除 (孤立文件清理)

use tnmsc_integrate_tests::install_packaged_cli_container;

#[test]
fn clean_keeps_empty_project_directories_without_generated_outputs() {
  let container = install_packaged_cli_container().unwrap();

  container
    .setup()
    .mkdir_p("/workspace/demo/project-a/subdir/empty")
    .mkdir_p("/workspace/demo/project-b")
    .mkdir_p("/workspace/demo/project-c/nested/empty")
    .mkdir_p("/root/.aindex")
    .write_file(
      "/root/.aindex/.tnmsc.json",
      r#"{
  "workspaceDir": "/workspace/demo",
  "plugins": {}
}"#,
    )
    .exec("setup clean test workspace");

  let ls_before = container.exec("ls -la /workspace/demo");
  ls_before.assert_success("list directories before clean");
  assert!(ls_before.stdout.contains("project-a"));
  assert!(ls_before.stdout.contains("project-b"));
  assert!(ls_before.stdout.contains("project-c"));

  let clean = container.exec("cd /workspace/demo && tnmsc clean");
  clean.assert_success("tnmsc clean");

  let check_empty = container.exec("find /workspace/demo -type d -empty | sort");
  check_empty.assert_success("find empty directories after clean");
  assert!(
    check_empty.stdout.contains("/workspace/demo/project-a"),
    "empty project-a should remain when there are no generated outputs.\nstdout:\n{}",
    check_empty.stdout
  );
  assert!(
    check_empty.stdout.contains("/workspace/demo/project-b"),
    "empty project-b should remain when there are no generated outputs.\nstdout:\n{}",
    check_empty.stdout
  );
  assert!(
    check_empty.stdout.contains("/workspace/demo/project-c"),
    "empty project-c should remain when there are no generated outputs.\nstdout:\n{}",
    check_empty.stdout
  );
}

#[test]
fn clean_removes_stale_agents_and_claude_files() {
  let container = install_packaged_cli_container().unwrap();

  container
    .setup()
    .mkdir_p("/workspace/demo/project-a")
    .mkdir_p("/workspace/demo/project-b")
    .mkdir_p("/root/.aindex")
    .write_file(
      "/root/.aindex/.tnmsc.json",
      r#"{
  "workspaceDir": "/workspace/demo",
  "plugins": {}
}"#,
    )
    .write_file("/workspace/demo/project-a/AGENTS.md", "Stale agents file")
    .write_file("/workspace/demo/project-a/CLAUDE.md", "Stale claude file")
    .write_file(
      "/workspace/demo/project-b/AGENTS.md",
      "Another stale agents file",
    )
    .exec("setup clean stale files workspace");

  let cat_agents_a = container.cat_success("/workspace/demo/project-a/AGENTS.md");
  assert!(cat_agents_a.stdout.contains("Stale agents file"));

  let cat_claude_a = container.cat_success("/workspace/demo/project-a/CLAUDE.md");
  assert!(cat_claude_a.stdout.contains("Stale claude file"));

  let cat_agents_b = container.cat_success("/workspace/demo/project-b/AGENTS.md");
  assert!(cat_agents_b.stdout.contains("Another stale agents file"));

  let clean = container.exec("cd /workspace/demo && tnmsc clean");
  clean.assert_success("tnmsc clean");

  let ls_project_a = container.exec("ls -la /workspace/demo/project-a");
  ls_project_a.assert_success("list project-a after clean");
  assert!(!ls_project_a.stdout.contains("AGENTS.md"));
  assert!(!ls_project_a.stdout.contains("CLAUDE.md"));

  let ls_project_b = container.exec("ls -la /workspace/demo/project-b");
  ls_project_b.assert_success("list project-b after clean");
  assert!(!ls_project_b.stdout.contains("AGENTS.md"));
}
