use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine;
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};

use crate::context::OutputContext;
use crate::domain::base_output_plans::{BaseOutputFileDeclarationDto, BaseOutputPlansDto};
use crate::domain::config::{self, ConfigLoader, PluginsConfig, UserConfigFile};
use crate::domain::output_plans::droid_output_plan::DroidOutputPlanDto;
use crate::domain::plugin_shared::{
  AIAgentIgnoreConfigFile, FastCommandPrompt, GlobalMemoryPrompt, ProjectIDEConfigFile,
  ReadmePrompt, RulePrompt, SkillPrompt, SubAgentPrompt, Workspace,
};
use crate::infra::desk_paths;
use crate::policy::path_blocking;
use crate::{CliError, MemorySyncCommandOptions, MemorySyncCommandResult};

const PLUGIN_AGENTS: &str = "AgentsOutputAdaptor";
const PLUGIN_GIT: &str = "GitExcludeOutputAdaptor";
const PLUGIN_JETBRAINS_CODE_STYLE: &str = "JetBrainsIDECodeStyleConfigOutputAdaptor";
const PLUGIN_VSCODE: &str = "VisualStudioCodeIDEConfigOutputAdaptor";
const PLUGIN_ZED: &str = "ZedIDEConfigOutputAdaptor";
const PLUGIN_README: &str = "ReadmeMdConfigFileOutputAdaptor";
const PLUGIN_CLAUDE: &str = "ClaudeCodeCLIOutputAdaptor";
const PLUGIN_CODEX: &str = "CodexCLIOutputAdaptor";
const PLUGIN_CURSOR: &str = "CursorOutputAdaptor";
const PLUGIN_DROID: &str = "DroidCLIOutputAdaptor";
const PLUGIN_GEMINI: &str = "GeminiCLIOutputAdaptor";
const PLUGIN_JETBRAINS: &str = "JetBrainsAIAssistantCodexOutputAdaptor";
const PLUGIN_KIRO: &str = "KiroCLIOutputAdaptor";
const PLUGIN_OPENCODE: &str = "OpencodeCLIOutputAdaptor";
const PLUGIN_QODER: &str = "QoderIDEPluginOutputAdaptor";
const PLUGIN_TRAE: &str = "TraeOutputAdaptor";
const PLUGIN_WARP: &str = "WarpIDEOutputAdaptor";
const PLUGIN_WINDSURF: &str = "WindsurfOutputAdaptor";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceEnvelope {
  workspace: Workspace,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GlobalMemoryEnvelope {
  #[serde(default)]
  global_memory: Option<GlobalMemoryPrompt>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommandsEnvelope {
  #[serde(default)]
  commands: Vec<FastCommandPrompt>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubAgentsEnvelope {
  #[serde(default)]
  sub_agents: Vec<SubAgentPrompt>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillsEnvelope {
  #[serde(default)]
  skills: Vec<SkillPrompt>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RulesEnvelope {
  #[serde(default)]
  rules: Vec<RulePrompt>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReadmeEnvelope {
  #[serde(default)]
  readme_prompts: Vec<ReadmePrompt>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitIgnoreEnvelope {
  #[serde(default)]
  global_git_ignore: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitExcludeEnvelope {
  #[serde(default)]
  shadow_git_exclude: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SharedIgnoreEnvelope {
  #[serde(default)]
  ai_agent_ignore_config_files: Option<Vec<AIAgentIgnoreConfigFile>>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VSCodeEnvelope {
  #[serde(default)]
  vscode_config_files: Option<Vec<ProjectIDEConfigFile>>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ZedEnvelope {
  #[serde(default)]
  zed_config_files: Option<Vec<ProjectIDEConfigFile>>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JetBrainsEnvelope {
  #[serde(default)]
  jetbrains_config_files: Option<Vec<ProjectIDEConfigFile>>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditorConfigEnvelope {
  #[serde(default)]
  editor_config_files: Option<Vec<ProjectIDEConfigFile>>,
}

#[derive(Debug, Clone)]
struct PlannedOutputFile {
  path: String,
  content: String,
  encoding: Option<String>,
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
      agents_md: config.and_then(|value| value.agents_md).unwrap_or(false),
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
      opencode: config.and_then(|value| value.opencode).unwrap_or(false),
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
      PLUGIN_AGENTS => self.agents_md,
      PLUGIN_GIT => self.git,
      PLUGIN_JETBRAINS_CODE_STYLE => self.jetbrains_code_style,
      PLUGIN_VSCODE => self.vscode,
      PLUGIN_ZED => self.zed,
      PLUGIN_README => self.readme,
      PLUGIN_CLAUDE => self.claude_code,
      PLUGIN_CODEX => self.codex,
      PLUGIN_CURSOR => self.cursor,
      PLUGIN_DROID => self.droid,
      PLUGIN_GEMINI => self.gemini,
      PLUGIN_JETBRAINS => self.jetbrains,
      PLUGIN_KIRO => self.kiro,
      PLUGIN_OPENCODE => self.opencode,
      PLUGIN_QODER => self.qoder,
      PLUGIN_TRAE => self.trae || self.trae_cn,
      PLUGIN_WARP => self.warp,
      PLUGIN_WINDSURF => self.windsurf,
      _ => false,
    }
  }

  fn registered_output_plugins(self) -> Vec<String> {
    let mut plugins = Vec::new();
    for plugin_name in [
      PLUGIN_AGENTS,
      PLUGIN_GIT,
      PLUGIN_JETBRAINS_CODE_STYLE,
      PLUGIN_VSCODE,
      PLUGIN_ZED,
      PLUGIN_README,
      PLUGIN_CLAUDE,
      PLUGIN_CODEX,
      PLUGIN_CURSOR,
      PLUGIN_DROID,
      PLUGIN_GEMINI,
      PLUGIN_JETBRAINS,
      PLUGIN_KIRO,
      PLUGIN_OPENCODE,
      PLUGIN_QODER,
      PLUGIN_TRAE,
      PLUGIN_WARP,
      PLUGIN_WINDSURF,
    ] {
      if self.is_enabled(plugin_name) {
        plugins.push(plugin_name.to_string());
      }
    }
    plugins
  }
}

pub(crate) fn install(
  options: MemorySyncCommandOptions,
) -> Result<MemorySyncCommandResult, CliError> {
  let cwd = resolve_cwd(options.cwd.as_deref())?;
  let config_result = load_config(&cwd, options.load_user_config)?;
  let workspace_dir = resolve_workspace_dir(&cwd, &config_result.config)?;
  let workspace_dir_str = workspace_dir.to_string_lossy().into_owned();
  let global_scope = build_global_scope(&config_result.config);
  let enabled_plugins = EnabledPlugins::from_config(config_result.config.plugins.as_ref());

  let context = collect_context(&workspace_dir_str, global_scope.as_ref(), enabled_plugins)?;
  let planned_outputs = build_output_files(&context, enabled_plugins)?;
  let execution = write_output_files(&planned_outputs)?;

  Ok(MemorySyncCommandResult {
    success: execution.errors.is_empty(),
    files_affected: execution.files_affected as i32,
    dirs_affected: execution.dirs_affected as i32,
    message: None,
    warnings: execution.warnings,
    errors: execution.errors,
  })
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

fn collect_context(
  workspace_dir: &str,
  global_scope: Option<&Value>,
  enabled_plugins: EnabledPlugins,
) -> Result<OutputContext, CliError> {
  let aindex = collect_json::<WorkspaceEnvelope>(
    crate::repositories::aindex_resolvers::collect_aindex_resolvers,
    json!({
      "workspaceDir": workspace_dir,
    }),
  )?;

  let project_prompts = collect_json::<WorkspaceEnvelope>(
    crate::repositories::project_prompt::collect_project_prompt,
    json!({
      "workspaceDir": workspace_dir,
      "workspace": aindex.workspace,
      "globalScope": global_scope,
    }),
  )?;

  let global_memory = collect_json::<GlobalMemoryEnvelope>(
    crate::repositories::global_memory::collect_global_memory,
    json!({
      "workspaceDir": workspace_dir,
      "globalScope": global_scope,
    }),
  )?;

  let commands = collect_json::<CommandsEnvelope>(
    crate::repositories::command::collect_command,
    json!({
      "workspaceDir": workspace_dir,
      "globalScope": global_scope,
    }),
  )?;

  let sub_agents = collect_json::<SubAgentsEnvelope>(
    crate::repositories::subagent::collect_subagent,
    json!({
      "workspaceDir": workspace_dir,
      "globalScope": global_scope,
    }),
  )?;

  let skills = collect_json::<SkillsEnvelope>(
    crate::repositories::skill::collect_skill,
    json!({
      "workspaceDir": workspace_dir,
      "globalScope": global_scope,
    }),
  )?;

  let rules = collect_json::<RulesEnvelope>(
    crate::repositories::rule::collect_rule,
    json!({
      "workspaceDir": workspace_dir,
      "globalScope": global_scope,
    }),
  )?;
  let readme = collect_json::<ReadmeEnvelope>(
    crate::repositories::readme::collect_readme,
    json!({
      "workspaceDir": workspace_dir,
      "globalScope": global_scope,
    }),
  )?;
  let gitignore = collect_json::<GitIgnoreEnvelope>(
    crate::repositories::gitignore::collect_gitignore,
    json!({
      "workspaceDir": workspace_dir,
    }),
  )?;
  let git_exclude = collect_json::<GitExcludeEnvelope>(
    crate::repositories::git_exclude::collect_git_exclude,
    json!({
      "workspaceDir": workspace_dir,
    }),
  )?;
  let shared_ignore = collect_json::<SharedIgnoreEnvelope>(
    crate::repositories::shared_ignore::collect_shared_ignore,
    json!({
      "workspaceDir": workspace_dir,
    }),
  )?;
  let vscode = collect_json::<VSCodeEnvelope>(
    crate::repositories::vscode_config::collect_vscode_config,
    json!({
      "workspaceDir": workspace_dir,
    }),
  )?;
  let zed = collect_json::<ZedEnvelope>(
    crate::repositories::zed_config::collect_zed_config,
    json!({
      "workspaceDir": workspace_dir,
    }),
  )?;
  let jetbrains = collect_json::<JetBrainsEnvelope>(
    crate::repositories::jetbrains_config::collect_jetbrains_config,
    json!({
      "workspaceDir": workspace_dir,
    }),
  )?;
  let editor_config = collect_json::<EditorConfigEnvelope>(
    crate::repositories::editorconfig::collect_editorconfig,
    json!({
      "workspaceDir": workspace_dir,
    }),
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
    registered_output_plugins: Some(enabled_plugins.registered_output_plugins()),
  })
}

fn collect_json<T>(
  collector: impl Fn(&str) -> Result<String, CliError>,
  input: Value,
) -> Result<T, CliError>
where
  T: DeserializeOwned,
{
  let raw = collector(&input.to_string())?;
  serde_json::from_str(&raw).map_err(CliError::SerializationError)
}

fn build_output_files(
  context: &OutputContext,
  enabled_plugins: EnabledPlugins,
) -> Result<BTreeMap<String, PlannedOutputFile>, CliError> {
  let mut outputs = BTreeMap::new();

  let base_plans = crate::domain::base_output_plans::build_base_output_plans(context)?;
  push_base_plans(&mut outputs, &base_plans, enabled_plugins);

  if enabled_plugins.claude_code {
    let plan =
      crate::domain::output_plans::claude_code_output_plan::build_claude_code_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
  }
  if enabled_plugins.codex {
    let plan = crate::domain::output_plans::codex_output_plan::build_codex_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
  }
  if enabled_plugins.cursor {
    let plan = crate::domain::output_plans::cursor_output_plan::build_cursor_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
  }
  if enabled_plugins.droid {
    let plan = crate::domain::output_plans::droid_output_plan::build_droid_output_plan(context)?;
    push_droid_output_files(&mut outputs, &plan);
  }
  if enabled_plugins.gemini {
    let plan = crate::domain::output_plans::gemini_output_plan::build_gemini_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
  }
  if enabled_plugins.jetbrains {
    let plan =
      crate::domain::output_plans::jetbrains_ai_assistant_codex_output_plan::build_jetbrains_ai_assistant_codex_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
  }
  if enabled_plugins.kiro {
    let plan = crate::domain::output_plans::kiro_output_plan::build_kiro_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
  }
  if enabled_plugins.opencode {
    let plan =
      crate::domain::output_plans::opencode_output_plan::build_opencode_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
  }
  if enabled_plugins.qoder {
    let plan = crate::domain::output_plans::qoder_output_plan::build_qoder_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
  }
  if enabled_plugins.trae || enabled_plugins.trae_cn {
    let plan = crate::domain::output_plans::trae_output_plan::build_trae_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
  }
  if enabled_plugins.warp {
    let plan = crate::domain::output_plans::warp_output_plan::build_warp_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
  }
  if enabled_plugins.windsurf {
    let plan =
      crate::domain::output_plans::windsurf_output_plan::build_windsurf_output_plan(context)?;
    push_base_output_files(&mut outputs, &plan.output_files);
  }

  Ok(outputs)
}

fn push_base_plans(
  outputs: &mut BTreeMap<String, PlannedOutputFile>,
  base_plans: &BaseOutputPlansDto,
  enabled_plugins: EnabledPlugins,
) {
  for plan in &base_plans.plugins {
    if enabled_plugins.is_enabled(&plan.plugin_name) {
      push_base_output_files(outputs, &plan.output_files);
    }
  }
}

fn push_base_output_files(
  outputs: &mut BTreeMap<String, PlannedOutputFile>,
  files: &[BaseOutputFileDeclarationDto],
) {
  for file in files {
    outputs.insert(
      file.path.clone(),
      PlannedOutputFile {
        path: file.path.clone(),
        content: file.content.clone(),
        encoding: None,
      },
    );
  }
}

fn push_droid_output_files(
  outputs: &mut BTreeMap<String, PlannedOutputFile>,
  plan: &DroidOutputPlanDto,
) {
  for file in &plan.output_files {
    outputs.insert(
      file.path.clone(),
      PlannedOutputFile {
        path: file.path.clone(),
        content: file.content.clone(),
        encoding: file.encoding.clone(),
      },
    );
  }
}

struct InstallExecutionResult {
  files_affected: usize,
  dirs_affected: usize,
  warnings: Vec<Value>,
  errors: Vec<Value>,
}

fn write_output_files(
  outputs: &BTreeMap<String, PlannedOutputFile>,
) -> Result<InstallExecutionResult, CliError> {
  let mut files_affected = 0usize;
  let mut dirs_affected = 0usize;
  let mut warnings = Vec::new();
  let mut errors = Vec::new();

  for file in outputs.values() {
    let path = Path::new(&file.path);

    match prepare_target_path(path, &mut warnings) {
      Ok(created_dirs) => {
        dirs_affected += created_dirs;
      }
      Err(error) => {
        errors.push(json!({
          "path": file.path,
          "error": error,
        }));
        continue;
      }
    }

    let bytes = match render_bytes(file) {
      Ok(bytes) => bytes,
      Err(error) => {
        errors.push(json!({
          "path": file.path,
          "error": error.to_string(),
        }));
        continue;
      }
    };

    let existing = fs::read(path).ok();
    if existing.as_deref() == Some(bytes.as_slice()) {
      continue;
    }

    if let Err(error) = desk_paths::write_file_sync(path, &bytes) {
      errors.push(json!({
        "path": file.path,
        "error": error.to_string(),
      }));
      continue;
    }

    files_affected += 1;
  }

  Ok(InstallExecutionResult {
    files_affected,
    dirs_affected,
    warnings,
    errors,
  })
}

fn render_bytes(file: &PlannedOutputFile) -> Result<Vec<u8>, CliError> {
  match file.encoding.as_deref() {
    Some("base64") => base64::engine::general_purpose::STANDARD
      .decode(&file.content)
      .map_err(|error| CliError::ExecutionError(format!("Invalid base64 output payload: {error}"))),
    _ => Ok(file.content.as_bytes().to_vec()),
  }
}

fn prepare_target_path(path: &Path, warnings: &mut Vec<Value>) -> Result<usize, String> {
  let mut created_dirs = 0usize;

  if let Some(parent) = path.parent() {
    if let Some(blocking) =
      path_blocking::find_blocking_non_directory_path(&parent.to_string_lossy())
    {
      desk_paths::delete_path_sync(&blocking).map_err(|error| error.to_string())?;
      warnings.push(json!({
        "path": blocking,
        "warning": "Removed a blocking non-directory path before writing output.",
      }));
    }

    created_dirs += count_missing_directories(parent);
    desk_paths::ensure_dir(parent).map_err(|error| error.to_string())?;
  }

  if let Ok(metadata) = fs::symlink_metadata(path)
    && metadata.is_dir()
  {
    desk_paths::delete_path_sync(path).map_err(|error| error.to_string())?;
    warnings.push(json!({
      "path": path.to_string_lossy(),
      "warning": "Removed a blocking directory before writing output.",
    }));
  }

  Ok(created_dirs)
}

fn count_missing_directories(dir: &Path) -> usize {
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

#[cfg(test)]
mod tests {
  use super::*;
  use std::path::PathBuf;

  #[test]
  fn test_resolve_workspace_dir_returns_configured_path() {
    let cwd = PathBuf::from("/some/cwd");
    let config = UserConfigFile {
      workspace_dir: Some("/configured/workspace".to_string()),
      ..Default::default()
    };
    let result = resolve_workspace_dir(&cwd, &config);
    assert!(
      result.is_ok(),
      "should succeed when workspace_dir is configured"
    );
    assert!(
      result.unwrap().to_string_lossy().contains("workspace"),
      "resolved path should contain the configured workspace dir"
    );
  }

  #[test]
  fn test_resolve_workspace_dir_errors_when_not_configured() {
    let cwd = PathBuf::from("/some/cwd");
    let config = UserConfigFile::default();
    let result = resolve_workspace_dir(&cwd, &config);
    assert!(
      result.is_err(),
      "should error when workspace_dir is not configured"
    );
    let error = result.unwrap_err();
    let message = error.to_string();
    assert!(
      message.contains("workspaceDir"),
      "error message should mention workspaceDir, got: {message}"
    );
  }

  #[test]
  fn test_load_config_requires_config_file_to_be_found() {
    let temp_dir = tempfile::TempDir::new().unwrap();
    let cwd = temp_dir.path();
    let result = load_config(cwd, None);
    match &result {
      Err(error) => {
        let message = error.to_string();
        assert!(
          message.contains("not found"),
          "error message should mention config not found, got: {message}"
        );
        assert!(
          message.contains(".tnmsc.json"),
          "error message should mention .tnmsc.json, got: {message}"
        );
      }
      Ok(merged) if !merged.found => {
        let ws_result = resolve_workspace_dir(cwd, &merged.config);
        assert!(
          ws_result.is_err(),
          "when config file is not found, workspaceDir should be required"
        );
      }
      Ok(_) => {}
    }
  }

  #[test]
  fn test_load_config_allows_explicit_skip() {
    let temp_dir = tempfile::TempDir::new().unwrap();
    let cwd = temp_dir.path();
    let result = load_config(cwd, Some(false));
    assert!(
      result.is_ok(),
      "should succeed when load_user_config is false"
    );
    let merged = result.unwrap();
    assert!(
      !merged.found,
      "found should be false when skipping user config"
    );
  }
}
