//! 隔离规则源文件格式回归测试。
//!
//! 核心断言：
//! 1. aindex 规则源文件使用 `globs`，不直接暴露 `paths`
//! 2. SDK 在输出阶段会把 `globs` 转成下游规则文件中的 `paths`

use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

use tnmsc_local_tests::LocalTestRunner;

struct IsolatedRulesFixture {
  runner: LocalTestRunner,
  temp_home: PathBuf,
  project_dir: PathBuf,
  aindex_dir: PathBuf,
}

impl IsolatedRulesFixture {
  fn new() -> Self {
    let temp_root = std::env::temp_dir().join(format!(
      "tnmsc-local-rules-{}-{}",
      std::process::id(),
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
    ));
    let temp_home = temp_root.join("home");
    let workspace_dir = temp_root.join("workspace");
    let project_dir = workspace_dir.join("memory-sync");
    let aindex_dir = workspace_dir.join("aindex");
    let rules_dir = aindex_dir.join("rules").join("qa");
    let aindex_project_dir = aindex_dir.join("app").join("memory-sync");

    fs::create_dir_all(temp_home.join(".aindex")).unwrap();
    fs::create_dir_all(&project_dir).unwrap();
    fs::create_dir_all(&rules_dir).unwrap();
    fs::create_dir_all(&aindex_project_dir).unwrap();

    // issue local-tests-rules-isolation: rules smoke tests must validate
    // globs-to-paths conversion in a self-owned fixture instead of the host workspace.
    write_rules_config(&temp_home, &workspace_dir);
    write_rules_prompt_sources(&aindex_dir, &aindex_project_dir);

    Self {
      runner: LocalTestRunner::with_cwd(&project_dir),
      temp_home,
      project_dir,
      aindex_dir,
    }
  }

  fn env_home(&self) -> String {
    self.temp_home.to_string_lossy().into_owned()
  }

  fn run(&self, args: &[&str]) -> tnmsc_local_tests::CommandResult {
    let temp_home = self.env_home();
    self
      .runner
      .run_at_with_env(&self.project_dir, args, &[("HOME", &temp_home)])
  }

  fn clean(&self) -> tnmsc_local_tests::CommandResult {
    self.run(&["clean"])
  }

  fn install(&self) -> tnmsc_local_tests::CommandResult {
    self.run(&["install"])
  }
}

fn write_rules_config(temp_home: &Path, workspace_dir: &Path) {
  fs::write(
    temp_home.join(".aindex").join(".tnmsc.json"),
    serde_json::json!({
      "workspaceDir": workspace_dir.to_string_lossy(),
      "plugins": {
        "agentsMd": false,
        "git": false,
        "readme": false,
        "vscode": false,
        "zed": false,
        "jetbrains": false,
        "jetbrainsCodeStyle": false,
        "claudeCode": true,
        "codex": false,
        "cursor": false,
        "droid": false,
        "gemini": false,
        "kiro": false,
        "opencode": false,
        "qoder": false,
        "trae": false,
        "traeCn": false,
        "windsurf": false
      }
    })
    .to_string(),
  )
  .unwrap();
}

fn write_rules_prompt_sources(aindex_dir: &Path, aindex_project_dir: &Path) {
  fs::write(
    aindex_dir.join("global.mdx"),
    "# Global memory\n\nRules fixture global memory\n",
  )
  .unwrap();
  fs::write(
    aindex_dir.join("workspace.mdx"),
    "# Workspace memory\n\nRules fixture workspace memory\n",
  )
  .unwrap();
  fs::write(
    aindex_dir.join("workspace.src.mdx"),
    "# Workspace memory\n\nRules fixture workspace memory\n",
  )
  .unwrap();
  fs::write(
    aindex_project_dir.join("agt.mdx"),
    "# Project rules memory\n\nProject rule instructions\n",
  )
  .unwrap();

  fs::write(
    aindex_dir.join("rules").join("qa").join("boot.src.mdx"),
    "export default {\n  description: 'QA boot rule source',\n  globs: ['**/*.rs', '**/*.toml'],\n  scope: 'project',\n}\n\n# Rule source\n",
  )
  .unwrap();
  fs::write(
    aindex_dir.join("rules").join("qa").join("boot.mdx"),
    "export default {\n  description: 'QA boot rule source',\n  globs: ['**/*.rs', '**/*.toml'],\n  scope: 'project',\n}\n\n# Rule source\n",
  )
  .unwrap();
}

