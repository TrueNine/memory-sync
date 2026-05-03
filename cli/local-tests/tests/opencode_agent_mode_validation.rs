//! 回归测试：验证 opencode agent 的 `mode` 字段值在合法集合内。
//!
//! 这些检查运行在隔离的临时 HOME/workspace 夹具中，避免受到宿主机
//! `~/.aindex/.tnmsc.json` 或真实项目提示词库存的影响。

#[path = "support/opencode.rs"]
mod opencode_support;

use opencode_support::IsolatedOpencodeFixture;

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

  let after_key = trimmed
    .strip_prefix("mode")
    .and_then(|s| s.strip_prefix(':'))
    .map(|s| s.trim())
    .unwrap_or("");
  if after_key.is_empty() {
    return None;
  }

  let value = if after_key.len() >= 2
    && ((after_key.starts_with('"') && after_key.ends_with('"'))
      || (after_key.starts_with('\'') && after_key.ends_with('\'')))
  {
    &after_key[1..after_key.len() - 1]
  } else {
    after_key
  };

  Some(value.to_string())
}

/// 从 agent 文件的 YAML front matter 中提取 `mode` 值。
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
      }
      break;
    }

    // issue #381: opencode agent mode validation should run against an isolated
    // fixture so protected host paths do not mask schema regressions.
    if in_front_matter && let Some(mode) = extract_mode_from_front_matter_line(line) {
      return Some(mode);
    }
  }

  None
}

#[test]
fn local_opencode_agent_mode_must_be_valid() {
  let fixture = IsolatedOpencodeFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before opencode mode validation");
  fixture
    .install()
    .assert_success("isolated tnmsc install for opencode mode validation");

  let agent_files: Vec<_> = std::fs::read_dir(fixture.project_agents_dir())
    .unwrap()
    .flatten()
    .filter(|entry| entry.file_type().map(|ft| ft.is_file()).unwrap_or(false))
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
