//! 错误反馈测试：验证错误时输出结构化诊断信息。

use std::fs;
use tnmsc_local_tests::LocalTestRunner;

fn run_without_global_config(
  runner: &LocalTestRunner,
  args: &[&str],
) -> tnmsc_local_tests::CommandResult {
  let temp_home = std::env::temp_dir().join("tnmsc_test_home");
  let _ = fs::remove_dir_all(&temp_home);
  fs::create_dir_all(&temp_home).unwrap();
  // Point TNMSC_CONFIG_PATH to a non-existent file so global config is not found.
  let fake_config = temp_home.join(".tnmsc.json");
  runner.run_at_with_env(
    std::env::temp_dir(),
    args,
    &[("TNMSC_CONFIG_PATH", fake_config.to_str().unwrap())],
  )
}

/// Verify that running install without config outputs a structured diagnostic with a
/// "What happened" section, a fix suggestion mentioning .tnmsc.json, and actionable next steps.
#[test]
fn missing_config_outputs_diagnostic_with_fix() {
  let runner = LocalTestRunner::new();
  // 在临时目录运行（没有 .tnmsc.json），并隔离全局配置
  let result = run_without_global_config(&runner, &["install"]);
  result.assert_failure("install without config");

  // 验证诊断结构存在
  assert!(
    result.stderr.contains("What happened") || result.stdout.contains("What happened"),
    "error should contain 'What happened' section. stdout:\n{}\nstderr:\n{}",
    result.stdout,
    result.stderr
  );

  // 验证有修复建议（嵌入在错误消息中）
  assert!(
    result.stderr.contains("Please create it") || result.stdout.contains("Please create it"),
    "error should contain fix suggestion. stdout:\n{}\nstderr:\n{}",
    result.stdout,
    result.stderr
  );

  // 验证提及配置文件
  assert!(
    result.stderr.contains(".tnmsc.json") || result.stdout.contains(".tnmsc.json"),
    "error should mention .tnmsc.json. stdout:\n{}\nstderr:\n{}",
    result.stdout,
    result.stderr
  );
}

/// Verify that `--error` log level still shows the diagnostic structure when config
/// is missing (error diagnostics are never suppressed regardless of log level).
#[test]
fn missing_config_at_error_level_shows_diagnostic() {
  let runner = LocalTestRunner::new();
  let result = run_without_global_config(&runner, &["--error", "install"]);
  result.assert_failure("install without config at error level");

  // Error 级别也应该显示诊断
  assert!(
    result.stderr.contains("What happened"),
    "--error should still show diagnostic. stderr:\n{}",
    result.stderr
  );
}
