mod support;

use std::fs;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

use support::install_packaged_cli_container;

#[test]
fn packaging_smoke_covers_release_binary_and_global_install() {
  if !support::is_linux_x64_host() {
    eprintln!("skipping packaging smoke on unsupported host");
    return;
  }

  let staged = support::create_staged_package_root();
  let package_root = staged.package_root.to_string_lossy().into_owned();
  let workspace_root = support::workspace_root().to_string_lossy().into_owned();

  let assemble = support::run_tnmsc_with_env(
    &["assemble-npm", "--profile", "release"],
    &support::cli_manifest_dir(),
    &[
      ("TNMSC_NPM_PACKAGE_ROOT", package_root.as_str()),
      ("TNMSC_WORKSPACE_ROOT", workspace_root.as_str()),
    ],
  );
  assemble.assert_success("tnmsc assemble-npm --profile release");

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

  let container = install_packaged_cli_container();

  let help = container.exec("tnmsc help");
  help.assert_success("global tnmsc help");
  for expected in ["install", "dry-run", "clean", "plugins"] {
    assert!(
      help.stdout.contains(expected),
      "global help output should include `{expected}`.\nstdout:\n{}",
      help.stdout
    );
  }

  let plugins = container.exec("tnmsc plugins");
  plugins.assert_success("global tnmsc plugins");
  for expected in [
    "CodexCLIOutputAdaptor",
    "ClaudeCodeCLIOutputAdaptor",
    "TraeOutputAdaptor",
    "OpencodeCLIOutputAdaptor",
  ] {
    assert!(
      plugins.stdout.contains(expected),
      "global plugins output should include `{expected}`.\nstdout:\n{}",
      plugins.stdout
    );
  }

  container.exec_success(
    r#"
MAIN_PACKAGE_JSON="$(find -L /pnpm/global -path '*/@truenine/memory-sync-cli/package.json' -print -quit)"
PLATFORM_PACKAGE_JSON="$(find -L /pnpm/global -path '*/@truenine/memory-sync-cli-linux-x64-gnu/package.json' -print -quit)"
test -n "$MAIN_PACKAGE_JSON"
test -n "$PLATFORM_PACKAGE_JSON"
test -x "$(dirname "$PLATFORM_PACKAGE_JSON")/bin/tnmsc"
test -x "$(command -v tnmsc)"
test ! -e "$(dirname "$MAIN_PACKAGE_JSON")/dist/index.mjs"
"#,
  );
}
