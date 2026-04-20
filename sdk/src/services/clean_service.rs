use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde_json::{Value, json};

use crate::context::OutputContext;
use crate::domain::config::{self, ConfigLoader, PluginsConfig, UserConfigFile};
use crate::policy::cleanup::{
  CleanupDeclarationsDto, CleanupSnapshot, CleanupTargetDto, CleanupTargetKindDto,
  PluginCleanupSnapshotDto,
};
use crate::{CliError, MemorySyncCommandOptions, MemorySyncCommandResult};

pub fn clean(options: MemorySyncCommandOptions) -> Result<MemorySyncCommandResult, CliError> {
  let cwd = resolve_cwd(options.cwd.as_deref())?;
  let config_result = load_config(&cwd, options.load_user_config)?;
  let workspace_dir = resolve_workspace_dir(&cwd, &config_result.config)?;
  let workspace_dir_str = workspace_dir.to_string_lossy().into_owned();
  let global_scope = build_global_scope(&config_result.config);
  let enabled_plugins = EnabledPlugins::from_config(config_result.config.plugins.as_ref());

  let context = collect_context(&workspace_dir_str, global_scope.as_ref())?;
  let (output_map, cleanup_map) = build_output_map(&context, enabled_plugins)?;
  let snapshot = build_cleanup_snapshot(&workspace_dir_str, &output_map, &cleanup_map)?;

  if options.dry_run.unwrap_or(false) {
    let plan = crate::policy::cleanup::plan_cleanup(snapshot.clone())
      .map_err(|e| CliError::ExecutionError(e))?;
    Ok(MemorySyncCommandResult {
      success: plan.conflicts.is_empty() && plan.violations.is_empty(),
      files_affected: plan.files_to_delete.len() as i32,
      dirs_affected: plan.dirs_to_delete.len() as i32 + plan.empty_dirs_to_delete.len() as i32,
      message: Some(format!(
        "Dry run: Would delete {} files, {} directories, {} empty directories. Violations: {}, Conflicts: {}",
        plan.files_to_delete.len(),
        plan.dirs_to_delete.len(),
        plan.empty_dirs_to_delete.len(),
        plan.violations.len(),
        plan.conflicts.len()
      )),
      warnings: plan
        .violations
        .iter()
        .map(|v| {
          json!({
            "type": "violation",
            "target": v.target_path,
            "protected": v.protected_path,
            "reason": v.reason
          })
        })
        .collect(),
      errors: plan
        .conflicts
        .iter()
        .map(|c| {
          json!({
            "type": "conflict",
            "output": c.output_path,
            "protected": c.protected_path,
            "reason": c.reason
          })
        })
        .collect(),
    })
  } else {
    let result =
      crate::policy::cleanup::perform_cleanup(snapshot).map_err(|e| CliError::ExecutionError(e))?;
    Ok(MemorySyncCommandResult {
      success: result.errors.is_empty(),
      files_affected: result.deleted_files as i32,
      dirs_affected: result.deleted_dirs as i32,
      message: Some(format!(
        "Deleted {} files and {} directories",
        result.deleted_files, result.deleted_dirs
      )),
      warnings: Vec::new(),
      errors: result
        .errors
        .iter()
        .map(|e| {
          json!({
            "path": e.path,
            "kind": format!("{:?}", e.kind),
            "error": e.error
          })
        })
        .collect(),
    })
  }
}

fn resolve_cwd(cwd: Option<&str>) -> Result<PathBuf, CliError> {
  match cwd {
    Some(value) => Ok(config::resolve_workspace_dir(value)),
    None => std::env::current_dir().map_err(CliError::IoError),
  }
}

