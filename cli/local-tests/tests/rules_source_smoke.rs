//! 本地裸机规则源文件格式回归测试。
//!
//! **核心设计断言**：aindex 中的规则源文件（*.src.mdx）的 export default 中
//! 必须使用 `globs` 字段来描述匹配模式，而非 `paths`。
//! SDK 负责在输出时将 `globs` 转换为 `paths`，源文件本身不应对外暴露 `paths`。

use serde_json::Value;
use std::fs;
use std::path::Path;

use tnmsc_local_tests::LocalTestRunner;

/// 从文件内容中提取 export default { ... } 的对象字面体字符串。
fn extract_export_default_object(content: &str) -> Option<String> {
  let prefix_index = content.find("export default")?;
  let mut object_start = prefix_index + "export default".len();

  // 跳过 export default 后面的空白字符
  while let Some(ch) = content[object_start..].chars().next() {
    if !ch.is_whitespace() {
      break;
    }
    object_start += ch.len_utf8();
  }

  // 必须以 '{' 开头
  if content[object_start..].chars().next()? != '{' {
    return None;
  }

  // 用括号深度匹配提取对象字面体
  let mut depth = 0usize;
  let mut in_string: Option<char> = None;
  let mut escaped = false;
  let mut in_line_comment = false;
  let mut in_block_comment = false;

  for (relative_index, ch) in content[object_start..].char_indices() {
    let absolute_index = object_start + relative_index;
    let next = content[absolute_index + ch.len_utf8()..].chars().next();

    if in_line_comment {
      if ch == '\n' {
        in_line_comment = false;
      }
      continue;
    }

    if in_block_comment {
      if ch == '*' && next == Some('/') {
        in_block_comment = false;
      }
      continue;
    }

    if escaped {
      escaped = false;
      continue;
    }

    if let Some(quote) = in_string {
      if ch == '\\' {
        escaped = true;
        continue;
      }
      if ch == quote {
        in_string = None;
      }
      continue;
    }

    match ch {
      '"' | '\'' | '`' => {
        in_string = Some(ch);
      }
      '/' if next == Some('/') => {
        in_line_comment = true;
      }
      '/' if next == Some('*') => {
        in_block_comment = true;
      }
      '{' => depth += 1,
      '}' => {
        depth = depth.saturating_sub(1);
        if depth == 0 {
          let end_index = absolute_index + ch.len_utf8();
          return Some(content[object_start..end_index].to_string());
        }
      }
      _ => {}
    }
  }

  None
}

/// 递归收集指定目录下的所有 .src.mdx 文件。
fn collect_src_mdx_files(dir: &Path) -> Vec<std::path::PathBuf> {
  let mut files = Vec::new();
  let Ok(entries) = fs::read_dir(dir) else {
    return files;
  };
  for entry in entries.flatten() {
    let path = entry.path();
    let Ok(ft) = entry.file_type() else {
      continue;
    };
    if ft.is_dir() {
      files.extend(collect_src_mdx_files(&path));
    } else if let Some(name) = path.file_name().and_then(|n| n.to_str())
      && name.ends_with(".src.mdx")
    {
      files.push(path);
    }
  }
  files
}

#[test]
fn local_rules_src_mdx_uses_globs_not_paths() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let aindex_dir = runner
    .resolve_aindex_dir()
    .expect("aindex dir should be resolvable");
  let rules_dir = aindex_dir.join("rules");

  assert!(
    rules_dir.is_dir(),
    "aindex/rules/ directory should exist: {}",
    rules_dir.display()
  );

  let src_files = collect_src_mdx_files(&rules_dir);
  assert!(
    !src_files.is_empty(),
    "aindex/rules/ should contain at least one .src.mdx file"
  );

  let mut failures = Vec::new();

  for file_path in &src_files {
    let content = fs::read_to_string(file_path).expect("should read rule source file");

    let Some(object_literal) = extract_export_default_object(&content) else {
      failures.push(format!(
        "  - {}: missing export default {{ ... }}",
        file_path.display()
      ));
      continue;
    };

    // 使用 json5 解析对象字面体
    let parsed: Result<serde_json::Value, _> = json5::from_str(&object_literal);
    let Ok(Value::Object(map)) = parsed else {
      failures.push(format!(
        "  - {}: failed to parse export default object: {:?}",
        file_path.display(),
        parsed.err()
      ));
      continue;
    };

    // 断言必须包含 globs 字段
    let has_globs = map.get("globs").is_some_and(|v| {
      v.as_array()
        .is_some_and(|a| !a.is_empty() && a.iter().all(|v| v.is_string()))
    });
    if !has_globs {
      failures.push(format!(
        "  - {}: missing or invalid 'globs' field in export default",
        file_path.display()
      ));
    }

    // 断言不能包含 paths 字段
    if map.contains_key("paths") {
      failures.push(format!(
        "  - {}: must NOT contain 'paths' field (use 'globs' instead)",
        file_path.display()
      ));
    }
  }

  assert!(
    failures.is_empty(),
    "rule source file format violations ({} of {} files):\n{}",
    failures.len(),
    src_files.len(),
    failures.join("\n")
  );
}

#[test]
fn local_rules_globs_converted_to_paths_in_output() {
  let runner = LocalTestRunner::new();
  runner.assert_project_ready();

  let clean = runner.clean();
  clean.assert_success("tnmsc clean before install");

  let install = runner.install();
  install.assert_success("tnmsc install");

  // 读取生成的规则文件，验证输出中使用的是 paths 而非 globs
  // Claude Code 插件生成 .claude/rules/*.md
  let rules_dir = runner.cwd().join(".claude").join("rules");
  if !rules_dir.is_dir() {
    // 如果项目没有匹配的规则，跳过此测试
    return;
  }

  let mut rule_files = Vec::new();
  let Ok(entries) = fs::read_dir(&rules_dir) else {
    return;
  };
  for entry in entries.flatten() {
    let path = entry.path();
    if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("md") {
      rule_files.push(path);
    }
  }

  if rule_files.is_empty() {
    return;
  }

  let mut failures = Vec::new();

  for file_path in &rule_files {
    let content = fs::read_to_string(file_path).expect("should read generated rule file");

    // 检查 YAML front matter 中是否包含 paths
    let has_paths = content.contains("paths:");
    // 检查是否错误地保留了 globs
    let has_globs = content.contains("globs:");

    if !has_paths {
      failures.push(format!(
        "  - {}: missing 'paths' in YAML front matter",
        file_path.display()
      ));
    }
    if has_globs {
      failures.push(format!(
        "  - {}: must NOT contain 'globs' in output (should be converted to 'paths')",
        file_path.display()
      ));
    }
  }

  assert!(
    failures.is_empty(),
    "rule output format violations:\n{}",
    failures.join("\n")
  );
}
