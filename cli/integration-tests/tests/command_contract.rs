use serde_json::Value;
use tnmsc_integration_tests::{
  current_package_version, install_packaged_cli_container, not_implemented_message, quote_shell,
  real_env_test_skip_reason, tnmsc_command,
};

#[test]
fn packaged_cli_contract_runs_inside_testcontainer() {
  if let Some(reason) = real_env_test_skip_reason() {
    eprintln!("skipping packaged contract smoke: {reason}");
    return;
  }

  let container = install_packaged_cli_container();

  let help = container.exec(&tnmsc_command(&["help"]));
  help.assert_success("global tnmsc help");
  for expected in ["install", "dry-run", "clean", "plugins", "version", "help"] {
    assert!(
      help.stdout.contains(expected),
      "help output should include `{expected}`.\nstdout:\n{}",
      help.stdout
    );
  }

  let version = container.exec(&tnmsc_command(&["version"]));
  version.assert_success("global tnmsc version");
  assert_eq!(version.stdout.trim(), current_package_version());

  let plugins = container.exec(&tnmsc_command(&["plugins"]));
  plugins.assert_success("global tnmsc plugins");
  for expected in [
    "CodexCLIOutputAdaptor",
    "ClaudeCodeCLIOutputAdaptor",
    "TraeOutputAdaptor",
    "OpencodeCLIOutputAdaptor",
  ] {
    assert!(
      plugins.stdout.contains(expected),
      "plugins output should include `{expected}`.\nstdout:\n{}",
      plugins.stdout
    );
  }

  let schema_output_path = "/tmp/tnmsc.schema.json";
  let schema = container.exec(&tnmsc_command(&["schema", "--output", schema_output_path]));
  schema.assert_success("global tnmsc schema --output");

  let schema_file = container.exec(&format!("cat {}", quote_shell(schema_output_path)));
  schema_file.assert_success("read schema output");
  let parsed: Value = serde_json::from_str(&schema_file.stdout)
    .unwrap_or_else(|error| panic!("schema output should be valid JSON: {error}"));
  let object = parsed
    .as_object()
    .expect("schema output should be a top-level JSON object");
  assert!(object.contains_key("$schema"));
  assert!(object.contains_key("properties"));

  for (args, command_name, display) in [
    (&["dry-run"][..], "dry-run", "tnmsc dry-run"),
    (&["clean"][..], "clean", "tnmsc clean"),
    (
      &["clean", "--dry-run"][..],
      "clean",
      "tnmsc clean --dry-run",
    ),
  ] {
    let result = container.exec(&tnmsc_command(args));
    result.assert_failure(display);

    let expected = not_implemented_message(command_name);
    assert!(
      result.stderr.contains(&expected),
      "{display} stderr should contain the not-implemented contract.\nexpected:\n{expected}\nactual:\n{}",
      result.stderr
    );
  }
}