fn load_config(
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

fn resolve_workspace_dir(_cwd: &Path, config: &UserConfigFile) -> Result<PathBuf, CliError> {
  match config.workspace_dir.as_deref() {
    Some(dir) => Ok(config::resolve_workspace_dir(dir)),
    None => Err(CliError::ConfigError(
      "workspaceDir is required but was not configured. Please set workspaceDir in your .tnmsc.json config file.".to_string(),
    )),
  }
}

fn build_global_scope(config: &UserConfigFile) -> Option<Value> {
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

#[derive(Debug, Clone, Copy, Default)]
struct EnabledPlugins {
  agents_md: bool,
  claude_code: bool,
  codex: bool,
  cursor: bool,
  droid: bool,
  gemini: bool,
  git: bool,
  jetbrains: bool,
  jetbrains_code_style: bool,
  kiro: bool,
  opencode: bool,
  qoder: bool,
  readme: bool,
  trae: bool,
  trae_cn: bool,
  vscode: bool,
  warp: bool,
  windsurf: bool,
  zed: bool,
}

impl EnabledPlugins {
  fn from_config(config: Option<&PluginsConfig>) -> Self {
    Self {
      agents_md: config.and_then(|value| value.agents_md).unwrap_or(true),
      claude_code: config.and_then(|value| value.claude_code).unwrap_or(true),
      codex: config.and_then(|value| value.codex).unwrap_or(false),
      cursor: config.and_then(|value| value.cursor).unwrap_or(false),
      droid: config.and_then(|value| value.droid).unwrap_or(false),
      gemini: config.and_then(|value| value.gemini).unwrap_or(false),
      git: config.and_then(|value| value.git).unwrap_or(true),
      jetbrains: config.and_then(|value| value.jetbrains).unwrap_or(false),
      jetbrains_code_style: config
        .and_then(|value| value.jetbrains_code_style)
        .unwrap_or(false),
      kiro: config.and_then(|value| value.kiro).unwrap_or(false),
      opencode: config.and_then(|value| value.opencode).unwrap_or(true),
      qoder: config.and_then(|value| value.qoder).unwrap_or(false),
      readme: config.and_then(|value| value.readme).unwrap_or(true),
      trae: config.and_then(|value| value.trae).unwrap_or(false),
      trae_cn: config.and_then(|value| value.trae_cn).unwrap_or(false),
      vscode: config.and_then(|value| value.vscode).unwrap_or(false),
      warp: config.and_then(|value| value.warp).unwrap_or(false),
      windsurf: config.and_then(|value| value.windsurf).unwrap_or(false),
      zed: config.and_then(|value| value.zed).unwrap_or(false),
    }
  }

  fn is_enabled(self, plugin_name: &str) -> bool {
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
}

fn collect_context(
  workspace_dir: &str,
  _global_scope: Option<&Value>,
) -> Result<OutputContext, CliError> {
  #[derive(Debug, serde::Deserialize)]
  #[serde(rename_all = "camelCase")]
  struct WorkspaceEnvelope {
    workspace: crate::domain::plugin_shared::Workspace,
  }

  #[derive(Debug, Default, serde::Deserialize)]
  #[serde(rename_all = "camelCase")]
  struct GlobalMemoryEnvelope {
    #[serde(default)]
    global_memory: Option<crate::domain::plugin_shared::GlobalMemoryPrompt>,
  }

  #[derive(Debug, Default, serde::Deserialize)]
  #[serde(rename_all = "camelCase")]
  struct CommandsEnvelope {
    #[serde(default)]
    commands: Vec<crate::domain::plugin_shared::FastCommandPrompt>,
  }

  #[derive(Debug, Default, serde::Deserialize)]
  #[serde(rename_all = "camelCase")]
  struct SubAgentsEnvelope {
    #[serde(default)]
    sub_agents: Vec<crate::domain::plugin_shared::SubAgentPrompt>,
  }

  #[derive(Debug, Default, serde::Deserialize)]
  #[serde(rename_all = "camelCase")]
  struct SkillsEnvelope {
    #[serde(default)]
    skills: Vec<crate::domain::plugin_shared::SkillPrompt>,
  }

  #[derive(Debug, Default, serde::Deserialize)]
  #[serde(rename_all = "camelCase")]
  struct RulesEnvelope {
    #[serde(default)]
    rules: Vec<crate::domain::plugin_shared::RulePrompt>,
  }

  #[derive(Debug, Default, serde::Deserialize)]
  #[serde(rename_all = "camelCase")]
  struct ReadmeEnvelope {
    #[serde(default)]
    readme_prompts: Vec<crate::domain::plugin_shared::ReadmePrompt>,
  }

  #[derive(Debug, Default, serde::Deserialize)]
  #[serde(rename_all = "camelCase")]
  struct GitIgnoreEnvelope {
    #[serde(default)]
    global_git_ignore: Option<String>,
  }

  #[derive(Debug, Default, serde::Deserialize)]
  #[serde(rename_all = "camelCase")]
  struct GitExcludeEnvelope {
    #[serde(default)]
    shadow_git_exclude: Option<String>,
  }

  #[derive(Debug, Default, serde::Deserialize)]
  #[serde(rename_all = "camelCase")]
  struct SharedIgnoreEnvelope {
    #[serde(default)]
    ai_agent_ignore_config_files:
      Option<Vec<crate::domain::plugin_shared::AIAgentIgnoreConfigFile>>,
  }

  #[derive(Debug, Default, serde::Deserialize)]
  #[serde(rename_all = "camelCase")]
  struct VSCodeEnvelope {
    #[serde(default)]
    vscode_config_files: Option<Vec<crate::domain::plugin_shared::ProjectIDEConfigFile>>,
  }

  #[derive(Debug, Default, serde::Deserialize)]
  #[serde(rename_all = "camelCase")]
  struct ZedEnvelope {
    #[serde(default)]
    zed_config_files: Option<Vec<crate::domain::plugin_shared::ProjectIDEConfigFile>>,
  }

  #[derive(Debug, Default, serde::Deserialize)]
  #[serde(rename_all = "camelCase")]
  struct JetBrainsEnvelope {
    #[serde(default)]
    jetbrains_config_files: Option<Vec<crate::domain::plugin_shared::ProjectIDEConfigFile>>,
  }

  #[derive(Debug, Default, serde::Deserialize)]
  #[serde(rename_all = "camelCase")]
  struct EditorConfigEnvelope {
    #[serde(default)]
    editor_config_files: Option<Vec<crate::domain::plugin_shared::ProjectIDEConfigFile>>,
  }

  fn collect_json<T>(
    collector: impl Fn(&str) -> Result<String, CliError>,
    input: Value,
  ) -> Result<T, CliError>
  where
    T: serde::de::DeserializeOwned,
  {
    let raw = collector(&input.to_string())?;
    serde_json::from_str(&raw).map_err(CliError::SerializationError)
  }

  let aindex = collect_json::<WorkspaceEnvelope>(
    crate::repositories::aindex_resolvers::collect_aindex_resolvers,
    json!({ "workspaceDir": workspace_dir }),
  )?;

  let project_prompts = collect_json::<WorkspaceEnvelope>(
    crate::repositories::project_prompt::collect_project_prompt,
    json!({
      "workspaceDir": workspace_dir,
      "workspace": aindex.workspace,
      "globalScope": None::<Value>,
    }),
  )?;

  let global_memory = collect_json::<GlobalMemoryEnvelope>(
    crate::repositories::global_memory::collect_global_memory,
    json!({ "workspaceDir": workspace_dir, "globalScope": None::<Value> }),
  )?;

  let commands = collect_json::<CommandsEnvelope>(
    crate::repositories::command::collect_command,
    json!({ "workspaceDir": workspace_dir, "globalScope": None::<Value> }),
  )?;
  let sub_agents = collect_json::<SubAgentsEnvelope>(
    crate::repositories::subagent::collect_subagent,
    json!({ "workspaceDir": workspace_dir, "globalScope": None::<Value> }),
  )?;
  let skills = collect_json::<SkillsEnvelope>(
    crate::repositories::skill::collect_skill,
    json!({ "workspaceDir": workspace_dir, "globalScope": None::<Value> }),
  )?;
  let rules = collect_json::<RulesEnvelope>(
    crate::repositories::rule::collect_rule,
    json!({ "workspaceDir": workspace_dir, "globalScope": None::<Value> }),
  )?;
  let readme = collect_json::<ReadmeEnvelope>(
    crate::repositories::readme::collect_readme,
    json!({ "workspaceDir": workspace_dir, "globalScope": None::<Value> }),
  )?;
  let gitignore = collect_json::<GitIgnoreEnvelope>(
    crate::repositories::gitignore::collect_gitignore,
    json!({ "workspaceDir": workspace_dir }),
  )?;
  let git_exclude = collect_json::<GitExcludeEnvelope>(
    crate::repositories::git_exclude::collect_git_exclude,
    json!({ "workspaceDir": workspace_dir }),
  )?;
  let shared_ignore = collect_json::<SharedIgnoreEnvelope>(
    crate::repositories::shared_ignore::collect_shared_ignore,
    json!({ "workspaceDir": workspace_dir }),
  )?;
  let vscode = collect_json::<VSCodeEnvelope>(
    crate::repositories::vscode_config::collect_vscode_config,
    json!({ "workspaceDir": workspace_dir }),
  )?;
  let zed = collect_json::<ZedEnvelope>(
    crate::repositories::zed_config::collect_zed_config,
    json!({ "workspaceDir": workspace_dir }),
  )?;
  let jetbrains = collect_json::<JetBrainsEnvelope>(
    crate::repositories::jetbrains_config::collect_jetbrains_config,
    json!({ "workspaceDir": workspace_dir }),
  )?;
  let editor_config = collect_json::<EditorConfigEnvelope>(
    crate::repositories::editorconfig::collect_editorconfig,
    json!({ "workspaceDir": workspace_dir }),
  )?;

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
    registered_output_plugins: None,
  })
}

fn build_output_map(
  context: &OutputContext,
  enabled_plugins: EnabledPlugins,
) -> Result<(HashMap<String, Vec<String>>, HashMap<String, CleanupDeclarationsDto>), CliError> {
  let mut output_map: HashMap<String, Vec<String>> = HashMap::new();
  let mut cleanup_map: HashMap<String, CleanupDeclarationsDto> = HashMap::new();

  let base_plans = crate::domain::base_output_plans::build_base_output_plans(context)?;
  for plan in &base_plans.plugins {
    // Cleanup targets are always collected regardless of plugin enablement.
    // This ensures `tnmsc clean` removes stale files even when a plugin
    // has been disabled after previously being enabled.
    cleanup_map
      .entry(plan.plugin_name.clone())
      .or_insert_with(CleanupDeclarationsDto::default)
      .delete
      .extend(plan.cleanup.delete.clone());
    if enabled_plugins.is_enabled(plan.plugin_name.as_str()) {
      for file in &plan.output_files {
        output_map
          .entry(plan.plugin_name.clone())
          .or_default()
          .push(file.path.clone());
      }
    }
  }

  if let Ok(plan) =
    crate::domain::output_plans::claude_code_output_plan::build_claude_code_output_plan(context)
  {
    cleanup_map
      .entry("ClaudeCodeCLIOutputAdaptor".to_string())
      .or_insert_with(CleanupDeclarationsDto::default)
      .delete
      .extend(plan.cleanup.delete.clone());
    if enabled_plugins.claude_code {
      for file in &plan.output_files {
        output_map
          .entry("ClaudeCodeCLIOutputAdaptor".to_string())
          .or_default()
          .push(file.path.clone());
      }
    }
  }
  if let Ok(plan) =
    crate::domain::output_plans::codex_output_plan::build_codex_output_plan(context)
  {
    cleanup_map
      .entry("CodexCLIOutputAdaptor".to_string())
      .or_insert_with(CleanupDeclarationsDto::default)
      .delete
      .extend(plan.cleanup.delete.clone());
    if enabled_plugins.codex {
      for file in &plan.output_files {
        output_map
          .entry("CodexCLIOutputAdaptor".to_string())
          .or_default()
          .push(file.path.clone());
      }
    }
  }
  if let Ok(plan) =
    crate::domain::output_plans::cursor_output_plan::build_cursor_output_plan(context)
  {
    cleanup_map
      .entry("CursorOutputAdaptor".to_string())
      .or_insert_with(CleanupDeclarationsDto::default)
      .delete
      .extend(plan.cleanup.delete.clone());
    if enabled_plugins.cursor {
      for file in &plan.output_files {
        output_map
          .entry("CursorOutputAdaptor".to_string())
          .or_default()
          .push(file.path.clone());
      }
    }
  }
  if let Ok(plan) =
    crate::domain::output_plans::droid_output_plan::build_droid_output_plan(context)
  {
    cleanup_map
      .entry("DroidCLIOutputAdaptor".to_string())
      .or_insert_with(CleanupDeclarationsDto::default)
      .delete
      .extend(plan.cleanup.delete.clone());
    if enabled_plugins.droid {
      for file in &plan.output_files {
        output_map
          .entry("DroidCLIOutputAdaptor".to_string())
          .or_default()
          .push(file.path.clone());
      }
    }
  }
  if let Ok(plan) =
    crate::domain::output_plans::gemini_output_plan::build_gemini_output_plan(context)
  {
    cleanup_map
      .entry("GeminiCLIOutputAdaptor".to_string())
      .or_insert_with(CleanupDeclarationsDto::default)
      .delete
      .extend(plan.cleanup.delete.clone());
    if enabled_plugins.gemini {
      for file in &plan.output_files {
        output_map
          .entry("GeminiCLIOutputAdaptor".to_string())
          .or_default()
          .push(file.path.clone());
      }
    }
  }
  if let Ok(plan) = crate::domain::output_plans::jetbrains_ai_assistant_codex_output_plan::build_jetbrains_ai_assistant_codex_output_plan(context) {
    cleanup_map
      .entry("JetBrainsAIAssistantCodexOutputAdaptor".to_string())
      .or_insert_with(CleanupDeclarationsDto::default)
      .delete
      .extend(plan.cleanup.delete.clone());
    if enabled_plugins.jetbrains {
      for file in &plan.output_files {
        output_map
          .entry("JetBrainsAIAssistantCodexOutputAdaptor".to_string())
          .or_default()
          .push(file.path.clone());
      }
    }
  }
  if let Ok(plan) = crate::domain::output_plans::kiro_output_plan::build_kiro_output_plan(context)
  {
    cleanup_map
      .entry("KiroCLIOutputAdaptor".to_string())
      .or_insert_with(CleanupDeclarationsDto::default)
      .delete
      .extend(plan.cleanup.delete.clone());
    if enabled_plugins.kiro {
      for file in &plan.output_files {
        output_map
          .entry("KiroCLIOutputAdaptor".to_string())
          .or_default()
          .push(file.path.clone());
      }
    }
  }
  if let Ok(plan) =
    crate::domain::output_plans::opencode_output_plan::build_opencode_output_plan(context)
  {
    cleanup_map
      .entry("OpencodeCLIOutputAdaptor".to_string())
      .or_insert_with(CleanupDeclarationsDto::default)
      .delete
      .extend(plan.cleanup.delete.clone());
    if enabled_plugins.opencode {
      for file in &plan.output_files {
        output_map
          .entry("OpencodeCLIOutputAdaptor".to_string())
          .or_default()
          .push(file.path.clone());
      }
    }
  }
  if let Ok(plan) =
    crate::domain::output_plans::qoder_output_plan::build_qoder_output_plan(context)
  {
    cleanup_map
      .entry("QoderIDEPluginOutputAdaptor".to_string())
      .or_insert_with(CleanupDeclarationsDto::default)
      .delete
      .extend(plan.cleanup.delete.clone());
    if enabled_plugins.qoder {
      for file in &plan.output_files {
        output_map
          .entry("QoderIDEPluginOutputAdaptor".to_string())
          .or_default()
          .push(file.path.clone());
      }
    }
  }
  if let Ok(plan) = crate::domain::output_plans::trae_output_plan::build_trae_output_plan(context)
  {
    cleanup_map
      .entry("TraeOutputAdaptor".to_string())
      .or_insert_with(CleanupDeclarationsDto::default)
      .delete
      .extend(plan.cleanup.delete.clone());
    if enabled_plugins.trae || enabled_plugins.trae_cn {
      for file in &plan.output_files {
        output_map
          .entry("TraeOutputAdaptor".to_string())
          .or_default()
          .push(file.path.clone());
      }
    }
  }
  if let Ok(plan) = crate::domain::output_plans::warp_output_plan::build_warp_output_plan(context)
  {
    cleanup_map
      .entry("WarpIDEOutputAdaptor".to_string())
      .or_insert_with(CleanupDeclarationsDto::default)
      .delete
      .extend(plan.cleanup.delete.clone());
    if enabled_plugins.warp {
      for file in &plan.output_files {
        output_map
          .entry("WarpIDEOutputAdaptor".to_string())
          .or_default()
          .push(file.path.clone());
      }
    }
  }
  if let Ok(plan) =
    crate::domain::output_plans::windsurf_output_plan::build_windsurf_output_plan(context)
  {
    cleanup_map
      .entry("WindsurfOutputAdaptor".to_string())
      .or_insert_with(CleanupDeclarationsDto::default)
      .delete
      .extend(plan.cleanup.delete.clone());
    if enabled_plugins.windsurf {
      for file in &plan.output_files {
        output_map
          .entry("WindsurfOutputAdaptor".to_string())
          .or_default()
          .push(file.path.clone());
      }
    }
  }

  Ok((output_map, cleanup_map))
}

fn build_cleanup_snapshot(
  workspace_dir: &str,
  output_map: &HashMap<String, Vec<String>>,
  cleanup_map: &HashMap<String, CleanupDeclarationsDto>,
) -> Result<CleanupSnapshot, CliError> {
  let mut plugin_snapshots = Vec::new();

  // Include all plugins that have either outputs or cleanup targets.
  // This ensures disabled plugins still contribute their cleanup declarations.
  let mut all_plugin_names: Vec<&String> = output_map.keys().collect();
  for name in cleanup_map.keys() {
    if !all_plugin_names.contains(&name) {
      all_plugin_names.push(name);
    }
  }

  for plugin_name in all_plugin_names {
    let output_paths = output_map.get(plugin_name).cloned().unwrap_or_default();
    let cleanup = cleanup_map.get(plugin_name).cloned().unwrap_or_else(|| CleanupDeclarationsDto {
      delete: Vec::new(),
      protect: Vec::new(),
      exclude_scan_globs: Vec::new(),
    });
    plugin_snapshots.push(PluginCleanupSnapshotDto {
      plugin_name: plugin_name.clone(),
      outputs: output_paths,
      cleanup,
    });
  }

  let project_roots = discover_project_roots(workspace_dir);

  let mut delete_targets = Vec::new();
  for root_path in &project_roots {
    let root = std::path::Path::new(root_path);
    let agents_path = root.join("AGENTS.md");
    let claude_path = root.join("CLAUDE.md");
    let agt_path = root.join("agt.mdx");

    let agents_exists = agents_path.exists();
    let claude_exists = claude_path.exists();
    let agt_exists = agt_path.exists();

    if agents_exists && !agt_exists {
      delete_targets.push(CleanupTargetDto {
        path: agents_path.to_string_lossy().into_owned(),
        kind: CleanupTargetKindDto::File,
        exclude_basenames: Vec::new(),
        protection_mode: None,
        scope: None,
        label: Some("orphaned-agents".to_string()),
      });
    }
    if claude_exists && !agt_exists {
      delete_targets.push(CleanupTargetDto {
        path: claude_path.to_string_lossy().into_owned(),
        kind: CleanupTargetKindDto::File,
        exclude_basenames: Vec::new(),
        protection_mode: None,
        scope: None,
        label: Some("orphaned-claude".to_string()),
      });
    }
  }

  plugin_snapshots.push(PluginCleanupSnapshotDto {
    plugin_name: "base-cleanup".to_string(),
    outputs: Vec::new(),
    cleanup: CleanupDeclarationsDto {
      delete: delete_targets,
      protect: Vec::new(),
      exclude_scan_globs: Vec::new(),
    },
  });

  Ok(CleanupSnapshot {
    workspace_dir: workspace_dir.to_string(),
    aindex_dir: Some(
      crate::domain::config::resolve_workspace_aindex_dir(workspace_dir)
        .to_string_lossy()
        .into_owned(),
    ),
    project_roots,
    protected_rules: Vec::new(),
    plugin_snapshots,
    empty_dir_exclude_globs: Vec::new(),
  })
}

fn discover_project_roots(workspace_dir: &str) -> Vec<String> {
  let ws_path = std::path::Path::new(workspace_dir);
  let mut roots = Vec::new();

  if let Ok(entries) = std::fs::read_dir(ws_path) {
    for entry in entries.flatten() {
      let path = entry.path();
      if path.is_dir() {
        let dir_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if !dir_name.starts_with('.')
          && dir_name != crate::domain::config::DEFAULT_AINDEX_DIR_NAME
          && dir_name != "node_modules"
          && dir_name != "target"
        {
          roots.push(path.to_string_lossy().into_owned());
        }
      }
    }
  }

  roots
}

#[cfg(test)]
mod tests {
  use super::*;
  use tempfile::TempDir;

  fn with_home_dir<T>(home_dir: &Path, callback: impl FnOnce() -> T) -> T {
    let _guard = match crate::domain::TEST_ENV_LOCK.lock() {
      Ok(g) => g,
      Err(error) => error.into_inner(),
    };
    let previous_home = std::env::var_os("HOME");

    unsafe {
      std::env::set_var("HOME", home_dir);
    }

    let result = callback();

    match previous_home {
      Some(value) => unsafe {
        std::env::set_var("HOME", value);
      },
      None => unsafe {
        std::env::remove_var("HOME");
      },
    }

    result
  }

  fn create_test_config(home_dir: &Path, workspace_dir: &Path) -> std::io::Result<()> {
    let config_content = json!({
      "workspaceDir": workspace_dir.to_string_lossy()
    });
    let config_path = home_dir.join(".aindex").join(".tnmsc.json");
    std::fs::create_dir_all(config_path.parent().unwrap())?;
    std::fs::write(
      config_path,
      serde_json::to_string_pretty(&config_content).unwrap(),
    )?;
    Ok(())
  }

  #[test]
  fn clean_dry_run_returns_plan_without_deleting() {
    let temp_dir = TempDir::new().unwrap();
    let aindex_dir = temp_dir.path().join("aindex");
    std::fs::create_dir_all(&aindex_dir).unwrap();
    std::fs::write(aindex_dir.join("global.mdx"), "Global memory").unwrap();
    std::fs::write(aindex_dir.join("workspace.mdx"), "Workspace memory").unwrap();

    with_home_dir(temp_dir.path(), || {
      create_test_config(temp_dir.path(), temp_dir.path()).unwrap();

      let options = MemorySyncCommandOptions {
        cwd: Some(temp_dir.path().to_string_lossy().to_string()),
        load_user_config: Some(true),
        dry_run: Some(true),
        ..Default::default()
      };

      let result = clean(options);
      assert!(
        result.is_ok(),
        "clean should succeed, got: {:?}",
        result.err()
      );
      let result = result.unwrap();
      assert!(result.message.is_some(), "clean should return a message");
    });
  }

  #[test]
  fn clean_with_no_outputs_returns_plan() {
    let temp_dir = TempDir::new().unwrap();
    with_home_dir(temp_dir.path(), || {
      create_test_config(temp_dir.path(), temp_dir.path()).unwrap();

      let options = MemorySyncCommandOptions {
        cwd: Some(temp_dir.path().to_string_lossy().to_string()),
        load_user_config: Some(true),
        dry_run: Some(true),
        ..Default::default()
      };

      let result = clean(options);
      assert!(
        result.is_ok(),
        "clean should succeed, got: {:?}",
        result.err()
      );
      let result = result.unwrap();
      assert!(
        result.message.is_some(),
        "clean should return a message about the plan"
      );
    });
  }

  #[test]
  fn clean_resolve_cwd_uses_provided_path() {
    let temp_dir = TempDir::new().unwrap();
    let cwd = temp_dir.path().to_string_lossy();
    let result = resolve_cwd(Some(&cwd));
    assert!(result.is_ok());
  }

  #[test]
  fn clean_resolve_cwd_falls_back_to_current_dir() {
    let result = resolve_cwd(None);
    assert!(result.is_ok());
  }

  #[test]
  fn clean_load_config_allows_skip() {
    let temp_dir = TempDir::new().unwrap();
    let result = load_config(temp_dir.path(), Some(false));
    assert!(result.is_ok());
    let merged = result.unwrap();
    assert!(!merged.found);
  }

  #[test]
  fn clean_enabled_plugins_from_empty_config() {
    let plugins = EnabledPlugins::from_config(None);
    assert!(plugins.agents_md);
    assert!(plugins.claude_code);
    assert!(plugins.git);
    assert!(plugins.readme);
  }

  #[test]
  fn clean_enabled_plugins_respects_config() {
    let config = PluginsConfig {
      git: Some(false),
      readme: Some(false),
      claude_code: Some(true),
      ..Default::default()
    };
    let plugins = EnabledPlugins::from_config(Some(&config));
    assert!(!plugins.git);
    assert!(!plugins.readme);
    assert!(plugins.claude_code);
  }

  #[test]
  fn clean_plugin_name_matching() {
    let plugins = EnabledPlugins::from_config(None);
    assert!(plugins.is_enabled("GitExcludeOutputAdaptor"));
    assert!(plugins.is_enabled("ReadmeMdConfigFileOutputAdaptor"));
    assert!(plugins.is_enabled("ClaudeCodeCLIOutputAdaptor"));
  }

  #[test]
  fn clean_build_cleanup_snapshot_works() {
    let temp_dir = TempDir::new().unwrap();
    let workspace_dir = temp_dir.path().to_string_lossy();
    let mut output_map = HashMap::new();
    output_map.insert(
      "TestPlugin".to_string(),
      vec!["/path/to/output.md".to_string()],
    );

    let cleanup_map: HashMap<String, CleanupDeclarationsDto> = HashMap::new();
    let snapshot = build_cleanup_snapshot(&workspace_dir, &output_map, &cleanup_map);
    assert!(snapshot.is_ok());
    let snapshot = snapshot.unwrap();
    assert_eq!(snapshot.plugin_snapshots.len(), 2);
    assert_eq!(snapshot.plugin_snapshots[0].plugin_name, "TestPlugin");
    assert_eq!(snapshot.plugin_snapshots[0].outputs.len(), 1);
  }

  #[test]
  fn clean_workspace_dir_format() {
    let temp_dir = TempDir::new().unwrap();
    let workspace_dir = temp_dir.path().to_string_lossy();
    let output_map = HashMap::new();
    let cleanup_map: HashMap<String, CleanupDeclarationsDto> = HashMap::new();

    let snapshot = build_cleanup_snapshot(&workspace_dir, &output_map, &cleanup_map).unwrap();
    assert!(snapshot.aindex_dir.is_some());
    assert!(snapshot.aindex_dir.unwrap().contains("aindex"));
  }

  /// 回归测试：clean 必须始终收集所有插件的 cleanup targets，无论插件是否启用。
  ///
  /// 设计原因：用户可能在禁用某个插件之前已经运行过 install，导致该插件生成的文件
  /// 仍然残留在项目或全局目录中。如果 clean 也跟随插件开关，则这些残留文件将永远
  /// 无法被自动清理，造成"清爽的编程上下文环境"被破坏。
  ///
  /// 因此，install 行为受插件开关控制（只生成启用插件的文件），而 clean 行为
  /// 不受插件开关控制（总是清理所有已知插件的输出文件）。
  #[test]
  fn clean_snapshot_includes_disabled_plugin_cleanup_targets() {
    let workspace_dir = "/tmp/test-workspace";
    let output_map: HashMap<String, Vec<String>> = HashMap::new();
    // 模拟 agents_md 被禁用：没有 outputs，但有 cleanup targets
    let mut cleanup_map: HashMap<String, CleanupDeclarationsDto> = HashMap::new();
    cleanup_map.insert(
      "AgentsOutputAdaptor".to_string(),
      CleanupDeclarationsDto {
        delete: vec![CleanupTargetDto {
          path: "/tmp/test-workspace/AGENTS.md".to_string(),
          kind: CleanupTargetKindDto::File,
          exclude_basenames: Vec::new(),
          protection_mode: None,
          scope: None,
          label: Some("delete.project".to_string()),
        }],
        protect: Vec::new(),
        exclude_scan_globs: Vec::new(),
      },
    );

    let snapshot = build_cleanup_snapshot(workspace_dir, &output_map, &cleanup_map).unwrap();

    let agents_snapshot = snapshot
      .plugin_snapshots
      .iter()
      .find(|p| p.plugin_name == "AgentsOutputAdaptor");
    assert!(
      agents_snapshot.is_some(),
      "cleanup snapshot should include disabled plugin (AgentsOutputAdaptor)"
    );
    let agents_snapshot = agents_snapshot.unwrap();
    assert!(
      agents_snapshot.outputs.is_empty(),
      "disabled plugin should have no outputs"
    );
    assert_eq!(
      agents_snapshot.cleanup.delete.len(),
      1,
      "disabled plugin should still contribute cleanup targets"
    );
  }

  /// 回归测试：build_cleanup_snapshot 应同时包含 output_map 和 cleanup_map 中的插件。
  #[test]
  fn clean_snapshot_collects_from_both_maps() {
    let workspace_dir = "/tmp/test-workspace";
    let mut output_map: HashMap<String, Vec<String>> = HashMap::new();
    output_map.insert("EnabledPlugin".to_string(), vec!["file.md".to_string()]);

    let mut cleanup_map: HashMap<String, CleanupDeclarationsDto> = HashMap::new();
    cleanup_map.insert(
      "DisabledPlugin".to_string(),
      CleanupDeclarationsDto {
        delete: vec![CleanupTargetDto {
          path: "stale.md".to_string(),
          kind: CleanupTargetKindDto::File,
          exclude_basenames: Vec::new(),
          protection_mode: None,
          scope: None,
          label: None,
        }],
        protect: Vec::new(),
        exclude_scan_globs: Vec::new(),
      },
    );

    let snapshot = build_cleanup_snapshot(workspace_dir, &output_map, &cleanup_map).unwrap();

    let names: Vec<_> = snapshot
      .plugin_snapshots
      .iter()
      .map(|p| p.plugin_name.as_str())
      .collect();
    assert!(
      names.contains(&"EnabledPlugin"),
      "snapshot should include plugin from output_map"
    );
    assert!(
      names.contains(&"DisabledPlugin"),
      "snapshot should include plugin from cleanup_map"
    );
  }
}
