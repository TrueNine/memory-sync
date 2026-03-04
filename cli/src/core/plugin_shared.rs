//! Shared types and data structures for tnmsc plugins.
//!
//! Defines `CollectedInputContext`, `RelativePath`, plugin traits,
//! and other types shared between input plugins, CLI, and output runtime.

use std::collections::HashMap;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use serde_json::Value;

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
pub enum FilePathKind {
    Relative,
    Absolute,
    Root,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum IDEKind {
    VSCode,
    IntellijIDEA,
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
// Path types
// ---------------------------------------------------------------------------

/// Relative path with base path for computing absolute paths.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelativePath {
    pub path_kind: FilePathKind,
    pub path: String,
    pub base_path: String,
    /// Pre-computed absolute path for serialization to Node.js
    #[serde(skip_serializing_if = "Option::is_none")]
    pub absolute_path: Option<String>,
    /// Pre-computed directory name for serialization to Node.js
    #[serde(skip_serializing_if = "Option::is_none")]
    pub directory_name: Option<String>,
}

impl RelativePath {
    pub fn new(path: &str, base_path: &str) -> Self {
        let abs = PathBuf::from(base_path).join(path);
        let dir_name = PathBuf::from(path)
            .parent()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default();
        Self {
            path_kind: FilePathKind::Relative,
            path: path.to_string(),
            base_path: base_path.to_string(),
            absolute_path: Some(abs.to_string_lossy().into_owned()),
            directory_name: Some(dir_name),
        }
    }

    pub fn get_absolute_path(&self) -> String {
        self.absolute_path.clone().unwrap_or_else(|| {
            PathBuf::from(&self.base_path)
                .join(&self.path)
                .to_string_lossy()
                .into_owned()
        })
    }

    pub fn get_directory_name(&self) -> String {
        self.directory_name.clone().unwrap_or_else(|| {
            PathBuf::from(&self.path)
                .parent()
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or_default()
        })
    }
}

/// Root path (workspace root).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RootPath {
    pub path_kind: FilePathKind,
    pub path: String,
}

impl RootPath {
    pub fn new(path: &str) -> Self {
        Self {
            path_kind: FilePathKind::Root,
            path: path.to_string(),
        }
    }
}

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
    pub globs: Vec<String>,
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
    pub globs: Vec<String>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub series: Option<String>,
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
    pub series: Option<String>,
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
    pub relative_path: String,
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
    pub command: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub env: Option<HashMap<String, String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disabled: Option<bool>,
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
    pub dir: RelativePath,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub markdown_contents: Option<Vec<Value>>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub markdown_contents: Option<Vec<Value>>,
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
    pub root_memory_prompt: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub child_memory_prompts: Option<Vec<Value>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_prompt_source_project: Option<bool>,
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
// CollectedInputContext — the main bridge type
// ---------------------------------------------------------------------------

/// All collected input information, serialized from Rust to Node.js output runtime.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectedInputContext {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace: Option<Workspace>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vscode_config_files: Option<Vec<ProjectIDEConfigFile>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub jetbrains_config_files: Option<Vec<ProjectIDEConfigFile>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub editor_config_files: Option<Vec<ProjectIDEConfigFile>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fast_commands: Option<Vec<FastCommandPrompt>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sub_agents: Option<Vec<SubAgentPrompt>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skills: Option<Vec<SkillPrompt>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rules: Option<Vec<RulePrompt>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub global_memory: Option<GlobalMemoryPrompt>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub global_git_ignore: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shadow_git_exclude: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shadow_source_project_dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub readme_prompts: Option<Vec<ReadmePrompt>>,
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
    fn test_collected_input_context_default() {
        let ctx = CollectedInputContext::default();
        assert!(ctx.workspace.is_none());
        assert!(ctx.fast_commands.is_none());
    }

    #[test]
    fn test_collected_input_context_serialize() {
        let ctx = CollectedInputContext {
            workspace: Some(Workspace {
                directory: RootPath::new("/workspace"),
                projects: vec![],
            }),
            global_git_ignore: Some("node_modules/\n".to_string()),
            ..Default::default()
        };
        let json = serde_json::to_string(&ctx).unwrap();
        assert!(json.contains("workspace"));
        assert!(json.contains("globalGitIgnore"));
        // Fields that are None should not appear
        assert!(!json.contains("fastCommands"));
    }

    #[test]
    fn test_collected_input_context_roundtrip() {
        let ctx = CollectedInputContext {
            workspace: Some(Workspace {
                directory: RootPath::new("/workspace"),
                projects: vec![Project {
                    name: Some("test-project".into()),
                    ..Default::default()
                }],
            }),
            fast_commands: Some(vec![FastCommandPrompt {
                prompt_type: PromptKind::FastCommand,
                content: "# Test Command\n\nDo something.".into(),
                length: 30,
                dir: RelativePath::new("commands/test.mdx", "/workspace/aindex/dist"),
                command_name: "test".into(),
                series: Some("default".into()),
                global_only: None,
                yaml_front_matter: Some(FastCommandYAMLFrontMatter {
                    description: Some("A test command".into()),
                    ..Default::default()
                }),
                raw_mdx_content: None,
                markdown_contents: None,
            }]),
            ..Default::default()
        };

        let json = serde_json::to_string_pretty(&ctx).unwrap();
        let parsed: CollectedInputContext = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.workspace.as_ref().unwrap().projects.len(), 1);
        assert_eq!(parsed.fast_commands.as_ref().unwrap().len(), 1);
        assert_eq!(parsed.fast_commands.as_ref().unwrap()[0].command_name, "test");
    }

    #[test]
    fn test_rule_prompt_serialize() {
        let rule = RulePrompt {
            prompt_type: PromptKind::Rule,
            content: "# Rule\n\nDo this.".into(),
            length: 17,
            dir: RelativePath::new("rules/default/test.mdx", "/workspace/aindex/dist"),
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
        assert_eq!(serde_json::to_string(&PromptKind::FastCommand).unwrap(), "\"FastCommand\"");
        assert_eq!(serde_json::to_string(&RuleScope::Global).unwrap(), "\"global\"");
        assert_eq!(serde_json::to_string(&IDEKind::VSCode).unwrap(), "\"VSCode\"");
        assert_eq!(serde_json::to_string(&SkillResourceEncoding::Base64).unwrap(), "\"base64\"");
    }
}
