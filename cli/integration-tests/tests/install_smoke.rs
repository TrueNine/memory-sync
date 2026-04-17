use tnmsc_integration_tests::{install_packaged_cli_container, real_env_test_skip_reason};

#[test]
fn packaged_cli_install_writes_claude_memory_from_aindex() {
  if let Some(reason) = real_env_test_skip_reason() {
    eprintln!("skipping install smoke: {reason}");
    return;
  }

  let container = install_packaged_cli_container();

  container.exec_success(
    r#"
mkdir -p /workspace/demo/aindex/dist
mkdir -p /root/.aindex

cat <<'EOF' > /root/.aindex/.tnmsc.json
{
  "plugins": {
    "claudeCode": true
  }
}
EOF

cat <<'EOF' > /workspace/demo/aindex/dist/global.mdx
Global memory from aindex
EOF

cat <<'EOF' > /workspace/demo/aindex/dist/workspace.mdx
Workspace root prompt from aindex
EOF
"#,
  );

  let install = container.exec("cd /workspace/demo && tnmsc install");
  install.assert_success("global tnmsc install");

  let claude = container.exec("cat /workspace/demo/CLAUDE.md");
  claude.assert_success("read generated CLAUDE.md");
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
