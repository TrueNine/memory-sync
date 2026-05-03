use crate::md_compiler::{MdxGlobalScope, MdxToMdOptions, mdx_to_md_with_metadata};
use serde_json::Value;

#[derive(Debug, Clone)]
pub struct PromptArtifact {
  pub raw_mdx: String,
  pub content: String,
  pub metadata: serde_json::Map<String, Value>,
  pub last_modified: i64,
}

fn has_tag_like_mdx(content: &str) -> bool {
  let bytes = content.as_bytes();
  let mut index = 0;

  while index + 1 < bytes.len() {
    if bytes[index] == b'<' {
      let next = bytes[index + 1];
      if next.is_ascii_alphabetic() || next == b'/' || next == b'_' || next == b'$' {
        return true;
      }
    }
    index += 1;
  }

  false
}

fn has_expression_like_mdx(content: &str) -> bool {
  let bytes = content.as_bytes();
  let mut index = 0;

  while index + 1 < bytes.len() {
    if bytes[index] == b'{' {
      let next = bytes[index + 1];
      if next.is_ascii_alphabetic() || next == b'_' || next == b'$' {
        return true;
      }
    }
    index += 1;
  }

  false
}

fn should_compile_dist_artifact(content: &str) -> bool {
  let trimmed = content.trim_start();
  trimmed.starts_with("---")
    || trimmed.starts_with("export default")
    || content
      .lines()
      .any(|line| line.trim_start().starts_with("export const "))
    || has_tag_like_mdx(content)
    || has_expression_like_mdx(content)
}

pub fn read_prompt_artifact(
  file_path: &str,
  mode: &str,
  global_scope_json: Option<&str>,
) -> Result<PromptArtifact, String> {
  let raw_mdx = std::fs::read_to_string(file_path).map_err(|e| e.to_string())?;

  let metadata = std::fs::metadata(file_path).map_err(|e| e.to_string())?;
  let last_modified = metadata
    .modified()
    .ok()
    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
    .map(|d| d.as_millis() as i64)
    .unwrap_or(0);

  let global_scope: Option<MdxGlobalScope> =
    global_scope_json.and_then(|s| serde_json::from_str(s).ok());

  if mode == "dist" {
    if !should_compile_dist_artifact(&raw_mdx) {
      return Ok(PromptArtifact {
        raw_mdx: raw_mdx.clone(),
        content: raw_mdx,
        metadata: serde_json::Map::new(),
        last_modified,
      });
    }

    let opts = MdxToMdOptions {
      global_scope,
      extract_metadata: true,
      ..Default::default()
    };
    let result = mdx_to_md_with_metadata(&raw_mdx, Some(opts))?;

    Ok(PromptArtifact {
      raw_mdx,
      content: result.content,
      metadata: result.metadata.exports.into_iter().collect(),
      last_modified,
    })
  } else {
    Ok(PromptArtifact {
      raw_mdx: raw_mdx.clone(),
      content: raw_mdx,
      metadata: serde_json::Map::new(),
      last_modified,
    })
  }
}

/// Walk a compiled prompt's text and reject any leftover ESM-style
/// module syntax (`export default`, `export const`, `import`) that
/// should have been stripped by `mdx_to_md_with_metadata`. Lines
/// inside fenced code blocks (``` / ~~~) are skipped so legitimately
/// quoted JS examples don't trip the check.
///
/// `#254` centralizes the helper that used to be duplicated in both
/// `skill.rs` and `project_prompt.rs`, so residual-module checks now
/// have a single in-tree source of truth.
pub fn assert_no_residual_module_syntax(content: &str, file_path: &str) -> Result<(), String> {
  let code_fence_pattern = regex_lite::Regex::new(r"^\s*(```|~~~)").unwrap();
  let residual_patterns = [
    regex_lite::Regex::new(r"^\s*export\s+default\b").unwrap(),
    regex_lite::Regex::new(r"^\s*export\s+const\b").unwrap(),
    regex_lite::Regex::new(r"^\s*import\b").unwrap(),
  ];
  let mut active_fence: Option<&str> = None;
  for (index, line) in content.lines().enumerate() {
    if let Some(caps) = code_fence_pattern.captures(line) {
      let marker = caps.get(1).map(|m| m.as_str()).unwrap_or("");
      if active_fence.is_none() {
        active_fence = Some(marker);
      } else if active_fence == Some(marker) {
        active_fence = None;
      }
      continue;
    }
    if active_fence.is_some() {
      continue;
    }
    for pat in &residual_patterns {
      if pat.is_match(line) {
        return Err(format!(
          "Compiled prompt still contains residual module syntax at {}:{}: {}",
          file_path,
          index + 1,
          line.trim()
        ));
      }
    }
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::{assert_no_residual_module_syntax, should_compile_dist_artifact};

  #[test]
  fn plain_markdown_dist_prompt_skips_compilation() {
    assert!(!should_compile_dist_artifact(
      "- **Small projects (<100,000 RMB)**: Sign directly as natural person\n"
    ));
  }

  #[test]
  fn dist_prompt_with_mdx_metadata_still_compiles() {
    assert!(should_compile_dist_artifact(
      "export default { scope: 'project' }\n\n# Title\n"
    ));
    assert!(should_compile_dist_artifact("Platform: {os.platform}\n"));
    assert!(should_compile_dist_artifact("<Md when={true}>ok</Md>\n"));
  }

  #[test]
  fn assert_no_residual_module_syntax_passes_clean_markdown() {
    let body = "# Title\n\nA paragraph.\n";
    assert!(assert_no_residual_module_syntax(body, "ok.md").is_ok());
  }

  #[test]
  fn assert_no_residual_module_syntax_rejects_export_default() {
    let body = "# Title\nexport default { scope: 'project' }\n";
    let err = assert_no_residual_module_syntax(body, "bad.md").unwrap_err();
    assert!(err.contains("residual module syntax"));
    assert!(err.contains("bad.md:2"));
  }

  #[test]
  fn assert_no_residual_module_syntax_rejects_import() {
    let body = "import x from 'y'\n# Title\n";
    let err = assert_no_residual_module_syntax(body, "bad.md").unwrap_err();
    assert!(err.contains("bad.md:1"));
  }

  #[test]
  fn assert_no_residual_module_syntax_skips_code_fences() {
    // `import …` inside a fenced JS example is documentation, not
    // residual module syntax.
    let body = "# Title\n\n```js\nimport { foo } from 'bar';\n```\n";
    assert!(assert_no_residual_module_syntax(body, "ok.md").is_ok());
  }

  #[test]
  fn assert_no_residual_module_syntax_skips_tilde_fences() {
    let body = "# Title\n\n~~~ts\nexport default {}\n~~~\n";
    assert!(assert_no_residual_module_syntax(body, "ok.md").is_ok());
  }
}
