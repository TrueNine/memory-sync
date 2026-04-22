//! 验证 CLI 合约: 打包后的 `tnmsc` 二进制在全局安装后暴露预期的命令界面 (子命令和版本)。
//!
//! **断言**:
//! - `help` 输出列出所有预期的子命令 (完整性)
//! - `version` 输出与当前包版本一致 (正确性)

use tnmsc_integrate_tests::{
  EXPECTED_SUBCOMMANDS, current_package_version, install_packaged_cli_container,
};

#[test]
fn packaged_cli_contract_runs_inside_testcontainer() {
  let container = install_packaged_cli_container().unwrap();

  let help = container.exec_tnmsc(&["help"]);
  help.assert_success("global tnmsc help");
  for expected in EXPECTED_SUBCOMMANDS {
    assert!(
      help.stdout.contains(expected),
      "help output should include `{expected}`.\nstdout:\n{}",
      help.stdout
    );
  }

  let version = container.exec_tnmsc(&["version"]);
  version.assert_success("global tnmsc version");
  assert_eq!(version.stdout.trim(), current_package_version());
}
