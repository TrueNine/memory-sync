use tnmsc_integrate_tests::{
  EXPECTED_SUBCOMMANDS, current_package_version,
  install_packaged_cli_container,
};

#[test]
fn packaged_cli_contract_runs_inside_testcontainer() {
  let container = install_packaged_cli_container();

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
