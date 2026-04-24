//! 验证 npm 打包流程: `assemble-npm` 生成的 release 二进制在全局安装后暴露正确的命令界面和插件。
//!
//! **断言**:
//! - `assemble-npm --profile release` 生成可执行的 Linux 二进制 (构建产物)
//! - 二进制具有可执行权限 (Unix 权限正确性)
//! - 全局安装的 `tnmsc help` 列出所有预期的子命令 (命令界面)
//! - 主 npm 包声明正确的平台 optional dependency (包依赖布局)
//! - 平台包结构正确 (npm 包布局)

use std::fs;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

use tnmsc_integrate_tests::{
  EXPECTED_SUBCOMMANDS, PACKAGED_PLATFORM_PACKAGE, create_staged_package_root,
  install_packaged_cli_container, run_tnmsc_with_env, workspace_root,
};

#[test]
fn packaging_smoke_covers_release_binary_and_global_install() {
  let staged = create_staged_package_root();
  let package_root = staged.package_root.to_string_lossy().into_owned();
  let workspace_root_dir = workspace_root().to_string_lossy().into_owned();

  let assemble = run_tnmsc_with_env(
    &["assemble-npm", "--profile", "release"],
    &workspace_root(),
    &[
      ("TNMSC_NPM_PACKAGE_ROOT", package_root.as_str()),
      ("TNMSC_WORKSPACE_ROOT", workspace_root_dir.as_str()),
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
    assert_ne!(
      mode & 0o111,
      0,
      "expected {} to be executable, mode was {:o}",
      staged.linux_binary.display(),
      mode
    );
  }

  let container = install_packaged_cli_container().unwrap();

  let help = container.exec_tnmsc(&["help"]);
  help.assert_success("global tnmsc help");
  for expected in EXPECTED_SUBCOMMANDS {
    assert!(
      help.stdout.contains(expected),
      "global help output should include `{expected}`.\nstdout:\n{}",
      help.stdout
    );
  }

  let main_package_json = fs::read_to_string(staged.package_root.join("package.json"))
    .unwrap_or_else(|error| panic!("failed to read staged main package.json: {error}"));
  assert!(
    main_package_json.contains(PACKAGED_PLATFORM_PACKAGE),
    "staged main package.json should declare the packaged platform dependency.\ncontent:\n{}",
    main_package_json
  );

  container.exec_success(
    r#"
MAIN_PACKAGE_JSON="$(find -L /usr/local/lib/node_modules -path '*/@truenine/memory-sync-cli/package.json' -print -quit)"
PLATFORM_PACKAGE_JSON="$(find -L /usr/local/lib/node_modules -path '*/@truenine/memory-sync-cli-linux-x64-gnu/package.json' -print -quit)"
test -n "$MAIN_PACKAGE_JSON"
test -n "$PLATFORM_PACKAGE_JSON"
test -f "$(dirname "$MAIN_PACKAGE_JSON")/bin/tnmsc.js"
test -x "$(dirname "$PLATFORM_PACKAGE_JSON")/bin/tnmsc"
test -x "$(command -v tnmsc)"
grep -q '"@truenine/memory-sync-cli-linux-x64-gnu"' "$MAIN_PACKAGE_JSON"
test ! -e "$(dirname "$MAIN_PACKAGE_JSON")/dist/index.mjs"
"#,
  );
}
