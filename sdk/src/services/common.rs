use std::path::{Path, PathBuf};

use serde::de::DeserializeOwned;
use serde_json::{Value, json};

use crate::CliError;
use crate::context::OutputContext;
use crate::domain::config::{self, ConfigLoader, PluginsConfig, UserConfigFile};
use crate::infra::logger::Logger;

// ---------------------------------------------------------------------------
// Plugin defaults
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy)]
pub enum DefaultPluginKind {
  Install,
  DryRun,
  Clean,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct EnabledPlugins {
  pub agents_md: bool,
  pub claude_code: bool,
  pub codex: bool,
  pub cursor: bool,
  pub droid: bool,
  pub gemini: bool,
  pub git: bool,
  pub jetbrains: bool,
  pub jetbrains_code_style: bool,
  pub kiro: bool,
  pub opencode: bool,
  pub qoder: bool,
  pub readme: bool,
  pub trae: bool,
  pub trae_cn: bool,
  pub vscode: bool,
  pub warp: bool,
  pub windsurf: bool,
  pub zed: bool,
}

impl EnabledPlugins {
  pub fn from_config(config: Option<&PluginsConfig>, kind: DefaultPluginKind) -> Self {
    let (claude_default, opencode_default) = match kind {
      DefaultPluginKind::DryRun => (false, false),
      _ => (true, true),
    };

    Self {
      agents_md: config.and_then(|v| v.agents_md).unwrap_or(true),
      claude_code: config.and_then(|v| v.claude_code).unwrap_or(claude_default),
      codex: config.and_then(|v| v.codex).unwrap_or(false),
      cursor: config.and_then(|v| v.cursor).unwrap_or(false),
      droid: config.and_then(|v| v.droid).unwrap_or(false),
      gemini: config.and_then(|v| v.gemini).unwrap_or(false),
      git: config.and_then(|v| v.git).unwrap_or(true),
      jetbrains: config.and_then(|v| v.jetbrains).unwrap_or(false),
      jetbrains_code_style: config.and_then(|v| v.jetbrains_code_style).unwrap_or(false),
      kiro: config.and_then(|v| v.kiro).unwrap_or(false),
      opencode: config.and_then(|v| v.opencode).unwrap_or(opencode_default),
      qoder: config.and_then(|v| v.qoder).unwrap_or(false),
      readme: config.and_then(|v| v.readme).unwrap_or(true),
      trae: config.and_then(|v| v.trae).unwrap_or(false),
      trae_cn: config.and_then(|v| v.trae_cn).unwrap_or(false),
      vscode: config.and_then(|v| v.vscode).unwrap_or(false),
      warp: config.and_then(|v| v.warp).unwrap_or(false),
      windsurf: config.and_then(|v| v.windsurf).unwrap_or(false),
      zed: config.and_then(|v| v.zed).unwrap_or(false),
    }
  }

  pub fn is_enabled(self, plugin_name: &str) -> bool {
    match plugin_name {
      "AgentsOutputAdaptor" => self.agents_md,
      "GitExcludeOutputAdaptor" => self.git,
      "JetBrainsIDECodeStyleConfigOutputAdaptor" => self.jetbrains_code_style,
      "VisualStudioCodeIDEConfigOutputAdaptor" => self.vscode,
      "ZedIDEConfigOutputAdaptor" => self.zed,
      "ReadmeMdConfigFileOutputAdaptor" => self.readme,
      "ClaudeCodeCLIOutputAdaptor" => self.claude_code,
      "CodexCLIOutputAdaptor" => self.codex,
      "CursorOutputAdaptor" => self.cursor,
      "DroidCLIOutputAdaptor" => self.droid,
      "GeminiCLIOutputAdaptor" => self.gemini,
      "JetBrainsAIAssistantCodexOutputAdaptor" => self.jetbrains,
      "KiroCLIOutputAdaptor" => self.kiro,
      "OpencodeCLIOutputAdaptor" => self.opencode,
      "QoderIDEPluginOutputAdaptor" => self.qoder,
      "TraeOutputAdaptor" => self.trae || self.trae_cn,
      "WarpIDEOutputAdaptor" => self.warp,
      "WindsurfOutputAdaptor" => self.windsurf,
      _ => false,
    }
  }

