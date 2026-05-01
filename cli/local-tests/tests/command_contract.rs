//! 本地裸机 CLI 合约测试：验证编译后的 tnmsc 二进制暴露预期的命令界面。
//!
//! **前提**：无 — 不依赖任何配置文件或目录结构。

use tnmsc_local_tests::{EXPECTED_SUBCOMMANDS, LocalTestRunner, current_package_version};

/// Verify that `tnmsc help` lists all expected subcommands (install, dry-run, clean, version, help).
/// This ensures the CLI contract with end-users is not accidentally broken.
#[test]
fn local_cli_help_shows_expected_subcommands() {
  let runner = LocalTestRunner::new();
  let result = runner.run(&["help"]);
  result.assert_success("tnmsc help");
  for expected in EXPECTED_SUBCOMMANDS {
    assert!(
      result.stdout.contains(expected),
      "help output should include `{expected}`.\nstdout:\n{}",
      result.stdout
    );
  }
}

/// Verify that `tnmsc version` outputs the same version string as Cargo.toml.
/// Prevents version drift between the binary and the package metadata.
#[test]
fn local_cli_version_matches_package_version() {
  let runner = LocalTestRunner::new();
  let result = runner.run(&["version"]);
  result.assert_success("tnmsc version");
  assert_eq!(result.stdout.trim(), current_package_version());
}
