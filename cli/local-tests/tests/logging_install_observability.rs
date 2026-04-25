//! Install 可观测性测试：验证 install 命令输出足够的可观测信息。

use tnmsc_local_tests::LocalTestRunner;

#[test]
fn install_outputs_key_spans_and_events() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let result = runner.run(&["--trace", "install"]);
  result.assert_success("tnmsc --trace install");

  // 验证顶层事件
  assert!(
    result.stdout.contains("### Install started"),
    "install should output 'Install started'. stdout:\n{}",
    result.stdout
  );
  assert!(
    result.stdout.contains("### Install completed"),
    "install should output 'Install completed'. stdout:\n{}",
    result.stdout
  );

  // 验证主要 Span
  assert!(
    result.stdout.contains("### config.load started"),
    "install should output 'config.load' span. stdout:\n{}",
    result.stdout
  );
  assert!(
    result.stdout.contains("### context.collect started"),
    "install should output 'context.collect' span. stdout:\n{}",
    result.stdout
  );
  assert!(
    result.stdout.contains("### output.build started"),
    "install should output 'output.build' span. stdout:\n{}",
    result.stdout
  );
  assert!(
    result.stdout.contains("### files.write started"),
    "install should output 'files.write' span. stdout:\n{}",
    result.stdout
  );

  // 验证 collector span
  assert!(
    result
      .stdout
      .contains("### collect.aindex_resolvers started"),
    "install should output 'collect.aindex_resolvers' span. stdout:\n{}",
    result.stdout
  );
  assert!(
    result.stdout.contains("### collect.project_prompt started"),
    "install should output 'collect.project_prompt' span. stdout:\n{}",
    result.stdout
  );
}

#[test]
fn install_outputs_plugin_resolution() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean");

  let result = runner.run(&["--info", "install"]);
  result.assert_success("tnmsc --info install");

  // 验证插件解析信息
  assert!(
    result.stdout.contains("Plugins resolved"),
    "install should output plugin resolution. stdout:\n{}",
    result.stdout
  );
}

#[test]
fn install_outputs_file_write_events() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean");

  let result = runner.run(&["--debug", "install"]);
  result.assert_success("tnmsc --debug install");

  // 验证文件写入事件（应该有文件被写入）
  assert!(
    result.stdout.contains("file.written") || result.stdout.contains("file.skipped"),
    "install should output file write events. stdout:\n{}",
    result.stdout
  );
}
