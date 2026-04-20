//! Shared types and data structures for tnmsc plugins.
//!
//! Defines `CollectedInputContext`, `RelativePath`, plugin traits,
//! and other types shared between input plugins, CLI, and output runtime.

pub use crate::infra::path_types::{FilePathKind, RelativePath, RootPath};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PluginKind {
  Input,
  Output,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PromptKind {
  GlobalMemory,
  ProjectRootMemory,
  ProjectChildrenMemory,
  FastCommand,
  SubAgent,
  Skill,
  SkillChildDoc,
  SkillResource,
  SkillMcpConfig,
  Readme,
  Rule,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RuleScope {
  Project,
  Global,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum IDEKind {
  VSCode,
  IntellijIDEA,
  Zed,
  Git,
  EditorConfig,
  Original,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum NamingCaseKind {
  CamelCase,
  PascalCase,
  SnakeCase,
  KebabCase,
  UpperCase,
  LowerCase,
  Original,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SkillResourceEncoding {
  Text,
  Base64,
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
  pub level: String,
  pub code: String,
  pub title: String,
  #[serde(skip_serializing_if = "Option::is_none", default)]
  pub exact_fix: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugLog {
  pub message: String,
  #[serde(skip_serializing_if = "Option::is_none", default)]
  pub payload: Option<Value>,
}

// ---------------------------------------------------------------------------
// Path types (re-exported from infra)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// YAML front matter types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YAMLFrontMatter {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub naming_case: Option<NamingCaseKind>,
  #[serde(flatten)]
  pub extra: HashMap<String, Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommonYAMLFrontMatter {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub description: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub naming_case: Option<NamingCaseKind>,
  #[serde(flatten)]
  pub extra: HashMap<String, Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleYAMLFrontMatter {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub description: Option<String>,
  #[serde(default)]
  pub paths: Vec<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub scope: Option<RuleScope>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub seri_name: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub naming_case: Option<NamingCaseKind>,
  #[serde(flatten)]
  pub extra: HashMap<String, Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FastCommandYAMLFrontMatter {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub description: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub argument_hint: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub allow_tools: Option<Vec<String>>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub seri_name: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub scope: Option<RuleScope>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub naming_case: Option<NamingCaseKind>,
  #[serde(flatten)]
  pub extra: HashMap<String, Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubAgentYAMLFrontMatter {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub name: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub description: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub model: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub color: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub argument_hint: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub allow_tools: Option<Vec<String>>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub seri_name: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub scope: Option<RuleScope>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub naming_case: Option<NamingCaseKind>,
  #[serde(flatten)]
  pub extra: HashMap<String, Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillYAMLFrontMatter {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub name: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub description: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub display_name: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub author: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub version: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub keywords: Option<Vec<String>>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub allow_tools: Option<Vec<String>>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub naming_case: Option<NamingCaseKind>,
  #[serde(flatten)]
  pub extra: HashMap<String, Value>,
}

// ---------------------------------------------------------------------------
// Prompt types
// ---------------------------------------------------------------------------

/// Rule prompt with glob patterns.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RulePrompt {
  #[serde(rename = "type")]
  pub prompt_type: PromptKind,
  pub content: String,
  pub length: usize,
  pub dir: RelativePath,
  pub series: String,
  pub rule_name: String,
  pub paths: Vec<String>,
  pub scope: RuleScope,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub seri_name: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub yaml_front_matter: Option<RuleYAMLFrontMatter>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub raw_mdx_content: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub markdown_contents: Option<Vec<Value>>,
}

/// Fast command prompt.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FastCommandPrompt {
  #[serde(rename = "type")]
  pub prompt_type: PromptKind,
  pub content: String,
  pub length: usize,
  pub dir: RelativePath,
  pub command_name: String,
  #[serde(
    default,
    rename = "commandPrefix",
    skip_serializing_if = "Option::is_none"
  )]
  pub series: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub seri_name: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub global_only: Option<bool>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub yaml_front_matter: Option<FastCommandYAMLFrontMatter>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub raw_mdx_content: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub markdown_contents: Option<Vec<Value>>,
}

/// Sub-agent prompt.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubAgentPrompt {
  #[serde(rename = "type")]
  pub prompt_type: PromptKind,
  pub content: String,
  pub length: usize,
  pub dir: RelativePath,
  pub agent_name: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub agent_prefix: Option<String>,
  pub canonical_name: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub yaml_front_matter: Option<SubAgentYAMLFrontMatter>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub raw_mdx_content: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub markdown_contents: Option<Vec<Value>>,
}

/// Skill child document.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillChildDoc {
  #[serde(rename = "type")]
  pub prompt_type: PromptKind,
  pub content: String,
  pub length: usize,
  pub file_path_kind: FilePathKind,
  pub relative_path: String,
  pub dir: RelativePath,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub raw_front_matter: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub markdown_ast: Option<Value>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub markdown_contents: Option<Vec<Value>>,
}

/// Skill resource file.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillResource {
  #[serde(rename = "type")]
  pub prompt_type: PromptKind,
  pub extension: String,
  pub file_name: String,
  pub relative_path: String,
  pub content: String,
  pub encoding: SkillResourceEncoding,
  pub length: usize,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub mime_type: Option<String>,
}

/// MCP server configuration entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub command: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub args: Option<Vec<String>>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub env: Option<HashMap<String, String>>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub url: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub server_url: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub headers: Option<HashMap<String, String>>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub disabled: Option<bool>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub disabled_tools: Option<Vec<String>>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub auto_approve: Option<Vec<String>>,
}

/// Skill MCP configuration (mcp.json).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillMcpConfig {
  #[serde(rename = "type")]
  pub prompt_type: PromptKind,
  pub mcp_servers: HashMap<String, McpServerConfig>,
  pub raw_content: String,
}

/// Skill prompt.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillPrompt {
  #[serde(rename = "type")]
  pub prompt_type: PromptKind,
  pub content: String,
  pub length: usize,
  pub skill_name: String,
  pub dir: RelativePath,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub yaml_front_matter: Option<SkillYAMLFrontMatter>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub mcp_config: Option<SkillMcpConfig>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub child_docs: Option<Vec<SkillChildDoc>>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub resources: Option<Vec<SkillResource>>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub markdown_contents: Option<Vec<Value>>,
}

