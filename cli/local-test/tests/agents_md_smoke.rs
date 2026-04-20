//! 本地裸机 AGENTS.md 测试：验证 AgentsOutputAdaptor 生成的 AGENTS.md 文件。
//!
//! **前提**：项目已配置，aindex 目录已存在且有内容。

use std::fs;
use std::path::PathBuf;

use tnmsc_local_tests::LocalTestRunner;

/// 临时修改全局配置以禁用 agents_md 插件，测试结束后自动恢复。
struct GlobalConfigGuard {
  config_path: PathBuf,
  original_content: Option<String>,
}

impl GlobalConfigGuard {
  fn with_agents_md_disabled() -> Self {
    let config_path = tnmsc_local_tests::home_dir()
      .join(".aindex")
      .join(".tnmsc.json");

    let original_content = if config_path.is_file() {
      fs::read_to_string(&config_path).ok()
    } else {
      None
    };

    let mut config_json: serde_json::Value = original_content
      .as_ref()
      .and_then(|c| serde_json::from_str(c).ok())
      .unwrap_or_else(|| serde_json::json!({}));

    if let Some(obj) = config_json.as_object_mut() {
      let plugins = obj
        .entry("plugins")
        .or_insert_with(|| serde_json::json!({}));
      if let Some(p) = plugins.as_object_mut() {
        p.insert("agentsMd".into(), serde_json::json!(false));
        p.insert("claudeCode".into(), serde_json::json!(true));
        p.insert("opencode".into(), serde_json::json!(true));
        p.insert("git".into(), serde_json::json!(true));
      }
    }

    let new_content = format!("{}\n", serde_json::to_string_pretty(&config_json).unwrap());
    fs::write(&config_path, new_content).expect("should write temp global config");

    Self {
      config_path,
      original_content,
    }
  }
}

impl Drop for GlobalConfigGuard {
  fn drop(&mut self) {
    match &self.original_content {
      Some(content) => {
        let _ = fs::write(&self.config_path, content);
      }
      None => {
        let _ = fs::remove_file(&self.config_path);
      }
    }
  }
}

#[test]
fn local_agents_md_install_generates_project_agents_md() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  assert!(
    runner.agents_md_project_file_exists(),
    "~/workspace/memory-sync/AGENTS.md should be generated after install"
  );

  let content = runner
    .read_agents_md_project_file()
    .expect("AGENTS.md should be readable");
  assert!(!content.is_empty(), "AGENTS.md should not be empty");

  assert!(
    runner.agents_md_child_file_exists(".github"),
    "~/workspace/memory-sync/.github/AGENTS.md should be generated after install"
  );

  let child_content = runner
    .read_agents_md_child_file(".github")
    .expect(".github/AGENTS.md should be readable");
  assert!(
    !child_content.is_empty(),
    ".github/AGENTS.md should not be empty"
  );
}

#[test]
fn local_agents_md_content_matches_aindex_source() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  let aindex_content = runner
    .read_aindex_file("app/memory-sync/agt.mdx")
    .expect("aindex source agt.mdx should be readable");

  let generated_content = runner
    .read_agents_md_project_file()
    .expect("AGENTS.md should be readable after install");

  assert_eq!(
    aindex_content.trim(),
    generated_content.trim(),
    "generated AGENTS.md should match aindex source agt.mdx"
  );
}

#[test]
fn local_agents_md_child_content_matches_aindex_source() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  let aindex_child_content = runner
    .read_aindex_file("app/memory-sync/.github/agt.mdx")
    .expect("aindex source .github/agt.mdx should be readable");

  let generated_child_content = runner
    .read_agents_md_child_file(".github")
    .expect(".github/AGENTS.md should be readable after install");

  assert_eq!(
    aindex_child_content.trim(),
    generated_child_content.trim(),
    "generated .github/AGENTS.md should match aindex source .github/agt.mdx"
  );
}

#[test]
fn local_agents_md_clean_removes_files() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let install = runner.install();
  install.assert_success("tnmsc install before clean");

  assert!(
    runner.agents_md_project_file_exists(),
    "AGENTS.md should exist after install"
  );
  assert!(
    runner.agents_md_child_file_exists(".github"),
    ".github/AGENTS.md should exist after install"
  );

  let clean = runner.clean();
  clean.assert_success("tnmsc clean");

  assert!(
    !runner.agents_md_project_file_exists(),
    "AGENTS.md should be removed after clean"
  );
  assert!(
    !runner.agents_md_child_file_exists(".github"),
    ".github/AGENTS.md should be removed after clean"
  );
}

#[test]
fn local_agents_md_disabled_by_config() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  // 手动清除可能由前面测试遗留的 AGENTS.md 文件。
  // 当 agents_md 被禁用时，clean 服务不会生成对应的 cleanup target，
  // 因此无法依赖 tnmsc clean 来清理这些文件。
  fn remove_all_agents_md(dir: &std::path::Path) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
      let path = entry.path();
      let Ok(ft) = entry.file_type() else { continue };
      if ft.is_dir() {
        if let Some(name) = path.file_name() {
          let name = name.to_string_lossy();
          if name == ".git" || name == "node_modules" || name == "target" {
            continue;
          }
        }
        if path.join("AGENTS.md").is_file() {
          let _ = std::fs::remove_file(path.join("AGENTS.md"));
        }
        remove_all_agents_md(&path);
      }
    }
  }
  if runner.cwd().join("AGENTS.md").is_file() {
    let _ = std::fs::remove_file(runner.cwd().join("AGENTS.md"));
  }
  remove_all_agents_md(runner.cwd());

  let _guard = GlobalConfigGuard::with_agents_md_disabled();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  assert!(
    !runner.agents_md_project_file_exists(),
    "AGENTS.md should NOT be generated when agents_md is disabled"
  );
  assert!(
    !runner.agents_md_child_file_exists(".github"),
    ".github/AGENTS.md should NOT be generated when agents_md is disabled"
  );
}

/// 回归测试：clean 必须始终清理所有插件生成的文件，即使该插件当前已被禁用。
///
/// 设计原因：用户可能在禁用某个插件之前已经运行过 install，导致该插件生成的文件
/// 仍然残留在项目中。如果 clean 也跟随插件开关，则这些残留文件将永远无法被自动
/// 清理。因此 clean 行为不受插件开关控制，install 行为才受插件开关控制。
#[test]
fn local_agents_md_clean_always_removes_files_even_when_disabled() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  // Step 1: 在默认配置下（agents_md 启用）install，生成 AGENTS.md
  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  assert!(
    runner.agents_md_project_file_exists(),
    "AGENTS.md should exist after install with agents_md enabled"
  );

  // Step 2: 临时禁用 agents_md，然后执行 clean
  let _guard = GlobalConfigGuard::with_agents_md_disabled();

  let clean_disabled = runner.clean();
  clean_disabled.assert_success("tnmsc clean with agents_md disabled");

  // Step 3: 断言 AGENTS.md 已被清理，即使 agents_md 当前被禁用
  assert!(
    !runner.agents_md_project_file_exists(),
    "AGENTS.md should be removed by clean even when agents_md is disabled"
  );
  assert!(
    !runner.agents_md_child_file_exists(".github"),
    ".github/AGENTS.md should be removed by clean even when agents_md is disabled"
  );
}
