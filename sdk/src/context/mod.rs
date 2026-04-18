use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub root: PathBuf,
    pub projects: Vec<Project>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub root_dir: PathBuf,
    pub root_memory_prompt: Option<PromptContent>,
    pub child_memory_prompts: Option<Vec<ChildPrompt>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChildPrompt {
    pub dir: PathBuf,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptContent {
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectedInputContext {
    pub workspace: Option<Workspace>,
    pub global_memory: Option<String>,
    pub project_prompts: Option<Vec<String>>,
    pub skill_prompts: Option<Vec<String>>,
    pub command_prompts: Option<Vec<String>>,
    pub subagent_prompts: Option<Vec<String>>,
    pub rule_prompts: Option<Vec<String>>,
    pub readme_prompts: Option<Vec<String>>,
}