/// Global memory prompt.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalMemoryPrompt {
  #[serde(rename = "type")]
  pub prompt_type: PromptKind,
  pub content: String,
  pub length: usize,
  pub file_path_kind: FilePathKind,
  pub dir: RelativePath,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub raw_front_matter: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub markdown_contents: Option<Vec<Value>>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub parent_directory_path: Option<Value>,
}

/// Project root memory prompt.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRootMemoryPrompt {
  #[serde(rename = "type")]
  pub prompt_type: PromptKind,
  pub content: String,
  pub length: usize,
  pub file_path_kind: FilePathKind,
  pub dir: RootPath,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub yaml_front_matter: Option<Value>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub raw_front_matter: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub markdown_ast: Option<Value>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub markdown_contents: Option<Vec<Value>>,
}

/// Project children memory prompt.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectChildrenMemoryPrompt {
  #[serde(rename = "type")]
  pub prompt_type: PromptKind,
  pub content: String,
  pub length: usize,
  pub file_path_kind: FilePathKind,
  pub dir: RelativePath,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub yaml_front_matter: Option<Value>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub raw_front_matter: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub markdown_ast: Option<Value>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub markdown_contents: Option<Vec<Value>>,
  pub working_child_directory_path: RelativePath,
}

/// Readme prompt.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadmePrompt {
  #[serde(rename = "type")]
  pub prompt_type: PromptKind,
  pub content: String,
  pub length: usize,
  pub dir: RelativePath,
  pub project_name: String,
  pub target_dir: RelativePath,
  pub is_root: bool,
  pub file_kind: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub markdown_contents: Option<Vec<Value>>,
}

// ---------------------------------------------------------------------------
// AI Agent ignore config file
// ---------------------------------------------------------------------------

/// AI Agent ignore configuration file.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AIAgentIgnoreConfigFile {
  pub file_name: String,
  pub content: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub source_path: Option<String>,
}

// ---------------------------------------------------------------------------
// IDE config types
// ---------------------------------------------------------------------------

/// IDE configuration file.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectIDEConfigFile {
  #[serde(rename = "type")]
  pub ide_type: IDEKind,
  pub content: String,
  pub length: usize,
  pub dir: RelativePath,
  pub file_path_kind: FilePathKind,
}

// ---------------------------------------------------------------------------
// Project & Workspace
// ---------------------------------------------------------------------------

/// Project within a workspace.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub name: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub dir_from_workspace_path: Option<RelativePath>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub root_memory_prompt: Option<ProjectRootMemoryPrompt>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub child_memory_prompts: Option<Vec<ProjectChildrenMemoryPrompt>>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub is_prompt_source_project: Option<bool>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub is_workspace_root_project: Option<bool>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub project_type: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub project_config: Option<Value>,
}

/// Workspace containing projects.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
  pub directory: RootPath,
  #[serde(default)]
  pub projects: Vec<Project>,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_relative_path() {
    let rp = RelativePath::new("src/skills/test.mdx", "/home/user/workspace/aindex");
    assert_eq!(rp.path, "src/skills/test.mdx");
    assert_eq!(rp.base_path, "/home/user/workspace/aindex");
    assert!(rp.get_absolute_path().contains("src/skills/test.mdx"));
    assert_eq!(rp.get_directory_name(), "src/skills");
  }

  #[test]
  fn test_relative_path_accepts_missing_base_path_for_absolute_shapes() {
    let parsed: RelativePath = serde_json::from_str(
      r#"{
        "pathKind": "absolute",
        "path": "/workspace/.vscode/settings.json"
      }"#,
    )
    .unwrap();
    assert_eq!(parsed.base_path, "");
    assert_eq!(
      parsed.get_absolute_path(),
      "/workspace/.vscode/settings.json"
    );
  }

  #[test]
  fn test_rule_prompt_serialize() {
    let rule = RulePrompt {
      prompt_type: PromptKind::Rule,
      content: "# Rule\n\nDo this.".into(),
      length: 17,
      dir: RelativePath::new("rules/default/test.mdx", "/workspace/aindex"),
      series: "default".into(),
      rule_name: "test".into(),
      globs: vec!["**/*.ts".into(), "**/*.tsx".into()],
      scope: RuleScope::Project,
      seri_name: None,
      yaml_front_matter: None,
      raw_mdx_content: None,
      markdown_contents: None,
    };
    let json = serde_json::to_string(&rule).unwrap();
    assert!(json.contains("\"type\":\"Rule\""));
    assert!(json.contains("\"globs\""));
  }

  #[test]
  fn test_enums_serialize() {
    assert_eq!(
      serde_json::to_string(&PromptKind::FastCommand).unwrap(),
      "\"FastCommand\""
    );
    assert_eq!(
      serde_json::to_string(&RuleScope::Global).unwrap(),
      "\"global\""
    );
    assert_eq!(
      serde_json::to_string(&IDEKind::VSCode).unwrap(),
      "\"VSCode\""
    );
    assert_eq!(
      serde_json::to_string(&SkillResourceEncoding::Base64).unwrap(),
      "\"base64\""
    );
  }
}
