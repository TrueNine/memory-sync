use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::{Map, Value, json};
use tnmsc::core::config::ConfigLoader;
use tnmsc::core::dependency_resolver::{
  DependencyNodeInput, DependencyResolverError, topological_sort, topological_sort_nodes,
};
use tnmsc::core::execution_plan::{
  ExecutionPlan, collect_managed_projects, filter_path_scoped_entries, resolve_execution_plan,
};
use tnmsc::core::plugin_shared::{CollectedInputContext, Workspace};
use tnmsc::core::wsl_mirror_sync::WslMirrorFileDeclaration;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeHostArgs {
  method: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FilePathPayload {
  file_path: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CwdPayload {
  cwd: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResolveExecutionPlanPayload {
  context_json: String,
  execution_cwd: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FilterPathScopedEntriesPayload {
  entries: Vec<PathScopedEntry>,
  plan_json: String,
  context_json: String,
}

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PathScopedEntry {
  path: String,
  #[serde(default)]
  scope: Option<String>,
  #[serde(flatten)]
  extra: Map<String, Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ValidatePublicPathPayload {
  resolved_path: String,
  aindex_public_dir: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResolvePublicPathPayload {
  file_path: String,
  ctx_json: String,
  logical_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompileMdxToMdPayload {
  content: String,
  options_json: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildTomlDocumentPayload {
  document_json: String,
  options_json: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildPromptTomlArtifactPayload {
  options_json: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BinaryBooleanPayload {
  dry_run: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillDistCleanupPayload {
  dist_skills_dir: String,
  dry_run: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MdCleanupPayload {
  dirs: Vec<String>,
  dry_run: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncWindowsConfigIntoWslPayload {
  context_json: String,
  declarations_json: String,
  dry_run: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsonStringPayload {
  json: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawJsonStringPayload {
  raw_json: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsonArrayStringPayload {
  top_level: Option<Vec<String>>,
  type_specific: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MatchesSeriesPayload {
  seri_name: Option<Value>,
  effective_include_series: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResolveSubSeriesPayload {
  top_level: Option<std::collections::HashMap<String, Vec<String>>>,
  type_specific: Option<std::collections::HashMap<String, Vec<String>>>,
}

fn read_stdin() -> Result<String, String> {
  let mut input = String::new();
  io::stdin()
    .read_to_string(&mut input)
    .map_err(|error| format!("Failed to read stdin: {error}"))?;
  Ok(input)
}

fn parse_input<T: DeserializeOwned>(input: &str) -> Result<T, String> {
  let source = if input.trim().is_empty() { "null" } else { input };
  serde_json::from_str(source).map_err(|error| format!("Invalid native-host payload: {error}"))
}

fn ok_json<T: serde::Serialize>(value: T) -> Result<String, String> {
  serde_json::to_string(&value).map_err(|error| format!("Failed to serialize native-host response: {error}"))
}

fn current_dir_fallback() -> PathBuf {
  std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn dependency_error_message(error: DependencyResolverError) -> String {
  serde_json::to_string(&error).unwrap_or_else(|_| format!("{error:?}"))
}

fn string_or_default(input: Option<String>) -> String {
  input.unwrap_or_default()
}

fn deserialize_workspace_from_context(context_json: &str) -> Result<Workspace, String> {
  let parsed: CollectedInputContext = serde_json::from_str(context_json)
    .map_err(|error| format!("Invalid collected output context JSON: {error}"))?;
  parsed
    .workspace
    .ok_or_else(|| "Collected output context is missing workspace".to_string())
}

fn handle_load_config_from_file(input: &str) -> Result<String, String> {
  let payload: FilePathPayload = parse_input(input)?;
  let result = ConfigLoader::with_defaults().load_from_file(Path::new(&payload.file_path))?;

  if result.found {
    ok_json(Some(result.config))
  } else {
    ok_json(Option::<Value>::None)
  }
}

fn handle_load_config(input: &str) -> Result<String, String> {
  let payload: CwdPayload = parse_input(input)?;
  let cwd = payload.cwd.unwrap_or_else(|| current_dir_fallback().to_string_lossy().into_owned());
  let result = tnmsc::load_config(Path::new(&cwd)).map_err(|error| error.to_string())?;
  ok_json(result)
}

fn handle_resolve_execution_plan(input: &str) -> Result<String, String> {
  let payload: ResolveExecutionPlanPayload = parse_input(input)?;
  let workspace = deserialize_workspace_from_context(&payload.context_json)?;
  let plan = resolve_execution_plan(&workspace, &payload.execution_cwd);
  ok_json(plan)
}

fn handle_filter_path_scoped_entries(input: &str) -> Result<String, String> {
  let payload: FilterPathScopedEntriesPayload = parse_input(input)?;
  let workspace = deserialize_workspace_from_context(&payload.context_json)?;
  let plan: ExecutionPlan = serde_json::from_str(&payload.plan_json)
    .map_err(|error| format!("Invalid execution plan JSON: {error}"))?;
  let managed_projects = collect_managed_projects(&workspace);
  let workspace_dir = workspace.directory.path.clone();

  let filtered = filter_path_scoped_entries(
    payload.entries,
    &plan,
    &workspace_dir,
    &managed_projects,
    |entry| entry.path.as_str(),
    |entry| entry.scope.as_deref(),
  );
  ok_json(filtered)
}

fn handle_collect_workspace(input: &str) -> Result<String, String> {
  let payload: Option<String> = parse_input(input)?;
  ok_json(tnmsc::core::input_plugins::workspace::collect_workspace(&string_or_default(payload)).map_err(|error| error.to_string())?)
}

fn handle_collect_global_memory(input: &str) -> Result<String, String> {
  let payload: Option<String> = parse_input(input)?;
  ok_json(tnmsc::core::input_plugins::global_memory::collect_global_memory(&string_or_default(payload)).map_err(|error| error.to_string())?)
}

fn handle_collect_aindex_resolvers(input: &str) -> Result<String, String> {
  let payload: Option<String> = parse_input(input)?;
  ok_json(tnmsc::core::input_plugins::aindex_resolvers::collect_aindex_resolvers(&string_or_default(payload)).map_err(|error| error.to_string())?)
}

fn handle_collect_vscode_config(input: &str) -> Result<String, String> {
  let payload: Option<String> = parse_input(input)?;
  ok_json(tnmsc::core::input_plugins::vscode_config::collect_vscode_config(&string_or_default(payload)).map_err(|error| error.to_string())?)
}

fn handle_collect_zed_config(input: &str) -> Result<String, String> {
  let payload: Option<String> = parse_input(input)?;
  ok_json(tnmsc::core::input_plugins::zed_config::collect_zed_config(&string_or_default(payload)).map_err(|error| error.to_string())?)
}

fn handle_collect_jetbrains_config(input: &str) -> Result<String, String> {
  let payload: Option<String> = parse_input(input)?;
  ok_json(tnmsc::core::input_plugins::jetbrains_config::collect_jetbrains_config(&string_or_default(payload)).map_err(|error| error.to_string())?)
}

fn handle_collect_editorconfig(input: &str) -> Result<String, String> {
  let payload: Option<String> = parse_input(input)?;
  ok_json(tnmsc::core::input_plugins::editorconfig::collect_editorconfig(&string_or_default(payload)).map_err(|error| error.to_string())?)
}

fn handle_collect_skill(input: &str) -> Result<String, String> {
  let payload: Option<String> = parse_input(input)?;
  ok_json(tnmsc::core::input_plugins::skill::collect_skill(&string_or_default(payload)).map_err(|error| error.to_string())?)
}

fn handle_collect_command(input: &str) -> Result<String, String> {
  let payload: Option<String> = parse_input(input)?;
  ok_json(tnmsc::core::input_plugins::command::collect_command(&string_or_default(payload)).map_err(|error| error.to_string())?)
}

fn handle_collect_subagent(input: &str) -> Result<String, String> {
  let payload: Option<String> = parse_input(input)?;
  ok_json(tnmsc::core::input_plugins::subagent::collect_subagent(&string_or_default(payload)).map_err(|error| error.to_string())?)
}

fn handle_collect_rule(input: &str) -> Result<String, String> {
  let payload: Option<String> = parse_input(input)?;
  ok_json(tnmsc::core::input_plugins::rule::collect_rule(&string_or_default(payload)).map_err(|error| error.to_string())?)
}

fn handle_collect_project_prompt(input: &str) -> Result<String, String> {
  let payload: Option<String> = parse_input(input)?;
  ok_json(tnmsc::core::input_plugins::project_prompt::collect_project_prompt(&string_or_default(payload)).map_err(|error| error.to_string())?)
}

fn handle_collect_readme(input: &str) -> Result<String, String> {
  let payload: Option<String> = parse_input(input)?;
  ok_json(tnmsc::core::input_plugins::readme::collect_readme(&string_or_default(payload)).map_err(|error| error.to_string())?)
}

fn handle_collect_gitignore(input: &str) -> Result<String, String> {
  let payload: Option<String> = parse_input(input)?;
  ok_json(tnmsc::core::input_plugins::gitignore::collect_gitignore(&string_or_default(payload)).map_err(|error| error.to_string())?)
}

fn handle_collect_git_exclude(input: &str) -> Result<String, String> {
  let payload: Option<String> = parse_input(input)?;
  ok_json(tnmsc::core::input_plugins::git_exclude::collect_git_exclude(&string_or_default(payload)).map_err(|error| error.to_string())?)
}

fn handle_collect_shared_ignore(input: &str) -> Result<String, String> {
  let payload: Option<String> = parse_input(input)?;
  ok_json(tnmsc::core::input_plugins::shared_ignore::collect_shared_ignore(&string_or_default(payload)).map_err(|error| error.to_string())?)
}

fn handle_validate_public_path(input: &str) -> Result<String, String> {
  let payload: ValidatePublicPathPayload = parse_input(input)?;
  ok_json(
    tnmsc::script_runtime::validate_public_path_impl(
      &payload.resolved_path,
      &payload.aindex_public_dir,
    )
    .map_err(|error| error.to_string())?,
  )
}

fn handle_resolve_public_path(input: &str) -> Result<String, String> {
  let payload: ResolvePublicPathPayload = parse_input(input)?;
  ok_json(
    tnmsc::script_runtime::resolve_public_path_impl(
      &payload.file_path,
      &payload.ctx_json,
      &payload.logical_path,
    )
    .map_err(|error| error.to_string())?,
  )
}

fn handle_compile_mdx_to_md(input: &str) -> Result<String, String> {
  let payload: CompileMdxToMdPayload = parse_input(input)?;
  let options = match payload.options_json {
    Some(options_json) => Some(
      serde_json::from_str::<tnmsc::MdxToMdOptions>(&options_json)
        .map_err(|error| format!("Invalid mdxToMd options JSON: {error}"))?,
    ),
    None => None,
  };

  let response = if options.as_ref().is_some_and(|options| options.extract_metadata) {
    let result = tnmsc::mdx_to_md_with_metadata(&payload.content, options)
      .map_err(|error| error.to_string())?;
    let mut fields = result
      .metadata
      .yaml_front_matter
      .unwrap_or_default();
    fields.extend(result.metadata.exports);
    json!({
      "content": result.content,
      "metadata": {
        "fields": fields,
        "source": result.metadata.source.as_str()
      }
    })
  } else {
    let content = tnmsc::mdx_to_md(&payload.content, options).map_err(|error| error.to_string())?;
    json!({
      "content": content
    })
  };

  ok_json(serde_json::to_string(&response).map_err(|error| error.to_string())?)
}

fn handle_build_toml_document(input: &str) -> Result<String, String> {
  let payload: BuildTomlDocumentPayload = parse_input(input)?;
  let document = serde_json::from_str::<Value>(&payload.document_json)
    .map_err(|error| format!("Invalid TOML document JSON: {error}"))?;
  let options = match payload.options_json {
    Some(options_json) => Some(
      serde_json::from_str::<tnmsc::BuildTomlDocumentOptions>(&options_json)
        .map_err(|error| format!("Invalid TOML options JSON: {error}"))?,
    ),
    None => None,
  };
  ok_json(tnmsc::build_toml_document(document, options).map_err(|error| error.to_string())?)
}

fn handle_build_prompt_toml_artifact(input: &str) -> Result<String, String> {
  let payload: BuildPromptTomlArtifactPayload = parse_input(input)?;
  let options = serde_json::from_str::<tnmsc::BuildPromptTomlArtifactOptions>(&payload.options_json)
    .map_err(|error| format!("Invalid prompt TOML options JSON: {error}"))?;
  ok_json(tnmsc::build_prompt_toml_artifact(options).map_err(|error| error.to_string())?)
}

fn handle_collect_base_output_plans(input: &str) -> Result<String, String> {
  let payload: Option<String> = parse_input(input)?;
  ok_json(tnmsc::core::base_output_plans::collect_base_output_plans(&string_or_default(payload)).map_err(|error| error.to_string())?)
}

fn handle_collect_gemini_output_plan(input: &str) -> Result<String, String> {
  let payload: Option<String> = parse_input(input)?;
  ok_json(tnmsc::core::gemini_output_plan::collect_gemini_output_plan(&string_or_default(payload)).map_err(|error| error.to_string())?)
}

fn handle_collect_droid_output_plan(input: &str) -> Result<String, String> {
  let payload: Option<String> = parse_input(input)?;
  ok_json(tnmsc::core::droid_output_plan::collect_droid_output_plan(&string_or_default(payload)).map_err(|error| error.to_string())?)
}

fn handle_perform_skill_dist_cleanup(input: &str) -> Result<String, String> {
  let payload: SkillDistCleanupPayload = parse_input(input)?;
  let result = tnmsc::core::skill_dist_cleanup::perform_skill_dist_cleanup(
    &payload.dist_skills_dir,
    payload.dry_run,
  );
  ok_json(serde_json::to_string(&result).map_err(|error| error.to_string())?)
}

fn handle_perform_md_cleanup(input: &str) -> Result<String, String> {
  let payload: MdCleanupPayload = parse_input(input)?;
  let result = tnmsc::core::md_cleanup::perform_md_cleanup(&payload.dirs, payload.dry_run);
  ok_json(serde_json::to_string(&result).map_err(|error| error.to_string())?)
}

fn handle_plan_cleanup(input: &str) -> Result<String, String> {
  let payload: Option<String> = parse_input(input)?;
  let snapshot_json = string_or_default(payload);
  let snapshot = serde_json::from_str::<tnmsc::core::cleanup::CleanupSnapshot>(&snapshot_json)
    .map_err(|error| format!("Invalid cleanup snapshot JSON: {error}"))?;
  let result = tnmsc::core::cleanup::plan_cleanup(snapshot).map_err(|error| error.to_string())?;
  ok_json(serde_json::to_string(&result).map_err(|error| error.to_string())?)
}

fn handle_perform_cleanup(input: &str) -> Result<String, String> {
  let payload: Option<String> = parse_input(input)?;
  let snapshot_json = string_or_default(payload);
  let snapshot = serde_json::from_str::<tnmsc::core::cleanup::CleanupSnapshot>(&snapshot_json)
    .map_err(|error| format!("Invalid cleanup snapshot JSON: {error}"))?;
  let result = tnmsc::core::cleanup::perform_cleanup(snapshot).map_err(|error| error.to_string())?;
  ok_json(serde_json::to_string(&result).map_err(|error| error.to_string())?)
}

fn handle_sync_windows_config_into_wsl(input: &str) -> Result<String, String> {
  let payload: SyncWindowsConfigIntoWslPayload = parse_input(input)?;
  let context = serde_json::from_str::<CollectedInputContext>(&payload.context_json)
    .map_err(|error| format!("Invalid collected output context JSON: {error}"))?;
  let declarations = serde_json::from_str::<Vec<WslMirrorFileDeclaration>>(&payload.declarations_json)
    .map_err(|error| format!("Invalid WSL mirror declarations JSON: {error}"))?;
  let result = tnmsc::core::wsl_mirror_sync::sync_windows_config_into_wsl(
    &context,
    &declarations,
    payload.dry_run,
  );
  ok_json(serde_json::to_string(&result).map_err(|error| error.to_string())?)
}

fn handle_resolve_effective_include_series(input: &str) -> Result<String, String> {
  let payload: JsonArrayStringPayload = parse_input(input)?;
  let result = tnmsc::core::config::series_filter::resolve_effective_include_series_core(
    payload.top_level.as_deref(),
    payload.type_specific.as_deref(),
  );
  ok_json(result)
}

fn handle_matches_series(input: &str) -> Result<String, String> {
  let payload: MatchesSeriesPayload = parse_input(input)?;
  let seri_name = match payload.seri_name {
    None | Some(Value::Null) => None,
    Some(Value::String(value)) => Some(tnmsc::core::config::series_filter::SeriName::Single(value)),
    Some(Value::Array(values)) => {
      let items = values
        .into_iter()
        .map(|value| match value {
          Value::String(item) => Ok(item),
          other => Err(format!("Invalid seriName array value: {other}")),
        })
        .collect::<Result<Vec<_>, _>>()?;
      Some(tnmsc::core::config::series_filter::SeriName::Multiple(items))
    }
    Some(other) => return Err(format!("Invalid seriName payload: {other}")),
  };

  let result = tnmsc::core::config::series_filter::matches_series_core(
    seri_name.as_ref(),
    &payload.effective_include_series,
  );
  ok_json(result)
}

fn handle_resolve_sub_series(input: &str) -> Result<String, String> {
  let payload: ResolveSubSeriesPayload = parse_input(input)?;
  let result = tnmsc::core::config::series_filter::resolve_sub_series_core(
    payload.top_level.as_ref(),
    payload.type_specific.as_ref(),
  );
  ok_json(result)
}

fn handle_topological_sort_nodes(input: &str) -> Result<String, String> {
  let nodes: Vec<DependencyNodeInput> = parse_input(input)?;
  match topological_sort_nodes(&nodes) {
    Ok(result) => ok_json(result),
    Err(error) => Err(dependency_error_message(error)),
  }
}

fn handle_topological_sort(input: &str) -> Result<String, String> {
  let payload: Option<String> = parse_input(input)?;
  match topological_sort(&string_or_default(payload)) {
    Ok(result) => ok_json(result),
    Err(error) => Err(dependency_error_message(error)),
  }
}

fn dispatch(method: &str, input: &str) -> Result<String, String> {
  match method {
    "loadConfigFromFile" => handle_load_config_from_file(input),
    "loadConfig" => handle_load_config(input),
    "resolveExecutionPlan" => handle_resolve_execution_plan(input),
    "filterPathScopedEntriesForExecutionPlan" => handle_filter_path_scoped_entries(input),
    "collectWorkspace" => handle_collect_workspace(input),
    "collectGlobalMemory" => handle_collect_global_memory(input),
    "collectAindexResolvers" => handle_collect_aindex_resolvers(input),
    "collectVSCodeConfig" => handle_collect_vscode_config(input),
    "collectZedConfig" => handle_collect_zed_config(input),
    "collectJetBrainsConfig" => handle_collect_jetbrains_config(input),
    "collectEditorconfig" => handle_collect_editorconfig(input),
    "collectSkill" => handle_collect_skill(input),
    "collectCommand" => handle_collect_command(input),
    "collectSubAgent" => handle_collect_subagent(input),
    "collectRule" => handle_collect_rule(input),
    "collectProjectPrompt" => handle_collect_project_prompt(input),
    "collectReadme" => handle_collect_readme(input),
    "collectGitignore" => handle_collect_gitignore(input),
    "collectGitExclude" => handle_collect_git_exclude(input),
    "collectSharedIgnore" => handle_collect_shared_ignore(input),
    "validatePublicPath" => handle_validate_public_path(input),
    "resolvePublicPath" => handle_resolve_public_path(input),
    "compileMdxToMd" => handle_compile_mdx_to_md(input),
    "buildTomlDocument" => handle_build_toml_document(input),
    "buildPromptTomlArtifact" => handle_build_prompt_toml_artifact(input),
    "collectBaseOutputPlans" => handle_collect_base_output_plans(input),
    "collectGeminiOutputPlan" => handle_collect_gemini_output_plan(input),
    "collectDroidOutputPlan" => handle_collect_droid_output_plan(input),
    "performSkillDistCleanup" => handle_perform_skill_dist_cleanup(input),
    "performMdCleanup" => handle_perform_md_cleanup(input),
    "planCleanup" => handle_plan_cleanup(input),
    "performCleanup" => handle_perform_cleanup(input),
    "syncWindowsConfigIntoWsl" => handle_sync_windows_config_into_wsl(input),
    "resolveEffectiveIncludeSeries" => handle_resolve_effective_include_series(input),
    "matchesSeries" => handle_matches_series(input),
    "resolveSubSeries" => handle_resolve_sub_series(input),
    "topologicalSortNodes" => handle_topological_sort_nodes(input),
    "topologicalSort" => handle_topological_sort(input),
    _ => Err(format!("Unsupported native host method: {method}")),
  }
}

pub fn execute(args: &NativeHostArgs) -> ExitCode {
  let input = match read_stdin() {
    Ok(input) => input,
    Err(error) => {
      eprintln!("{error}");
      return ExitCode::FAILURE;
    }
  };

  match dispatch(&args.method, &input) {
    Ok(output) => {
      println!("{output}");
      ExitCode::SUCCESS
    }
    Err(error) => {
      eprintln!("{error}");
      ExitCode::FAILURE
    }
  }
}

pub use NativeHostArgs as Args;
