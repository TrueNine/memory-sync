use serde_json::Value;
use tnmsc_md_compiler::{MdxGlobalScope, MdxToMdOptions, mdx_to_md_with_metadata};

#[derive(Debug, Clone)]
pub struct PromptArtifact {
  pub raw_mdx: String,
  pub content: String,
  pub metadata: serde_json::Map<String, Value>,
  pub last_modified: i64,
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
