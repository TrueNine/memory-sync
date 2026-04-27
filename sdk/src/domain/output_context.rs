use serde::{Deserialize, Serialize};

use crate::domain::plugin_shared::{
  AIAgentIgnoreConfigFile, SlashCommandPrompt, GlobalMemoryPrompt, ProjectIDEConfigFile,
  ReadmePrompt, RulePrompt, SkillPrompt, SubAgentPrompt, Workspace,
};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputContext {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub workspace: Option<Workspace>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub vscode_config_files: Option<Vec<ProjectIDEConfigFile>>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub zed_config_files: Option<Vec<ProjectIDEConfigFile>>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub jetbrains_config_files: Option<Vec<ProjectIDEConfigFile>>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub editor_config_files: Option<Vec<ProjectIDEConfigFile>>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub slash_commands: Option<Vec<SlashCommandPrompt>>,
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
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub ai_agent_ignore_config_files: Option<Vec<AIAgentIgnoreConfigFile>>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub registered_output_plugins: Option<Vec<String>>,
}

impl OutputContext {
  pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
    serde_json::from_str(json)
  }

  pub fn to_json(&self) -> Result<String, serde_json::Error> {
    serde_json::to_string(self)
  }
}
