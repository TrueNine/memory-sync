//! 回归测试：验证 opencode agent 的 `mode` 字段值在合法集合内。
//!
//! opencode CLI 要求 agent 的 `mode` 必须是 `"subagent"`、`"primary"` 或 `"all"`。
//! 如果生成的值不匹配这三个之一，opencode 启动时会报错：
//!   Configuration is invalid at ~/project/.opencode/agents/<name>.md
//!   Invalid option: expected one of "subagent"|"primary"|"all" mode
//!
//! 本测试通过解析生成文件的 YAML front matter 来预防此类回归。
//!
//! **前提**：项目已配置，opencode 插件已启用。

use tnmsc_local_tests::LocalTestRunner;

/// opencode 接受的合法 `mode` 值集合。
const VALID_MODES: &[&str] = &["subagent", "primary", "all"];

/// 从 YAML front matter 行中提取 `mode` 的值。
///
/// 期望格式: `mode: subagent` 或 `mode: "subagent"` 或 `mode:` 开头。
/// 返回去掉引号的纯值字符串；如果没有 mode 行则返回 `None`。
fn extract_mode_from_front_matter_line(line: &str) -> Option<String> {
  let trimmed = line.trim();
  if !trimmed.starts_with("mode") {
    return None;
  }
  // 跳过 "mode" 和 ':' 及空白
  let after_key = trimmed
    .strip_prefix("mode")
    .and_then(|s| s.strip_prefix(':'))
    .map(|s| s.trim())
    .unwrap_or("");
  if after_key.is_empty() {
    return None;
  }
  // 去除引号
  let value = if after_key.starts_with('"') && after_key.ends_with('"') && after_key.len() >= 2 {
    &after_key[1..after_key.len() - 1]
  } else if after_key.starts_with('\'') && after_key.ends_with('\'') && after_key.len() >= 2 {
    &after_key[1..after_key.len() - 1]
  } else {
    after_key
  };
  Some(value.to_string())
}

/// 从 agent 文件的 YAML front matter 中提取 `mode` 值。
///
/// YAML front matter 以 `---` 起止。
fn extract_mode_from_agent_file(content: &str) -> Option<String> {
  let mut in_front_matter = false;
  let mut found_start = false;
  for line in content.lines() {
    let trimmed = line.trim();
    if trimmed == "---" {
      if !found_start {
        found_start = true;
        in_front_matter = true;
        continue;
      } else {
        // closing ---, end of front matter
        break;
      }
    }
    if in_front_matter {
      if let Some(mode) = extract_mode_from_front_matter_line(line) {
        return Some(mode);
      }
    }
  }
  None
}

#[test]
fn local_opencode_agent_mode_must_be_valid() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  let agents_dir = runner.cwd().join(".opencode").join("agents");
  let agent_files: Vec<_> = std::fs::read_dir(&agents_dir)
    .unwrap()
    .flatten()
    .filter(|e| e.file_type().map(|ft| ft.is_file()).unwrap_or(false))
    .collect();

  assert!(
    !agent_files.is_empty(),
    ".opencode/agents should contain at least one file"
  );

  for file in &agent_files {
    let content = std::fs::read_to_string(file.path()).unwrap();
    let file_name = file.file_name().to_string_lossy().to_string();

    let mode = extract_mode_from_agent_file(&content);
    assert!(
      mode.is_some(),
      "agent file {} must have a `mode` field in YAML front matter",
      file_name
    );

    let mode = mode.unwrap();
    assert!(
      VALID_MODES.contains(&mode.as_str()),
      "agent file {} has invalid mode {:?}, must be one of {:?}",
      file_name,
      mode,
      VALID_MODES
    );
  }
}
