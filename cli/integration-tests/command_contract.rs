mod support;

use std::fs;

use support::{current_package_version, not_implemented_message, run_tnmsc, TestDir};

#[test]
fn help_lists_supported_commands() {
  let result = run_tnmsc(&["help"], &support::workspace_root());
  result.assert_success("tnmsc help");

  for expected in ["install", "dry-run", "clean", "plugins", "version", "help"] {
    assert!(
      result.stdout.contains(expected),
      "help output should include `{expected}`.\nstdout:\n{}",
      result.stdout
    );
  }
}

#[test]
fn version_matches_workspace_version() {
  let result = run_tnmsc(&["version"], &support::workspace_root());
  result.assert_success("tnmsc version");

  assert_eq!(result.stdout.trim(), current_package_version());
}

#[test]
fn plugins_lists_core_output_adaptors() {
  let result = run_tnmsc(&["plugins"], &support::workspace_root());
  result.assert_success("tnmsc plugins");

  for expected in [
    "CodexCLIOutputAdaptor",
    "ClaudeCodeCLIOutputAdaptor",
    "TraeOutputAdaptor",
    "OpencodeCLIOutputAdaptor",
  ] {
    assert!(
      result.stdout.contains(expected),
      "plugins output should include `{expected}`.\nstdout:\n{}",
      result.stdout
    );
  }
}

#[test]
fn schema_output_writes_valid_json_in_integration_sandbox() {
  let temp_dir = TestDir::new("tnmsc-schema-contract");
  let schema_path = temp_dir.path().join("tnmsc.schema.json");
  let schema_path_arg = schema_path.to_string_lossy().into_owned();

  let result = run_tnmsc(
    &["schema", "--output", &schema_path_arg],
    &support::workspace_root(),
  );
  result.assert_success("tnmsc schema --output");

  let content = fs::read_to_string(&schema_path)
    .unwrap_or_else(|error| panic!("failed to read {}: {error}", schema_path.display()));
  let parsed: serde_json::Value = serde_json::from_str(&content)
    .unwrap_or_else(|error| panic!("schema output should be valid JSON: {error}"));

  let object = parsed
    .as_object()
    .expect("schema output should be a top-level JSON object");

  assert!(object.contains_key("$schema"));
  assert!(object.contains_key("properties"));
}

#[test]
fn install_like_commands_fail_with_not_implemented_contract() {
  for (args, command_name, display) in [
    (&[][..], "install", "tnmsc"),
    (&["install"][..], "install", "tnmsc install"),
    (&["dry-run"][..], "dry-run", "tnmsc dry-run"),
    (&["clean"][..], "clean", "tnmsc clean"),
    (
      &["clean", "--dry-run"][..],
      "clean",
      "tnmsc clean --dry-run",
    ),
  ] {
    let result = run_tnmsc(args, &support::workspace_root());
    result.assert_failure(display);

    let expected = not_implemented_message(command_name);
    assert!(
      result.stderr.contains(&expected),
      "{display} stderr should contain the not-implemented contract.\nexpected:\n{expected}\nactual:\n{}",
      result.stderr
    );
  }
}
