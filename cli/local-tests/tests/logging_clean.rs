//! Clean 可观测性测试：验证 clean 命令输出足够的可观测信息。

use tnmsc_local_tests::LocalTestRunner;

#[test]
fn clean_outputs_key_spans_and_events() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  // 先 install 生成文件，再 clean
  let install = runner.install();
  install.assert_success("tnmsc install before clean");

  let result = runner.run(&["--trace", "clean"]);
  result.assert_success("tnmsc --trace clean");

  // 验证顶层事件
  assert!(
    result.stdout.contains("### Running clean"),
    "clean should output 'Running clean'. stdout:\n{}",
    result.stdout
  );

  // 验证主要 Span
  assert!(
    result.stdout.contains("### cleanup.discover started"),
    "clean should output 'cleanup.discover' span. stdout:\n{}",
    result.stdout
  );
  assert!(
    result.stdout.contains("### cleanup.execute started"),
    "clean should output 'cleanup.execute' span. stdout:\n{}",
    result.stdout
  );
}

#[test]
fn clean_outputs_deletion_summary() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  // 先 install 生成文件，再 clean
  let install = runner.install();
  install.assert_success("tnmsc install before clean");

  let result = runner.run(&["--info", "clean"]);
  result.assert_success("tnmsc --info clean");

  // Info 级别应该输出删除摘要
  assert!(
    result.stdout.contains("Deleted") || result.stdout.contains("No files needed updates"),
    "clean should output deletion summary. stdout:\n{}",
    result.stdout
  );
}
