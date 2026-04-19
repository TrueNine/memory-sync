//! 本地裸机 clean 测试：验证 tnmsc clean 在真实项目上的行为。
//!
//! **前提**：项目已配置，且 install 后存在生成的文件。

use tnmsc_local_tests::LocalTestRunner;

#[test]
fn local_clean_removes_project_claude_md() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  // 先 install 生成文件
  let install = runner.install();
  install.assert_success("tnmsc install before clean");
  assert!(
    runner.file_exists("CLAUDE.md"),
    "~/workspace/memory-sync/CLAUDE.md should exist after install"
  );

  // clean 删除生成的文件
  let clean = runner.clean();
  clean.assert_success("tnmsc clean");

  assert!(
    !runner.file_exists("CLAUDE.md"),
    "~/workspace/memory-sync/CLAUDE.md should be removed after clean"
  );
}

#[test]
fn local_clean_dry_run_does_not_remove_files() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  // 先 install 生成文件
  let install = runner.install();
  install.assert_success("tnmsc install before dry-run clean");
  assert!(runner.file_exists("CLAUDE.md"));

  // dry-run clean 不应删除文件
  let dry_clean = runner.run(&["clean", "--dry-run"]);
  dry_clean.assert_success("tnmsc clean --dry-run");

  assert!(
    runner.file_exists("CLAUDE.md"),
    "CLAUDE.md should still exist after dry-run clean"
  );
}