  pub fn registered_plugins(self) -> Vec<String> {
    let mut plugins = Vec::new();
    for plugin_name in [
      "AgentsOutputAdaptor",
      "GitExcludeOutputAdaptor",
      "JetBrainsIDECodeStyleConfigOutputAdaptor",
      "VisualStudioCodeIDEConfigOutputAdaptor",
      "ZedIDEConfigOutputAdaptor",
      "ReadmeMdConfigFileOutputAdaptor",
      "ClaudeCodeCLIOutputAdaptor",
      "CodexCLIOutputAdaptor",
      "CursorOutputAdaptor",
      "DroidCLIOutputAdaptor",
      "GeminiCLIOutputAdaptor",
      "JetBrainsAIAssistantCodexOutputAdaptor",
      "KiroCLIOutputAdaptor",
      "OpencodeCLIOutputAdaptor",
      "QoderIDEPluginOutputAdaptor",
      "TraeOutputAdaptor",
      "WarpIDEOutputAdaptor",
      "WindsurfOutputAdaptor",
    ] {
      if self.is_enabled(plugin_name) {
        plugins.push(plugin_name.to_string());
      }
    }
    plugins
  }
}

// ---------------------------------------------------------------------------
// Envelopes for JSON deserialization
// ---------------------------------------------------------------------------

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceEnvelope {
  pub workspace: crate::domain::plugin_shared::Workspace,
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalMemoryEnvelope {
  #[serde(default)]
  pub global_memory: Option<crate::domain::plugin_shared::GlobalMemoryPrompt>,
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandsEnvelope {
  #[serde(default)]
  pub commands: Vec<crate::domain::plugin_shared::FastCommandPrompt>,
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubAgentsEnvelope {
  #[serde(default)]
  pub sub_agents: Vec<crate::domain::plugin_shared::SubAgentPrompt>,
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsEnvelope {
  #[serde(default)]
  pub skills: Vec<crate::domain::plugin_shared::SkillPrompt>,
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RulesEnvelope {
  #[serde(default)]
  pub rules: Vec<crate::domain::plugin_shared::RulePrompt>,
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadmeEnvelope {
  #[serde(default)]
  pub readme_prompts: Vec<crate::domain::plugin_shared::ReadmePrompt>,
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitIgnoreEnvelope {
  #[serde(default)]
  pub global_git_ignore: Option<String>,
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitExcludeEnvelope {
  #[serde(default)]
  pub shadow_git_exclude: Option<String>,
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedIgnoreEnvelope {
  #[serde(default)]
  pub ai_agent_ignore_config_files:
    Option<Vec<crate::domain::plugin_shared::AIAgentIgnoreConfigFile>>,
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VSCodeEnvelope {
  #[serde(default)]
  pub vscode_config_files: Option<Vec<crate::domain::plugin_shared::ProjectIDEConfigFile>>,
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZedEnvelope {
  #[serde(default)]
  pub zed_config_files: Option<Vec<crate::domain::plugin_shared::ProjectIDEConfigFile>>,
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JetBrainsEnvelope {
  #[serde(default)]
  pub jetbrains_config_files: Option<Vec<crate::domain::plugin_shared::ProjectIDEConfigFile>>,
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorConfigEnvelope {
  #[serde(default)]
  pub editor_config_files: Option<Vec<crate::domain::plugin_shared::ProjectIDEConfigFile>>,
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

pub fn resolve_cwd(cwd: Option<&str>) -> Result<PathBuf, CliError> {
  match cwd {
    Some(value) => Ok(config::resolve_workspace_dir(value)),
    None => std::env::current_dir().map_err(CliError::IoError),
  }
}

pub fn load_config(
  cwd: &Path,
  load_user_config: Option<bool>,
) -> Result<config::MergedConfigResult, CliError> {
  if load_user_config == Some(false) {
    return Ok(config::MergedConfigResult {
      config: UserConfigFile::default(),
      sources: vec![],
      found: false,
    });
  }

  let result = ConfigLoader::with_defaults()
    .try_load(cwd)
    .map_err(CliError::ConfigError)?;

  if !result.found {
    let config_path = config::get_required_global_config_path()
      .unwrap_or_else(|_| config::get_global_config_path());
    return Err(CliError::ConfigError(format!(
      "Required config file not found at {}. Please create it before running tnmsc.",
      config_path.display()
    )));
  }

  Ok(result)
}

pub fn resolve_workspace_dir(_cwd: &Path, config: &UserConfigFile) -> Result<PathBuf, CliError> {
  match config.workspace_dir.as_deref() {
    Some(dir) => Ok(config::resolve_workspace_dir(dir)),
    None => Err(CliError::ConfigError(
      "workspaceDir is required but was not configured. Please set workspaceDir in your .tnmsc.json config file.".to_string(),
    )),
  }
}

pub fn build_global_scope(config: &UserConfigFile) -> Option<Value> {
  let mut scope = serde_json::Map::new();

  let mut os = serde_json::Map::new();
  os.insert("platform".to_string(), json!(std::env::consts::OS));
  os.insert("arch".to_string(), json!(std::env::consts::ARCH));
  os.insert("name".to_string(), json!(std::env::consts::OS));
  scope.insert("os".to_string(), Value::Object(os));

  if let Some(profile) = config.profile.as_ref() {
    let mut value = serde_json::Map::new();
    if let Some(name) = profile.name.as_ref() {
      value.insert("name".to_string(), json!(name));
    }
    if let Some(username) = profile.username.as_ref() {
      value.insert("username".to_string(), json!(username));
    }
    if let Some(gender) = profile.gender.as_ref() {
      value.insert("gender".to_string(), json!(gender));
    }
    if let Some(birthday) = profile.birthday.as_ref() {
      value.insert("birthday".to_string(), json!(birthday));
    }
    for (key, extra) in &profile.extra {
      value.insert(key.clone(), extra.clone());
    }
    if !value.is_empty() {
      scope.insert("profile".to_string(), Value::Object(value));
    }
  }

  if let Some(code_styles) = config.code_styles.as_ref() {
    let mut value = serde_json::Map::new();
    if let Some(indent) = code_styles.indent {
      value.insert(
        "indent".to_string(),
        json!(match indent {
          config::CodeStyleIndent::Tab => "tab",
          config::CodeStyleIndent::Space => "space",
        }),
      );
    }
    if let Some(tab_size) = code_styles.tab_size {
      value.insert("tabSize".to_string(), json!(tab_size));
    }
    for (key, extra) in &code_styles.extra {
      value.insert(key.clone(), extra.clone());
    }
    if !value.is_empty() {
      scope.insert("codeStyles".to_string(), Value::Object(value));
    }
  }

  let mut tool = serde_json::Map::new();
  tool.insert("name".to_string(), json!("tnmsc"));
  tool.insert("version".to_string(), json!(crate::version()));
  scope.insert("tool".to_string(), Value::Object(tool));

  (!scope.is_empty()).then(|| Value::Object(scope))
}

pub fn strip_unc_prefix(path: &Path) -> PathBuf {
  let s = path.to_string_lossy();
  if let Some(stripped) = s.strip_prefix(r"\\?\") {
    PathBuf::from(stripped)
  } else {
    path.to_path_buf()
  }
}

pub fn count_missing_directories(dir: &Path) -> usize {
  let mut missing = Vec::new();
  let mut current = Some(dir);

  while let Some(path) = current {
    if path.exists() {
      break;
    }
    missing.push(path.to_path_buf());
    current = path.parent();
  }

  missing.len()
}

// ---------------------------------------------------------------------------
// JSON collection helpers
// ---------------------------------------------------------------------------

pub fn collect_json<T>(
  collector: impl Fn(&str) -> Result<String, CliError>,
  input: Value,
) -> Result<T, CliError>
where
  T: DeserializeOwned,
{
  let raw = collector(&input.to_string())?;
  serde_json::from_str(&raw).map_err(CliError::SerializationError)
}

// ---------------------------------------------------------------------------
// Context collection
// ---------------------------------------------------------------------------

pub fn collect_context(
  workspace_dir: &str,
  global_scope: Option<&Value>,
  enabled_plugins: &EnabledPlugins,
  logger: &Logger,
) -> Result<OutputContext, CliError> {
  let aindex = {
    let _span = logger.span("collect.aindex_resolvers").enter();
    collect_json::<WorkspaceEnvelope>(
      crate::repositories::aindex_resolvers::collect_aindex_resolvers,
      json!({ "workspaceDir": workspace_dir }),
    )?
  };

  let project_prompts = {
    let _span = logger.span("collect.project_prompt").enter();
    collect_json::<WorkspaceEnvelope>(
      crate::repositories::project_prompt::collect_project_prompt,
      json!({
        "workspaceDir": workspace_dir,
        "workspace": aindex.workspace,
        "globalScope": global_scope,
      }),
    )?
  };

  let global_memory = {
    let _span = logger.span("collect.global_memory").enter();
    collect_json::<GlobalMemoryEnvelope>(
      crate::repositories::global_memory::collect_global_memory,
      json!({ "workspaceDir": workspace_dir, "globalScope": global_scope }),
    )?
  };

  let commands = {
    let _span = logger.span("collect.command").enter();
    collect_json::<CommandsEnvelope>(
      crate::repositories::command::collect_command,
      json!({ "workspaceDir": workspace_dir, "globalScope": global_scope }),
    )?
  };
  let sub_agents = {
    let _span = logger.span("collect.subagent").enter();
    collect_json::<SubAgentsEnvelope>(
      crate::repositories::subagent::collect_subagent,
      json!({ "workspaceDir": workspace_dir, "globalScope": global_scope }),
    )?
  };
  let skills = {
    let _span = logger.span("collect.skill").enter();
    collect_json::<SkillsEnvelope>(
      crate::repositories::skill::collect_skill,
      json!({ "workspaceDir": workspace_dir, "globalScope": global_scope }),
    )?
  };
  let rules = {
    let _span = logger.span("collect.rule").enter();
    collect_json::<RulesEnvelope>(
      crate::repositories::rule::collect_rule,
      json!({ "workspaceDir": workspace_dir, "globalScope": global_scope }),
    )?
  };
  let readme = {
    let _span = logger.span("collect.readme").enter();
    collect_json::<ReadmeEnvelope>(
      crate::repositories::readme::collect_readme,
      json!({ "workspaceDir": workspace_dir, "globalScope": global_scope }),
    )?
  };
  let gitignore = {
    let _span = logger.span("collect.gitignore").enter();
    collect_json::<GitIgnoreEnvelope>(
      crate::repositories::gitignore::collect_gitignore,
      json!({ "workspaceDir": workspace_dir }),
    )?
  };
  let git_exclude = {
    let _span = logger.span("collect.git_exclude").enter();
    collect_json::<GitExcludeEnvelope>(
      crate::repositories::git_exclude::collect_git_exclude,
      json!({ "workspaceDir": workspace_dir }),
    )?
  };
  let shared_ignore = {
    let _span = logger.span("collect.shared_ignore").enter();
    collect_json::<SharedIgnoreEnvelope>(
      crate::repositories::shared_ignore::collect_shared_ignore,
      json!({ "workspaceDir": workspace_dir }),
    )?
  };
  let vscode = {
    let _span = logger.span("collect.vscode_config").enter();
    collect_json::<VSCodeEnvelope>(
      crate::repositories::vscode_config::collect_vscode_config,
      json!({ "workspaceDir": workspace_dir }),
    )?
  };
  let zed = {
    let _span = logger.span("collect.zed_config").enter();
    collect_json::<ZedEnvelope>(
      crate::repositories::zed_config::collect_zed_config,
      json!({ "workspaceDir": workspace_dir }),
    )?
  };
  let jetbrains = {
    let _span = logger.span("collect.jetbrains_config").enter();
    collect_json::<JetBrainsEnvelope>(
      crate::repositories::jetbrains_config::collect_jetbrains_config,
      json!({ "workspaceDir": workspace_dir }),
    )?
  };
  let editor_config = {
    let _span = logger.span("collect.editorconfig").enter();
    collect_json::<EditorConfigEnvelope>(
      crate::repositories::editorconfig::collect_editorconfig,
      json!({ "workspaceDir": workspace_dir }),
    )?
  };

  Ok(OutputContext {
    workspace: Some(project_prompts.workspace),
    vscode_config_files: vscode.vscode_config_files,
    zed_config_files: zed.zed_config_files,
    jetbrains_config_files: jetbrains.jetbrains_config_files,
    editor_config_files: editor_config.editor_config_files,
    fast_commands: (!commands.commands.is_empty()).then_some(commands.commands),
    sub_agents: (!sub_agents.sub_agents.is_empty()).then_some(sub_agents.sub_agents),
    skills: (!skills.skills.is_empty()).then_some(skills.skills),
    rules: (!rules.rules.is_empty()).then_some(rules.rules),
    global_memory: global_memory.global_memory,
    global_git_ignore: gitignore.global_git_ignore,
    shadow_git_exclude: git_exclude.shadow_git_exclude,
    shadow_source_project_dir: None,
    readme_prompts: (!readme.readme_prompts.is_empty()).then_some(readme.readme_prompts),
    ai_agent_ignore_config_files: shared_ignore.ai_agent_ignore_config_files,
    registered_output_plugins: Some(enabled_plugins.registered_plugins()),
  })
}
