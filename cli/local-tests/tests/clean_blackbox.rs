//! 本地裸机 clean 测试：验证 tnmsc clean 在真实项目上的行为。
//!
//! **前提**：项目已配置，且 install 后存在生成的文件。

use std::path::PathBuf;

use tnmsc_local_tests::LocalTestRunner;

fn workspace_paths() -> (PathBuf, PathBuf, PathBuf, PathBuf) {
  let home = tnmsc_local_tests::home_dir();
  let workspace = home.join("workspace");
  (
    home,
    workspace.join("memory-sync"),
    workspace.join("aindex"),
    workspace.join("knowladge"),
  )
}

#[test]
fn local_clean_removes_project_claude_md() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  // 先 clean 再 install 确保可复现
  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

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

  // 先 clean 再 install 确保可复现
  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

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

#[test]
fn local_clean_from_memory_sync_does_not_clean_other_projects() {
  let (home, memory_sync, aindex, knowladge) = workspace_paths();

  // 使用单个 runner，通过 run_at 在不同目录执行命令，保持锁不释放
  let runner = LocalTestRunner::with_cwd(&memory_sync);
  runner.assert_project_ready();

  // 从 home 全局清理，确保干净状态
  runner
    .run_at(&home, &["clean"])
    .assert_success("clean from home before test");

  // install 生成文件
  runner.install().assert_success("install before clean");

  // 手动创建 aindex/AGENTS.md（aindex 不是 project root，install 不会生成）
  std::fs::write(aindex.join("AGENTS.md"), "# Test AGENTS.md\n")
    .expect("should write aindex AGENTS.md");

  // 验证所有文件都存在
  assert!(
    runner.file_exists("AGENTS.md"),
    "memory-sync/AGENTS.md should exist after install"
  );
  assert!(
    runner.file_exists_at(knowladge.join("AGENTS.md")),
    "knowladge/AGENTS.md should exist after install"
  );
  assert!(
    runner.file_exists_at(aindex.join("AGENTS.md")),
    "aindex/AGENTS.md should exist after manual create"
  );

  // 从 memory-sync 执行 clean
  runner
    .clean()
    .assert_success("tnmsc clean from memory-sync");

  // memory-sync 的 AGENTS.md 应该被清理
  assert!(
    !runner.file_exists("AGENTS.md"),
    "memory-sync/AGENTS.md should be removed after scoped clean"
  );

  // 其他项目的 AGENTS.md 应该保留
  assert!(
    runner.file_exists_at(knowladge.join("AGENTS.md")),
    "knowladge/AGENTS.md should still exist after scoped clean"
  );
  assert!(
    runner.file_exists_at(aindex.join("AGENTS.md")),
    "aindex/AGENTS.md should still exist after scoped clean"
  );
}

#[test]
fn local_clean_from_aindex_does_not_clean_memory_sync() {
  let (home, memory_sync, aindex, knowladge) = workspace_paths();

  // 使用单个 runner，通过 run_at 在不同目录执行命令
  let runner = LocalTestRunner::with_cwd(&memory_sync);
  runner.assert_project_ready();

  // 从 home 全局清理，确保干净状态
  runner
    .run_at(&home, &["clean"])
    .assert_success("clean from home before test");

  // install 生成文件
  runner.install().assert_success("install before clean");

  // 手动创建 aindex/AGENTS.md
  std::fs::write(aindex.join("AGENTS.md"), "# Test AGENTS.md\n")
    .expect("should write aindex AGENTS.md");

  // 验证文件存在
  assert!(
    runner.file_exists("AGENTS.md"),
    "memory-sync/AGENTS.md should exist after install"
  );
  assert!(
    runner.file_exists_at(knowladge.join("AGENTS.md")),
    "knowladge/AGENTS.md should exist after install"
  );
  assert!(
    runner.file_exists_at(aindex.join("AGENTS.md")),
    "aindex/AGENTS.md should exist after manual create"
  );

  // 从 aindex 执行 clean
  runner
    .run_at(&aindex, &["clean"])
    .assert_success("tnmsc clean from aindex");

  // aindex 的 AGENTS.md 应该被清理（在作用域内）
  assert!(
    !runner.file_exists_at(aindex.join("AGENTS.md")),
    "aindex/AGENTS.md should be removed after scoped clean"
  );

  // memory-sync 和 knowladge 的 AGENTS.md 应该保留
  assert!(
    runner.file_exists("AGENTS.md"),
    "memory-sync/AGENTS.md should still exist after scoped clean from aindex"
  );
  assert!(
    runner.file_exists_at(knowladge.join("AGENTS.md")),
    "knowladge/AGENTS.md should still exist after scoped clean from aindex"
  );
}

#[test]
fn local_clean_from_home_cleans_all_projects() {
  let (home, memory_sync, aindex, knowladge) = workspace_paths();

  // 使用单个 runner，通过 run_at 在不同目录执行命令
  let runner = LocalTestRunner::with_cwd(&memory_sync);
  runner.assert_project_ready();

  // 从 home 全局清理，确保干净状态
  runner
    .run_at(&home, &["clean"])
    .assert_success("clean from home before test");

  // install 生成文件
  runner.install().assert_success("install before clean");

  // 手动创建 aindex/AGENTS.md
  std::fs::write(aindex.join("AGENTS.md"), "# Test AGENTS.md\n")
    .expect("should write aindex AGENTS.md");

  // 验证所有文件都存在
  assert!(
    runner.file_exists("AGENTS.md"),
    "memory-sync/AGENTS.md should exist after install"
  );
  assert!(
    runner.file_exists_at(knowladge.join("AGENTS.md")),
    "knowladge/AGENTS.md should exist after install"
  );
  assert!(
    runner.file_exists_at(aindex.join("AGENTS.md")),
    "aindex/AGENTS.md should exist after manual create"
  );

  // 从 home 执行 clean（不在 workspace 子项目内，应清理全部）
  runner
    .run_at(&home, &["clean"])
    .assert_success("tnmsc clean from home");

  // 所有项目的 AGENTS.md 都应该被清理
  assert!(
    !runner.file_exists("AGENTS.md"),
    "memory-sync/AGENTS.md should be removed after global clean"
  );
  assert!(
    !runner.file_exists_at(knowladge.join("AGENTS.md")),
    "knowladge/AGENTS.md should be removed after global clean"
  );
  assert!(
    !runner.file_exists_at(aindex.join("AGENTS.md")),
    "aindex/AGENTS.md should be removed after global clean"
  );
}
