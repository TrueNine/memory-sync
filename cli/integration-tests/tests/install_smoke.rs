use tnmsc_integration_tests::{install_packaged_cli_container, real_env_test_skip_reason};

#[test]
fn packaged_cli_install_writes_claude_memory_from_aindex() {
  if let Some(reason) = real_env_test_skip_reason() {
    eprintln!("skipping install smoke: {reason}");
    return;
  }

  let container = install_packaged_cli_container();

  container
    .setup()
    .mkdir_p("/workspace/demo/aindex/dist")
    .mkdir_p("/root/.aindex")
    .write_file(
      "/root/.aindex/.tnmsc.json",
      r#"{
  "workspaceDir": "/workspace/demo",
  "plugins": {
    "claudeCode": true
  }
}"#,
    )
    .write_file(
      "/workspace/demo/aindex/dist/global.mdx",
      "Global memory from aindex",
    )
    .write_file(
      "/workspace/demo/aindex/dist/workspace.mdx",
      "Workspace root prompt from aindex",
    )
    .exec("setup install smoke workspace");

  let install = container.exec("cd /workspace/demo && tnmsc install");
  install.assert_success("global tnmsc install");

  let claude = container.cat_success("/workspace/demo/CLAUDE.md");
  assert!(
    claude.stdout.contains("Global memory from aindex"),
    "generated CLAUDE.md should include the global memory.\nstdout:\n{}",
    claude.stdout
  );
  assert!(
    claude.stdout.contains("Workspace root prompt from aindex"),
    "generated CLAUDE.md should include the workspace prompt.\nstdout:\n{}",
    claude.stdout
  );
}

#[test]
fn packaged_cli_install_errors_when_workspace_dir_not_configured() {
  if let Some(reason) = real_env_test_skip_reason() {
    eprintln!("skipping missing workspaceDir test: {reason}");
    return;
  }

  let container = install_packaged_cli_container();

  container
    .setup()
    .mkdir_p("/workspace/demo/aindex/dist")
    .mkdir_p("/root/.aindex")
    .write_file(
      "/root/.aindex/.tnmsc.json",
      r#"{
  "plugins": {
    "claudeCode": true
  }
}"#,
    )
    .exec("setup missing workspaceDir workspace");

  let install = container.exec("cd /workspace/demo && tnmsc install");
  install.assert_failure("tnmsc install without workspaceDir");
  assert!(
    install.stderr.contains("workspaceDir"),
    "stderr should mention workspaceDir as the missing required field.\nstdout:\n{}\nstderr:\n{}",
    install.stdout,
    install.stderr
  );
}

#[test]
fn packaged_cli_install_errors_when_config_file_missing() {
  if let Some(reason) = real_env_test_skip_reason() {
    eprintln!("skipping missing config file test: {reason}");
    return;
  }

  let container = install_packaged_cli_container();

  container
    .setup()
    .mkdir_p("/workspace/demo/aindex/dist")
    .rm_rf("/root/.aindex")
    .exec("setup missing config workspace");

  let install = container.exec("cd /workspace/demo && tnmsc install");
  install.assert_failure("tnmsc install without config file");
  assert!(
    install.stderr.contains(".tnmsc.json"),
    "stderr should mention .tnmsc.json as the missing config file.\nstdout:\n{}\nstderr:\n{}",
    install.stdout,
    install.stderr
  );
}
