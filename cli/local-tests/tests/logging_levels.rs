//! 日志级别测试：验证不同日志级别下的输出行为。

use tnmsc_local_tests::LocalTestRunner;

/// Verify that `--trace` log level outputs fine-grained collector span events
/// like `collect.aindex_resolvers` and `config.load`.
#[test]
fn trace_level_outputs_span_events() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  // clean 后 install，确保有文件写入操作
  let clean = runner.clean();
  clean.assert_success("tnmsc clean");

  let result = runner.run(&["--trace", "install"]);
  result.assert_success("tnmsc --trace install");

  // Trace 级别应该输出 collector span
  assert!(
    result
      .stdout
      .contains("### collect.aindex_resolvers started"),
    "--trace should output collector spans. stdout:\n{}",
    result.stdout
  );
  assert!(
    result.stdout.contains("### config.load started"),
    "--trace should output config span. stdout:\n{}",
    result.stdout
  );
}

/// Verify that the default (info) log level outputs top-level events like
/// "Install started" and "Install completed".
#[test]
fn info_level_outputs_top_level_events() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean");

  let result = runner.install(); // 默认 info 级别
  result.assert_success("tnmsc install");

  // Info 级别应该输出顶层事件
  assert!(
    result.stdout.contains("### Install started"),
    "default level should output 'Install started'. stdout:\n{}",
    result.stdout
  );
  assert!(
    result.stdout.contains("### Install completed"),
    "default level should output 'Install completed'. stdout:\n{}",
    result.stdout
  );
}

/// Verify that `--error` log level suppresses info events but still outputs
/// error diagnostics when config is missing.
#[test]
fn error_level_only_outputs_errors() {
  let runner = LocalTestRunner::new();
  // 在一个没有 config 的目录运行，并隔离全局配置，触发错误
  let temp_home = std::env::temp_dir().join("tnmsc_test_home");
  let _ = std::fs::remove_dir_all(&temp_home);
  std::fs::create_dir_all(&temp_home).unwrap();
  let fake_config = temp_home.join(".tnmsc.json");
  let result = runner.run_at_with_env(
    std::env::temp_dir(),
    &["--error", "install"],
    &[("TNMSC_CONFIG_PATH", fake_config.to_str().unwrap())],
  );
  result.assert_failure("tnmsc --error install without config");

  // Error 级别不应该输出 info 事件
  assert!(
    !result.stdout.contains("### Install started"),
    "--error should not output info events. stdout:\n{}",
    result.stdout
  );

  // 但应该输出错误诊断
  assert!(
    result.stderr.contains("What happened") || result.stderr.contains("error"),
    "--error should output error diagnostics. stderr:\n{}",
    result.stderr
  );
}

/// Verify that `--debug` log level outputs intermediate events like
/// "Context collected" and "Output files built".
#[test]
fn debug_level_outputs_debug_events() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean");

  let result = runner.run(&["--debug", "install"]);
  result.assert_success("tnmsc --debug install");

  // Debug 级别应该输出更多上下文
  assert!(
    result.stdout.contains("### Context collected"),
    "--debug should output 'Context collected'. stdout:\n{}",
    result.stdout
  );
  assert!(
    result.stdout.contains("### Output files built"),
    "--debug should output 'Output files built'. stdout:\n{}",
    result.stdout
  );
}
