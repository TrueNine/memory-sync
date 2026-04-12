use serde_json::Value;
use crate::md_compiler::{MdxGlobalScope, MdxToMdOptions, mdx_to_md_with_metadata};

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
    let result = mdx_to_md_with_metadata(&raw_mdx, Some(opts)).map_err(|e| e)?;

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

#[cfg(test)]
mod tests {
  use super::should_compile_dist_artifact;

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
}
