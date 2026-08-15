//! 本地裸机 dry-run 测试：验证 tnmsc dry-run 不写入文件。
//!
//! **前提**：项目已配置。

use tnmsc_local_tests::LocalTestRunner;

/// Verify that `tnmsc dry-run` reports what would be written but does NOT create
/// any project files. The core safety guarantee of dry-run mode.
#[test]
fn local_dry_run_does_not_write_project_files() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  // 先 clean 确保干净
  let clean = runner.clean();
  clean.assert_success("tnmsc clean before dry-run");

  assert!(
    !runner.file_exists("CLAUDE.md"),
    "~/workspace/croessweave/CLAUDE.md should not exist before dry-run"
  );

  // dry-run 不应写入文件
  let dry = runner.dry_run();
  dry.assert_success("tnmsc dry-run");

  assert!(
    !runner.file_exists("CLAUDE.md"),
    "~/workspace/croessweave/CLAUDE.md should not be created by dry-run"
  );
}
