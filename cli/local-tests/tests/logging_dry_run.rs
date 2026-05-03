//! Dry-run 可观测性测试：验证 dry-run 命令输出足够的可观测信息。

use tnmsc_local_tests::LocalTestRunner;

/// Verify that `--trace` dry-run outputs all major spans:
/// config.load, context.collect, output.build.
#[test]
fn dry_run_outputs_key_spans_and_events() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let result = runner.run(&["--trace", "dry-run"]);
  result.assert_success("tnmsc --trace dry-run");

  // 验证顶层事件
  assert!(
    result.stdout.contains("### Running dry-run"),
    "dry-run should output 'Running dry-run'. stdout:\n{}",
    result.stdout
  );

  // 验证主要 Span
  assert!(
    result.stdout.contains("### config.load started"),
    "dry-run should output 'config.load' span. stdout:\n{}",
    result.stdout
  );
  assert!(
    result.stdout.contains("### context.collect started"),
    "dry-run should output 'context.collect' span. stdout:\n{}",
    result.stdout
  );
  assert!(
    result.stdout.contains("### output.build started"),
    "dry-run should output 'output.build' span. stdout:\n{}",
    result.stdout
  );
}

/// Verify that `--info` dry-run outputs a plan summary (what files would be written).
#[test]
fn dry_run_outputs_plan_preview() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let result = runner.run(&["--info", "dry-run"]);
  result.assert_success("tnmsc --info dry-run");

  // Info 级别应该输出计划摘要
  assert!(
    result.stdout.contains("Planned") || result.stdout.contains("No files needed updates"),
    "dry-run should output plan summary. stdout:\n{}",
    result.stdout
  );
}
