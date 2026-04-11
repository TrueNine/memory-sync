use std::path::Path;

use serde::Deserialize;
use serde_json::Value;

use crate::core::input_plugins::localized_reader::read_flat_files;
use crate::core::plugin_shared::{
  PromptKind, RelativePath, SubAgentPrompt, SubAgentYAMLFrontMatter,
};

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubAgentInputOptions {
  workspace_dir: String,
  #[serde(default)]
  aindex: Option<SubAgentAindexInput>,
  #[serde(default)]
  global_scope: Option<Value>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubAgentAindexInput {
  #[serde(default)]
  dir: Option<String>,
  #[serde(default)]
  sub_agents: Option<SubAgentPair>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubAgentPair {
  #[serde(default)]
  src: Option<String>,
  #[serde(default)]
  dist: Option<String>,
}

fn derive_subagent_identity(name: &str) -> (Option<String>, String, String) {
  let normalized = name
    .replace('\\', "/")
    .trim_start_matches('/')
    .trim_end_matches('/')
    .to_string();
  let segments: Vec<&str> = normalized.split('/').filter(|s| !s.is_empty()).collect();

  let agent_name = segments.last().copied().unwrap_or(&normalized).to_string();
  let prefix = if segments.len() > 1 {
    Some(segments[..segments.len() - 1].join("-"))
  } else {
    None
  };
  let canonical_name = if segments.is_empty() {
    agent_name.clone()
  } else {
    segments.join("-")
  };

  (prefix, agent_name, canonical_name)
}

fn validate_subagent_metadata(
  metadata: &serde_json::Map<String, Value>,
  file_path: &str,
) -> Result<(), String> {
  let prefix = if file_path.is_empty() {
    "".to_string()
  } else {
    format!(" in {file_path}")
  };

  match metadata.get("description") {
    Some(Value::String(s)) if !s.is_empty() => {}
    _ => {
      return Err(format!(
        r#"Missing or empty required field "description"{prefix}"#
      ));
    }
  }

  if let Some(scope) = metadata.get("scope") {
    let s = match scope {
      Value::String(s) => s.as_str(),
      _ => {
        return Err(format!(
          r#"Field "scope" must be "project" or "global"{prefix}"#
        ));
      }
    };
    if s != "project" && s != "global" {
      return Err(format!(
        r#"Field "scope" must be "project" or "global"{prefix}"#
      ));
    }
  }

  Ok(())
}

fn build_subagent_prompt(
  entry: &crate::core::input_plugins::localized_reader::FlatFileEntry,
  dist_dir: &str,
  diagnostics: &mut Vec<crate::core::plugin_shared::Diagnostic>,
) -> Result<SubAgentPrompt, crate::CliError> {
  let dist = entry
    .dist
    .as_ref()
    .ok_or_else(|| crate::CliError::ConfigError("Missing compiled dist prompt".to_string()))?;

  let file_path = format!("{}/{}.mdx", dist_dir, entry.name);
  validate_subagent_metadata(&dist.metadata, &file_path).map_err(crate::CliError::ConfigError)?;

  let (agent_prefix, agent_name, canonical_name) = derive_subagent_identity(&entry.name);

  // Remove authored `name` field so it is ignored in favor of the derived identity.
  let mut metadata = dist.metadata.clone();
  let had_authored_name = metadata.contains_key("name");
  metadata.remove("name");

  if had_authored_name {
    diagnostics.push(crate::core::plugin_shared::Diagnostic {
      level: "warn".to_string(),
      code: "SUBAGENT_NAME_IGNORED".to_string(),
      title: format!(
        "Subagent name metadata is ignored in favor of derived identity \"{}\"",
        canonical_name
      ),
      exact_fix: None,
    });
  }

  let yaml_front_matter = if metadata.is_empty() {
    None
  } else {
    Some(
      serde_json::from_value::<SubAgentYAMLFrontMatter>(Value::Object(metadata))
        .map_err(|e| crate::CliError::ConfigError(e.to_string()))?,
    )
  };

  let content = dist.content.clone();
  let length = content.len();

  Ok(SubAgentPrompt {
    prompt_type: PromptKind::SubAgent,
    content,
    length,
    dir: RelativePath::new(&format!("{}.mdx", entry.name), dist_dir),
    agent_name,
    agent_prefix,
    canonical_name,
    yaml_front_matter,
    raw_mdx_content: Some(dist.raw_mdx.clone()),
    markdown_contents: None,
  })
}

pub fn collect_subagent(options_json: &str) -> Result<String, crate::CliError> {
  let options: SubAgentInputOptions =
    serde_json::from_str(options_json).map_err(|e| crate::CliError::ConfigError(e.to_string()))?;

  let workspace_dir = Path::new(&options.workspace_dir)
    .canonicalize()
    .unwrap_or_else(|_| Path::new(&options.workspace_dir).to_path_buf());
  let workspace_dir_str = workspace_dir.to_string_lossy().into_owned();

  let aindex_dir_name = options
    .aindex
    .as_ref()
    .and_then(|a| a.dir.clone())
    .unwrap_or_else(|| "aindex".to_string());
  let aindex_dir = Path::new(&workspace_dir_str).join(aindex_dir_name);

  let src_dir = aindex_dir.join(
    options
      .aindex
      .as_ref()
      .and_then(|a| a.sub_agents.as_ref().and_then(|r| r.src.clone()))
      .unwrap_or_else(|| "subagents".to_string()),
  );
  let dist_dir = aindex_dir.join(
    options
      .aindex
      .as_ref()
      .and_then(|a| a.sub_agents.as_ref().and_then(|r| r.dist.clone()))
      .unwrap_or_else(|| "dist/subagents".to_string()),
  );

  let src_dir_str = src_dir.to_string_lossy().into_owned();
  let dist_dir_str = dist_dir.to_string_lossy().into_owned();

  let global_scope_json = options.global_scope.as_ref().map(|v| v.to_string());

  let entries = read_flat_files(&src_dir_str, &dist_dir_str, global_scope_json.as_deref())?;

  let mut prompts: Vec<SubAgentPrompt> = Vec::new();
  let mut diagnostics: Vec<crate::core::plugin_shared::Diagnostic> = Vec::new();
  for entry in &entries {
    if entry.dist.is_none() && (entry.src_zh.is_some() || entry.src_en.is_some()) {
      return Err(crate::CliError::ConfigError(
        "Missing compiled dist prompt".to_string(),
      ));
    }
    if entry.dist.is_some() {
      prompts.push(build_subagent_prompt(
        entry,
        &dist_dir_str,
        &mut diagnostics,
      )?);
    }
  }

  let mut debug_logs: Vec<crate::core::plugin_shared::DebugLog> = Vec::new();
  if !prompts.is_empty() {
    debug_logs.push(crate::core::plugin_shared::DebugLog {
      message: "Subagents collected".to_string(),
      payload: Some(serde_json::json!({ "count": prompts.len() })),
    });
  }

  #[derive(Debug, Clone, serde::Serialize)]
  #[serde(rename_all = "camelCase")]
  struct SubAgentResult {
    sub_agents: Vec<SubAgentPrompt>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    diagnostics: Vec<crate::core::plugin_shared::Diagnostic>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    debug_logs: Vec<crate::core::plugin_shared::DebugLog>,
  }

  let result = SubAgentResult {
    sub_agents: prompts,
    diagnostics,
    debug_logs,
  };
  serde_json::to_string(&result).map_err(crate::CliError::SerializationError)
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;
  use tempfile::TempDir;

  #[test]
  fn collect_subagent_prefers_dist_and_compiles_mdx() {
    let tmp = TempDir::new().unwrap();
    let src_dir = tmp.path().join("aindex").join("subagents");
    let dist_dir = tmp.path().join("aindex").join("dist").join("subagents");
    fs::create_dir_all(&src_dir).unwrap();
    fs::create_dir_all(&dist_dir).unwrap();
    fs::write(
      src_dir.join("demo.src.mdx"),
      "---\ndescription: src\n---\nSubAgent source",
    )
    .unwrap();
    fs::write(
      dist_dir.join("demo.mdx"),
      "---\ndescription: dist\n---\nexport const x = 1\n\nSubAgent dist",
    )
    .unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_subagent(&options.to_string()).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
    let sub_agents = parsed["subAgents"].as_array().unwrap();
    assert_eq!(sub_agents.len(), 1);
    assert_eq!(sub_agents[0]["agentName"], "demo");
    assert_eq!(sub_agents[0]["canonicalName"], "demo");
    assert!(
      sub_agents[0]["content"]
        .as_str()
        .unwrap()
        .contains("SubAgent dist")
    );
    assert!(
      !sub_agents[0]["content"]
        .as_str()
        .unwrap()
        .contains("SubAgent source")
    );
    assert!(
      !sub_agents[0]["content"]
        .as_str()
        .unwrap()
        .contains("export const x = 1")
    );
    assert_eq!(sub_agents[0]["yamlFrontMatter"]["description"], "dist");
    assert!(
      sub_agents[0]["rawMdxContent"]
        .as_str()
        .unwrap()
        .contains("export const x = 1")
    );
  }

  #[test]
  fn collect_subagent_extracts_directory_prefix() {
    let tmp = TempDir::new().unwrap();
    let src_dir = tmp.path().join("aindex").join("subagents").join("qa");
    let dist_dir = tmp
      .path()
      .join("aindex")
      .join("dist")
      .join("subagents")
      .join("qa");
    fs::create_dir_all(&src_dir).unwrap();
    fs::create_dir_all(&dist_dir).unwrap();
    fs::write(
      src_dir.join("boot.src.mdx"),
      "---\ndescription: qa boot src\n---\nSubAgent source",
    )
    .unwrap();
    fs::write(
      dist_dir.join("boot.mdx"),
      "---\ndescription: qa boot dist\n---\nSubAgent dist",
    )
    .unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_subagent(&options.to_string()).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
    let sub_agents = parsed["subAgents"].as_array().unwrap();
    assert_eq!(sub_agents.len(), 1);
    assert_eq!(sub_agents[0]["agentPrefix"], "qa");
    assert_eq!(sub_agents[0]["agentName"], "boot");
    assert_eq!(sub_agents[0]["canonicalName"], "qa-boot");
  }

  #[test]
  fn collect_subagent_dist_only() {
    let tmp = TempDir::new().unwrap();
    let dist_dir = tmp.path().join("aindex").join("dist").join("subagents");
    fs::create_dir_all(&dist_dir).unwrap();
    fs::write(
      dist_dir.join("demo.mdx"),
      "---\ndescription: dist only\n---\nDist only subagent",
    )
    .unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_subagent(&options.to_string()).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
    let sub_agents = parsed["subAgents"].as_array().unwrap();
    assert_eq!(sub_agents.len(), 1);
    assert_eq!(sub_agents[0]["agentName"], "demo");
    assert_eq!(sub_agents[0]["canonicalName"], "demo");
    assert!(
      sub_agents[0]["content"]
        .as_str()
        .unwrap()
        .contains("Dist only subagent")
    );
  }

  #[test]
  fn collect_subagent_fails_on_source_only() {
    let tmp = TempDir::new().unwrap();
    let src_dir = tmp.path().join("aindex").join("subagents");
    fs::create_dir_all(&src_dir).unwrap();
    fs::write(
      src_dir.join("demo.src.mdx"),
      "---\ndescription: source only\n---\nSource only subagent",
    )
    .unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_subagent(&options.to_string());
    assert!(result.is_err());
    assert!(
      result
        .unwrap_err()
        .to_string()
        .contains("Missing compiled dist prompt")
    );
  }

  #[test]
  fn collect_subagent_rejects_workspace_scope() {
    let tmp = TempDir::new().unwrap();
    let dist_dir = tmp.path().join("aindex").join("dist").join("subagents");
    fs::create_dir_all(&dist_dir).unwrap();
    fs::write(
      dist_dir.join("demo.mdx"),
      "---\ndescription: dist only\nscope: workspace\n---\nDist only subagent",
    )
    .unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_subagent(&options.to_string());
    assert!(result.is_err());
    assert!(
      result
        .unwrap_err()
        .to_string()
        .contains(r#"Field "scope" must be "project" or "global""#)
    );
  }

  #[test]
  fn collect_subagent_ignores_authored_name() {
    let tmp = TempDir::new().unwrap();
    let src_dir = tmp.path().join("aindex").join("subagents").join("qa");
    let dist_dir = tmp
      .path()
      .join("aindex")
      .join("dist")
      .join("subagents")
      .join("qa");
    fs::create_dir_all(&src_dir).unwrap();
    fs::create_dir_all(&dist_dir).unwrap();
    fs::write(
      src_dir.join("boot.src.mdx"),
      "---\nname: review-helper\ndescription: src\n---\nSubAgent source",
    )
    .unwrap();
    fs::write(
      dist_dir.join("boot.mdx"),
      "---\nname: review-helper\ndescription: dist\n---\nSubAgent dist",
    )
    .unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_subagent(&options.to_string()).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
    let sub_agents = parsed["subAgents"].as_array().unwrap();
    assert_eq!(sub_agents[0]["canonicalName"], "qa-boot");
    assert!(sub_agents[0]["yamlFrontMatter"]["name"].is_null());
    let diagnostics = parsed["diagnostics"].as_array().unwrap();
    assert!(
      diagnostics
        .iter()
        .any(|d| d["code"] == "SUBAGENT_NAME_IGNORED")
    );
  }
}
