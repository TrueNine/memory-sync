//! 本地裸机 install 测试：直接在真实项目上运行 tnmsc install。
//!
//! **前提**：
//! - 当前目录或其祖先目录已配置 `.tnmsc.json`
//! - `aindex/` 目录已存在且有内容
//! - **测试不会创建任何文件或目录**，缺少配置则直接失败

use tnmsc_local_tests::LocalTestRunner;

#[test]
fn local_install_generates_project_claude_md() {
  let runner = LocalTestRunner::new();

  // 验证项目已就绪（不创建任何文件）
  runner.assert_project_ready();

  // 先 clean 确保干净状态
  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  // 执行 install
  let install = runner.install();
  install.assert_success("tnmsc install");

  // 验证 ~/workspace/memory-sync/CLAUDE.md 已生成
  assert!(
    runner.file_exists("CLAUDE.md"),
    "~/workspace/memory-sync/CLAUDE.md should be generated after install"
  );

  // 验证文件非空
  let content = runner
    .read_file("CLAUDE.md")
    .expect("CLAUDE.md should be readable");
  assert!(
    !content.is_empty(),
    "CLAUDE.md should not be empty.\nstdout:\n{}\nstderr:\n{}",
    install.stdout,
    install.stderr
  );

  // 验证 ~/.claude/CLAUDE.md 已生成
  assert!(
    runner.claude_global_file_exists(),
    "~/.claude/CLAUDE.md should be generated after install"
  );
}

#[test]
fn local_install_idempotent() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  // 第一次 install
  let first = runner.install();
  first.assert_success("first tnmsc install");
  assert!(
    runner.file_exists("CLAUDE.md"),
    "~/workspace/memory-sync/CLAUDE.md should exist after first install"
  );

  let content_first = runner.read_file("CLAUDE.md").unwrap();

  // 第二次 install（应该幂等）
  let second = runner.install();
  second.assert_success("second tnmsc install");

  let content_second = runner.read_file("CLAUDE.md").unwrap();
  assert_eq!(
    content_first, content_second,
    "consecutive installs should produce identical output"
  );

  // 全局文件也应存在
  assert!(
    runner.claude_global_file_exists(),
    "~/.claude/CLAUDE.md should exist after install"
  );
}

#[test]
fn local_install_generates_claude_directory_structure() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  // 先 clean 确保干净状态
  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  // 执行 install
  let install = runner.install();
  install.assert_success("tnmsc install");

  // 验证 ~/workspace/memory-sync/.claude/ 已生成
  assert!(
    runner.dir_exists(".claude"),
    "~/workspace/memory-sync/.claude should be generated after install"
  );

  // 验证子目录存在
  for subdir in ["agents", "skills", "commands"] {
    assert!(
      runner.dir_exists(format!(".claude/{}", subdir)),
      "~/workspace/memory-sync/.claude/{} should exist after install",
      subdir
    );
  }

  // 验证目录非空（至少包含一个文件）
  for subdir in ["agents", "skills", "commands"] {
    let path = runner.cwd().join(".claude").join(subdir);
    let has_files = std::fs::read_dir(&path)
      .map(|entries| entries.flatten().any(|e| e.file_type().map(|ft| ft.is_file()).unwrap_or(false)))
      .unwrap_or(false);
    assert!(
      has_files,
      "~/workspace/memory-sync/.claude/{} should contain at least one file",
      subdir
    );
  }
}
