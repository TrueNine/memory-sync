#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

use tnmsm_integrate_tests::{
  create_staged_package_root, install_packaged_mcp_container, real_env_test_skip_reason,
  run_mcp_with_env, workspace_root,
};

#[test]
fn packaging_smoke_covers_release_binary_and_global_install() {
  if let Some(reason) = real_env_test_skip_reason() {
    eprintln!("skipping packaging smoke: {reason}");
    return;
  }

  let staged = create_staged_package_root();
  let package_root = staged.package_root.to_string_lossy().into_owned();
  let workspace_root_dir = workspace_root().to_string_lossy().into_owned();

  let assemble = run_mcp_with_env(
    &["assemble-npm", "--profile", "release"],
    &workspace_root(),
    &[
      ("TNMSM_NPM_PACKAGE_ROOT", package_root.as_str()),
      ("TNMSM_WORKSPACE_ROOT", workspace_root_dir.as_str()),
    ],
  );
  assemble.assert_success("tnmsm assemble-npm --profile release");

  assert!(
    staged.linux_binary.is_file(),
    "expected hydrated linux binary at {}",
    staged.linux_binary.display()
  );

  #[cfg(unix)]
  {
    let mode = fs::metadata(&staged.linux_binary)
      .unwrap_or_else(|error| panic!("failed to stat {}: {error}", staged.linux_binary.display()))
      .permissions()
      .mode();
    assert!(
      mode & 0o111 != 0,
      "expected {} to be executable, mode was {:o}",
      staged.linux_binary.display(),
      mode
    );
  }

  let container = install_packaged_mcp_container();

  let initialize = container
    .exec(r#"printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | tnmsm"#);
  initialize.assert_success("global tnmsm initialize");
  for expected in [
    "\"jsonrpc\":\"2.0\"",
    "\"protocolVersion\":\"2024-11-05\"",
    "\"name\":\"@truenine/memory-sync-mcp\"",
  ] {
    assert!(
      initialize.stdout.contains(expected),
      "initialize output should include `{expected}`.\nstdout:\n{}",
      initialize.stdout
    );
  }

  container.exec_success(
    r#"
MAIN_PACKAGE_JSON="$(find -L /pnpm/global -path '*/@truenine/memory-sync-mcp/package.json' -print -quit)"
PLATFORM_PACKAGE_JSON="$(find -L /pnpm/global -path '*/@truenine/memory-sync-mcp-linux-x64-gnu/package.json' -print -quit)"
test -n "$MAIN_PACKAGE_JSON"
test -n "$PLATFORM_PACKAGE_JSON"
test -x "$(dirname "$PLATFORM_PACKAGE_JSON")/bin/tnmsm"
test -x "$(command -v tnmsm)"
"#,
  );
}
