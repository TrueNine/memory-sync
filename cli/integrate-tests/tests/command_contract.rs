use serde_json::Value;
use tnmsc_integration_tests::{
  EXPECTED_SUBCOMMANDS, PACKAGED_PLUGINS, current_package_version,
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

  let plugins = container.exec_tnmsc(&["plugins"]);
  plugins.assert_success("global tnmsc plugins");
  for expected in PACKAGED_PLUGINS {
    assert!(
      plugins.stdout.contains(expected),
      "plugins output should include `{expected}`.\nstdout:\n{}",
      plugins.stdout
    );
  }

  let schema_output_path = "/tmp/tnmsc.schema.json";
  let schema = container.exec_tnmsc(&["schema", "--output", schema_output_path]);
  schema.assert_success("global tnmsc schema --output");

  let schema_file = container.cat_success(schema_output_path);
  let parsed: Value = serde_json::from_str(&schema_file.stdout)
    .unwrap_or_else(|error| panic!("schema output should be valid JSON: {error}"));
  let object = parsed
    .as_object()
    .expect("schema output should be a top-level JSON object");
  assert!(object.contains_key("$schema"));
  assert!(object.contains_key("properties"));
}
