//! 本地裸机 Trae 测试：验证 .trae/steering/GLOBAL.md 正确生成，
//! .trae-cn/ 不被输出，且清理时兼容清理旧的 .trae-cn/。

use std::fs;

use tnmsc_local_tests::LocalTestRunner;

#[test]
fn binary_exists_before_tests() {
  let binary = tnmsc_local_tests::binary_path();
  assert!(
    binary.is_file(),
    "binary not found at: {}\n\nplease compile it first:\n  cargo build -p tnmsc\n",
    binary.display()
  );
}

#[test]
fn local_trae_steering_generated_after_install() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  assert!(
    runner.trae_steering_file_exists(),
    ".trae/steering/GLOBAL.md should be generated after install, stdout:\n{}\nstderr:\n{}",
    install.stdout,
    install.stderr
  );

  assert!(
    !runner.trae_cn_file_exists(),
    ".trae-cn/user_rules/GLOBAL.md must NOT be generated after install"
  );
}

#[test]
fn local_trae_steering_idempotent() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let first = runner.install();
  first.assert_success("first tnmsc install");
  assert!(runner.trae_steering_file_exists());

  let content_first =
    fs::read_to_string(runner.cwd().join(".trae").join("steering").join("GLOBAL.md")).unwrap();

  let second = runner.install();
  second.assert_success("second tnmsc install");

  let content_second =
    fs::read_to_string(runner.cwd().join(".trae").join("steering").join("GLOBAL.md")).unwrap();

  assert_eq!(
    content_first, content_second,
    "consecutive installs should produce identical .trae/steering/GLOBAL.md"
  );
}

#[test]
fn local_trae_steering_removed_after_clean() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");
  assert!(runner.trae_steering_file_exists());

  let clean = runner.clean();
  clean.assert_success("tnmsc clean");

  assert!(
    !runner.trae_steering_file_exists(),
    ".trae/steering/GLOBAL.md should be removed after clean"
  );
}

#[test]
fn local_trae_cn_cleaned_for_compatibility() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");
  assert!(runner.trae_steering_file_exists());

  // Simulate old-style .trae-cn/ output (should be cleaned up)
  let trae_cn_path = runner.cwd().join(".trae-cn").join("user_rules").join("GLOBAL.md");
  fs::create_dir_all(trae_cn_path.parent().unwrap()).unwrap();
  fs::write(&trae_cn_path, "# legacy\n").unwrap();
  assert!(runner.trae_cn_file_exists(), "fake .trae-cn should exist before clean");

  let clean = runner.clean();
  clean.assert_success("tnmsc clean removes legacy .trae-cn");

  assert!(
    !runner.trae_cn_file_exists(),
    "legacy .trae-cn/user_rules/GLOBAL.md should be removed during clean for compatibility"
  );

  // .trae/steering/GLOBAL.md should also be removed
  assert!(
    !runner.trae_steering_file_exists(),
    ".trae/steering/GLOBAL.md should also be removed after clean"
  );
}