/// 从文件内容中提取 export default { ... } 的对象字面体字符串。
fn extract_export_default_object(content: &str) -> Option<String> {
  let prefix_index = content.find("export default")?;
  let mut object_start = prefix_index + "export default".len();

  while let Some(ch) = content[object_start..].chars().next() {
    if !ch.is_whitespace() {
      break;
    }
    object_start += ch.len_utf8();
  }

  if content[object_start..].chars().next()? != '{' {
    return None;
  }

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
      '"' | '\'' | '`' => in_string = Some(ch),
      '/' if next == Some('/') => in_line_comment = true,
      '/' if next == Some('*') => in_block_comment = true,
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

fn collect_src_mdx_files(dir: &Path) -> Vec<PathBuf> {
  let mut files = Vec::new();
  let Ok(entries) = fs::read_dir(dir) else {
    return files;
  };
  for entry in entries.flatten() {
    let path = entry.path();
    let Ok(file_type) = entry.file_type() else {
      continue;
    };
    if file_type.is_dir() {
      files.extend(collect_src_mdx_files(&path));
    } else if let Some(name) = path.file_name().and_then(|name| name.to_str())
      && name.ends_with(".src.mdx")
    {
      files.push(path);
    }
  }
  files
}

#[test]
fn local_rules_src_mdx_uses_globs_not_paths() {
  let fixture = IsolatedRulesFixture::new();
  let rules_dir = fixture.aindex_dir.join("rules");

  let src_files = collect_src_mdx_files(&rules_dir);
  assert!(
    !src_files.is_empty(),
    "aindex/rules should contain at least one .src.mdx file"
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

    let parsed: Result<serde_json::Value, _> = json5::from_str(&object_literal);
    let Ok(Value::Object(map)) = parsed else {
      failures.push(format!(
        "  - {}: failed to parse export default object: {:?}",
        file_path.display(),
        parsed.err()
      ));
      continue;
    };

    let has_globs = map.get("globs").is_some_and(|value| {
      value
        .as_array()
        .is_some_and(|items| !items.is_empty() && items.iter().all(|item| item.is_string()))
    });
    if !has_globs {
      failures.push(format!(
        "  - {}: missing or invalid 'globs' field in export default",
        file_path.display()
      ));
    }

    if map.contains_key("paths") {
      failures.push(format!(
        "  - {}: must not contain 'paths' field (use 'globs' instead)",
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
  let fixture = IsolatedRulesFixture::new();

  fixture
    .clean()
    .assert_success("isolated tnmsc clean before rules install");
  fixture
    .install()
    .assert_failure("isolated tnmsc install should surface protected workspace CLAUDE.md");

  let rules_dir = fixture.project_dir.join(".claude").join("rules");
  assert!(
    rules_dir.is_dir(),
    "project .claude/rules should exist after install"
  );

  let rule_files: Vec<_> = fs::read_dir(&rules_dir)
    .unwrap()
    .flatten()
    .map(|entry| entry.path())
    .filter(|path| path.is_file() && path.extension().and_then(|ext| ext.to_str()) == Some("md"))
    .collect();
  assert!(
    !rule_files.is_empty(),
    "project .claude/rules should contain at least one generated rule file"
  );

  let mut failures = Vec::new();

  for file_path in &rule_files {
    let content = fs::read_to_string(file_path).expect("should read generated rule file");
    let has_paths = content.contains("paths:");
    let has_globs = content.contains("globs:");

    if !has_paths {
      failures.push(format!(
        "  - {}: missing 'paths' in YAML front matter",
        file_path.display()
      ));
    }
    if has_globs {
      // issue #383: generated downstream rule files must expose `paths`, not
      // raw `globs`, so consumers only see the normalized schema.
      failures.push(format!(
        "  - {}: must not contain 'globs' in output (should be converted to 'paths')",
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
