mod support;

use std::fs;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

use support::install_packaged_mcp_container;

#[test]
fn packaging_smoke_covers_release_binary_and_global_install() {
  if !support::is_linux_x64_host() {
    eprintln!("skipping packaging smoke on unsupported host");
    return;
  }

  support::ensure_release_binary();

  let staged = support::create_staged_package_root();
  let package_root = staged.package_root.to_string_lossy().into_owned();
  let workspace_root = support::workspace_root().to_string_lossy().into_owned();

  let assemble = support::run_mcp_with_env(
    &["assemble-npm", "--profile", "release"],
    &support::mcp_manifest_dir(),
    &[
      ("TNMSM_NPM_PACKAGE_ROOT", package_root.as_str()),
      ("TNMSM_WORKSPACE_ROOT", workspace_root.as_str()),
    ],
  );
  assemble.assert_success("memory-sync-mcp assemble-npm --profile release");

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

  let initialize = container.exec(
    r#"printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | memory-sync-mcp"#,
  );
  initialize.assert_success("global memory-sync-mcp initialize");
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
test -x "$(dirname "$PLATFORM_PACKAGE_JSON")/bin/memory-sync-mcp"
test -x "$(command -v memory-sync-mcp)"
"#,
  );
}
