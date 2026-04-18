use crate::domain::config::{
  self, AindexConfig, ConfigLoader, DEFAULT_AINDEX_DIR_NAME, DEFAULT_COMMANDS_DIST_DIR,
  DEFAULT_COMMANDS_SRC_DIR, DEFAULT_GLOBAL_PROMPT_DIST, DEFAULT_GLOBAL_PROMPT_SRC,
  DEFAULT_RULES_DIST_DIR, DEFAULT_RULES_SRC_DIR, DEFAULT_SKILLS_DIST_DIR, DEFAULT_SKILLS_SRC_DIR,
  DEFAULT_SUB_AGENTS_DIST_DIR, DEFAULT_SUB_AGENTS_SRC_DIR, DEFAULT_WORKSPACE_PROMPT_DIST,
  DEFAULT_WORKSPACE_PROMPT_SRC, DirPair, UserConfigFile,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeSet, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

pub const SOURCE_PROMPT_EXTENSION: &str = ".src.mdx";
pub const MDX_EXTENSION: &str = ".mdx";
pub const PROJECT_MEMORY_FILE_NAME: &str = "agt";
pub const SKILL_ENTRY_FILE_NAME: &str = "skill";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ManagedPromptKind {
  GlobalMemory,
  WorkspaceMemory,
  ProjectMemory,
  ProjectChildMemory,
  Skill,
  SkillChildDoc,
  Command,
  Subagent,
  Rule,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PromptArtifactState {
  Missing,
  Stale,
  Ready,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PromptSourceLocale {
  Zh,
  En,
}

// ---------------------------------------------------------------------------
// Public DTOs
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptServiceOptions {
  #[serde(skip_serializing_if = "Option::is_none")]
  pub cwd: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub load_user_config: Option<bool>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub plugin_options: Option<Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListPromptsOptions {
  #[serde(flatten)]
  pub base: PromptServiceOptions,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub kinds: Option<Vec<ManagedPromptKind>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub query: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub en_status: Option<Vec<PromptArtifactState>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub dist_status: Option<Vec<PromptArtifactState>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptArtifactRecord {
  pub path: String,
  pub exists: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub mtime: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub mtime_ms: Option<i64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub size: Option<u64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub legacy_source: Option<bool>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub front_matter: Option<Value>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptCatalogPaths {
  pub zh: String,
  pub en: String,
  pub dist: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptCatalogPresence {
  pub zh: bool,
  pub en: bool,
  pub dist: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptCatalogItem {
  pub prompt_id: String,
  pub kind: ManagedPromptKind,
  pub logical_name: String,
  pub paths: PromptCatalogPaths,
  pub exists: PromptCatalogPresence,
  pub en_status: PromptArtifactState,
  pub dist_status: PromptArtifactState,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub updated_at: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub legacy_zh_source: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptSourceArtifacts {
  #[serde(skip_serializing_if = "Option::is_none")]
  pub zh: Option<PromptArtifactRecord>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub en: Option<PromptArtifactRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptDetails {
  #[serde(flatten)]
  pub catalog: PromptCatalogItem,
  pub src: PromptSourceArtifacts,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub dist: Option<PromptArtifactRecord>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub front_matter: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertPromptSourceInput {
  #[serde(flatten)]
  pub base: PromptServiceOptions,
  pub prompt_id: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub locale: Option<PromptSourceLocale>,
  pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WritePromptArtifactsInput {
  #[serde(flatten)]
  pub base: PromptServiceOptions,
  pub prompt_id: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub en_content: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub dist_content: Option<String>,
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct ResolvedPromptEnvironment {
  _workspace_dir: String,
  aindex_dir: PathBuf,
  options: UserConfigFile,
}

#[derive(Debug, Clone)]
struct PromptDefinition {
  prompt_id: String,
  kind: ManagedPromptKind,
  logical_name: String,
  paths: PromptCatalogPaths,
  legacy_zh_path: Option<String>,
}

#[derive(Debug, Clone)]
struct PromptIdDescriptor {
  kind: ManagedPromptKind,
  series_name: Option<String>,
  project_name: Option<String>,
  relative_name: Option<String>,
  skill_name: Option<String>,
}

impl Default for PromptIdDescriptor {
  fn default() -> Self {
    Self {
      kind: ManagedPromptKind::GlobalMemory,
      series_name: None,
      project_name: None,
      relative_name: None,
      skill_name: None,
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn kind_to_string(kind: ManagedPromptKind) -> &'static str {
  match kind {
    ManagedPromptKind::GlobalMemory => "global-memory",
    ManagedPromptKind::WorkspaceMemory => "workspace-memory",
    ManagedPromptKind::ProjectMemory => "project-memory",
    ManagedPromptKind::ProjectChildMemory => "project-child-memory",
    ManagedPromptKind::Skill => "skill",
    ManagedPromptKind::SkillChildDoc => "skill-child-doc",
    ManagedPromptKind::Command => "command",
    ManagedPromptKind::Subagent => "subagent",
    ManagedPromptKind::Rule => "rule",
  }
}

fn normalize_slash_path(value: &str) -> String {
  value.replace('\\', "/")
}

fn normalize_relative_identifier(value: &str, field_name: &str) -> Result<String, String> {
  let normalized = normalize_slash_path(value).trim().to_string();
  if normalized.is_empty() {
    return Err(format!("{} cannot be empty", field_name));
  }
  for seg in normalized.split('/') {
    if seg.is_empty() || seg == "." || seg == ".." {
      return Err(format!("{} contains an invalid path segment", field_name));
    }
  }
  Ok(normalized)
}

fn is_single_segment_identifier(value: &str) -> bool {
  !normalize_slash_path(value).contains('/')
}

fn is_aindex_project_series_name(name: &str) -> bool {
  matches!(name, "app" | "ext" | "arch" | "softwares")
}

fn resolve_configured_path(raw_path: &str, workspace_dir: &str) -> PathBuf {
  let resolved = if raw_path.contains("${WORKSPACE}") {
    raw_path.replace("${WORKSPACE}", workspace_dir)
  } else {
    raw_path.to_string()
  };
  config::resolve_tilde(&resolved)
}

fn resolve_prompt_environment(
  options: &PromptServiceOptions,
) -> Result<ResolvedPromptEnvironment, String> {
  let cwd = options.cwd.as_deref().unwrap_or(".");
  let mut user_config = UserConfigFile::default();
  if options.load_user_config != Some(false) {
    let loader = ConfigLoader::with_defaults();
    let result = loader.load(Path::new(cwd));
    if result.found {
      user_config = result.config;
    }
  }

  let workspace_dir = user_config.workspace_dir.as_deref().unwrap_or(cwd);
  let workspace_dir = resolve_configured_path(workspace_dir, "")
    .to_string_lossy()
    .to_string();
  let aindex_dir_name = user_config
    .aindex
    .dir
    .as_deref()
    .unwrap_or(DEFAULT_AINDEX_DIR_NAME);
  let aindex_dir = Path::new(&workspace_dir).join(aindex_dir_name);

  Ok(ResolvedPromptEnvironment {
    _workspace_dir: workspace_dir,
    aindex_dir,
    options: user_config,
  })
}

fn derive_english_source_path(zh_path: &str) -> String {
  if let Some(base) = zh_path.strip_suffix(SOURCE_PROMPT_EXTENSION) {
    format!("{}{}", base, MDX_EXTENSION)
  } else {
    let p = Path::new(zh_path);
    if p.extension().and_then(|e| e.to_str()) == Some("mdx") {
      zh_path.to_string()
    } else {
      format!("{}{}", zh_path, MDX_EXTENSION)
    }
  }
}

fn strip_prompt_extension(file_path: &str) -> String {
  if let Some(stripped) = file_path.strip_suffix(SOURCE_PROMPT_EXTENSION) {
    stripped.to_string()
  } else if let Some(stripped) = file_path.strip_suffix(MDX_EXTENSION) {
    stripped.to_string()
  } else {
    file_path.to_string()
  }
}

fn list_files(cwd: &Path, suffixes: &[&str]) -> Vec<String> {
  if !cwd.is_dir() {
    return vec![];
  }
  let mut results = Vec::new();
  for entry in walkdir::WalkDir::new(cwd).into_iter().flatten() {
    if !entry.file_type().is_file() {
      continue;
    }
    if let Some(name) = entry.file_name().to_str()
      && suffixes.iter().any(|s| name.ends_with(s))
    {
      let rel = entry.path().strip_prefix(cwd).unwrap_or(entry.path());
      results.push(normalize_slash_path(&rel.to_string_lossy()));
    }
  }
  results
}

fn get_aindex_pair<'a>(config: &'a AindexConfig, kind: &str) -> Option<&'a DirPair> {
  match kind {
    "skills" => config.skills.as_ref(),
    "commands" => config.commands.as_ref(),
    "subagents" => config.sub_agents.as_ref(),
    "rules" => config.rules.as_ref(),
    "app" => config.app.as_ref(),
    "ext" => config.ext.as_ref(),
    "arch" => config.arch.as_ref(),
    _ => None,
  }
}

// ---------------------------------------------------------------------------
// Definition builders
// ---------------------------------------------------------------------------

fn build_global_memory_definition(env: &ResolvedPromptEnvironment) -> PromptDefinition {
  let pair = env.options.aindex.global_prompt.clone().unwrap_or_default();
  let zh_path = env
    .aindex_dir
    .join(pair.src.as_deref().unwrap_or(DEFAULT_GLOBAL_PROMPT_SRC));
  PromptDefinition {
    prompt_id: "global-memory".to_string(),
    kind: ManagedPromptKind::GlobalMemory,
    logical_name: "global-memory".to_string(),
    paths: PromptCatalogPaths {
      zh: zh_path.to_string_lossy().to_string(),
      en: derive_english_source_path(&zh_path.to_string_lossy()),
      dist: env
        .aindex_dir
        .join(pair.dist.as_deref().unwrap_or(DEFAULT_GLOBAL_PROMPT_DIST))
        .to_string_lossy()
        .to_string(),
    },
    legacy_zh_path: None,
  }
}

fn build_workspace_memory_definition(env: &ResolvedPromptEnvironment) -> PromptDefinition {
  let pair = env
    .options
    .aindex
    .workspace_prompt
    .clone()
    .unwrap_or_default();
  let zh_path = env
    .aindex_dir
    .join(pair.src.as_deref().unwrap_or(DEFAULT_WORKSPACE_PROMPT_SRC));
  PromptDefinition {
    prompt_id: "workspace-memory".to_string(),
    kind: ManagedPromptKind::WorkspaceMemory,
    logical_name: "workspace-memory".to_string(),
    paths: PromptCatalogPaths {
      zh: zh_path.to_string_lossy().to_string(),
      en: derive_english_source_path(&zh_path.to_string_lossy()),
      dist: env
        .aindex_dir
        .join(
          pair
            .dist
            .as_deref()
            .unwrap_or(DEFAULT_WORKSPACE_PROMPT_DIST),
        )
        .to_string_lossy()
        .to_string(),
    },
    legacy_zh_path: None,
  }
}

fn build_project_memory_definition(
  env: &ResolvedPromptEnvironment,
  series_name: &str,
  project_name: &str,
  relative_name: Option<&str>,
) -> Result<PromptDefinition, String> {
  let normalized_project_name = normalize_relative_identifier(project_name, "projectName")?;
  if !is_single_segment_identifier(&normalized_project_name) {
    return Err("projectName must be a single path segment".to_string());
  }
  let normalized_relative_name = match relative_name {
    Some(r) => normalize_relative_identifier(r, "relativeName")?,
    None => "".to_string(),
  };
  let pair = get_aindex_pair(&env.options.aindex, series_name);
  let source_dir = if normalized_relative_name.is_empty() {
    env
      .aindex_dir
      .join(pair.and_then(|p| p.src.as_deref()).unwrap_or(series_name))
      .join(&normalized_project_name)
  } else {
    env
      .aindex_dir
      .join(pair.and_then(|p| p.src.as_deref()).unwrap_or(series_name))
      .join(&normalized_project_name)
      .join(&normalized_relative_name)
  };
  let dist_dir = if normalized_relative_name.is_empty() {
    env
      .aindex_dir
      .join(
        pair
          .and_then(|p| p.dist.as_deref())
          .unwrap_or(&format!("dist/{}", series_name)),
      )
      .join(&normalized_project_name)
  } else {
    env
      .aindex_dir
      .join(
        pair
          .and_then(|p| p.dist.as_deref())
          .unwrap_or(&format!("dist/{}", series_name)),
      )
      .join(&normalized_project_name)
      .join(&normalized_relative_name)
  };
  let legacy_path = source_dir.join(format!("{}{}", PROJECT_MEMORY_FILE_NAME, MDX_EXTENSION));
  let logical_suffix = if normalized_relative_name.is_empty() {
    format!("{}/{}", series_name, normalized_project_name)
  } else {
    format!(
      "{}/{}/{}",
      series_name, normalized_project_name, normalized_relative_name
    )
  };

  Ok(PromptDefinition {
    prompt_id: if normalized_relative_name.is_empty() {
      format!("project-memory:{}", logical_suffix)
    } else {
      format!("project-child-memory:{}", logical_suffix)
    },
    kind: if normalized_relative_name.is_empty() {
      ManagedPromptKind::ProjectMemory
    } else {
      ManagedPromptKind::ProjectChildMemory
    },
    logical_name: logical_suffix,
    paths: PromptCatalogPaths {
      zh: source_dir
        .join(format!(
          "{}{}",
          PROJECT_MEMORY_FILE_NAME, SOURCE_PROMPT_EXTENSION
        ))
        .to_string_lossy()
        .to_string(),
      en: legacy_path.to_string_lossy().to_string(),
      dist: dist_dir
        .join(format!("{}{}", PROJECT_MEMORY_FILE_NAME, MDX_EXTENSION))
        .to_string_lossy()
        .to_string(),
    },
    legacy_zh_path: Some(legacy_path.to_string_lossy().to_string()),
  })
}

fn build_skill_definition(
  env: &ResolvedPromptEnvironment,
  skill_name: &str,
) -> Result<PromptDefinition, String> {
  let normalized = normalize_relative_identifier(skill_name, "skillName")?;
  if !is_single_segment_identifier(&normalized) {
    return Err("skillName must be a single path segment".to_string());
  }
  let pair = env.options.aindex.skills.as_ref();
  let source_dir = env
    .aindex_dir
    .join(
      pair
        .and_then(|p| p.src.as_deref())
        .unwrap_or(DEFAULT_SKILLS_SRC_DIR),
    )
    .join(&normalized);
  let dist_dir = env
    .aindex_dir
    .join(
      pair
        .and_then(|p| p.dist.as_deref())
        .unwrap_or(DEFAULT_SKILLS_DIST_DIR),
    )
    .join(&normalized);
  Ok(PromptDefinition {
    prompt_id: format!("skill:{}", normalized),
    kind: ManagedPromptKind::Skill,
    logical_name: normalized.clone(),
    paths: PromptCatalogPaths {
      zh: source_dir
        .join(format!(
          "{}{}",
          SKILL_ENTRY_FILE_NAME, SOURCE_PROMPT_EXTENSION
        ))
        .to_string_lossy()
        .to_string(),
      en: source_dir
        .join(format!("{}{}", SKILL_ENTRY_FILE_NAME, MDX_EXTENSION))
        .to_string_lossy()
        .to_string(),
      dist: dist_dir
        .join(format!("{}{}", SKILL_ENTRY_FILE_NAME, MDX_EXTENSION))
        .to_string_lossy()
        .to_string(),
    },
    legacy_zh_path: None,
  })
}

fn build_skill_child_doc_definition(
  env: &ResolvedPromptEnvironment,
  skill_name: &str,
  relative_name: &str,
) -> Result<PromptDefinition, String> {
  let normalized_skill = normalize_relative_identifier(skill_name, "skillName")?;
  let normalized_relative = normalize_relative_identifier(relative_name, "relativeName")?;
  if !is_single_segment_identifier(&normalized_skill) {
    return Err("skillName must be a single path segment".to_string());
  }
  let pair = env.options.aindex.skills.as_ref();
  let source_dir = env
    .aindex_dir
    .join(
      pair
        .and_then(|p| p.src.as_deref())
        .unwrap_or(DEFAULT_SKILLS_SRC_DIR),
    )
    .join(&normalized_skill);
  let dist_dir = env
    .aindex_dir
    .join(
      pair
        .and_then(|p| p.dist.as_deref())
        .unwrap_or(DEFAULT_SKILLS_DIST_DIR),
    )
    .join(&normalized_skill);
  Ok(PromptDefinition {
    prompt_id: format!(
      "skill-child-doc:{}/{}",
      normalized_skill, normalized_relative
    ),
    kind: ManagedPromptKind::SkillChildDoc,
    logical_name: format!("{}/{}", normalized_skill, normalized_relative),
    paths: PromptCatalogPaths {
      zh: source_dir
        .join(format!(
          "{}{}",
          normalized_relative, SOURCE_PROMPT_EXTENSION
        ))
        .to_string_lossy()
        .to_string(),
      en: source_dir
        .join(format!("{}{}", normalized_relative, MDX_EXTENSION))
        .to_string_lossy()
        .to_string(),
      dist: dist_dir
        .join(format!("{}{}", normalized_relative, MDX_EXTENSION))
        .to_string_lossy()
        .to_string(),
    },
    legacy_zh_path: None,
  })
}

fn build_flat_prompt_definition(
  env: &ResolvedPromptEnvironment,
  kind: ManagedPromptKind,
  relative_name: &str,
) -> Result<PromptDefinition, String> {
  let normalized = normalize_relative_identifier(relative_name, "relativeName")?;
  let (src_default, dist_default) = match kind {
    ManagedPromptKind::Command => (DEFAULT_COMMANDS_SRC_DIR, DEFAULT_COMMANDS_DIST_DIR),
    ManagedPromptKind::Subagent => (DEFAULT_SUB_AGENTS_SRC_DIR, DEFAULT_SUB_AGENTS_DIST_DIR),
    ManagedPromptKind::Rule => (DEFAULT_RULES_SRC_DIR, DEFAULT_RULES_DIST_DIR),
    _ => {
      return Err(format!(
        "Unsupported flat prompt kind: {}",
        kind_to_string(kind)
      ));
    }
  };
  let pair = match kind {
    ManagedPromptKind::Command => env.options.aindex.commands.as_ref(),
    ManagedPromptKind::Subagent => env.options.aindex.sub_agents.as_ref(),
    ManagedPromptKind::Rule => env.options.aindex.rules.as_ref(),
    _ => None,
  };
  let source_dir = env
    .aindex_dir
    .join(pair.and_then(|p| p.src.as_deref()).unwrap_or(src_default));
  let dist_dir = env
    .aindex_dir
    .join(pair.and_then(|p| p.dist.as_deref()).unwrap_or(dist_default));
  let prompt_id = format!("{}:{}", kind_to_string(kind), normalized);
  Ok(PromptDefinition {
    prompt_id,
    kind,
    logical_name: normalized.clone(),
    paths: PromptCatalogPaths {
      zh: source_dir
        .join(format!("{}{}", normalized, SOURCE_PROMPT_EXTENSION))
        .to_string_lossy()
        .to_string(),
      en: source_dir
        .join(format!("{}{}", normalized, MDX_EXTENSION))
        .to_string_lossy()
        .to_string(),
      dist: dist_dir
        .join(format!("{}{}", normalized, MDX_EXTENSION))
        .to_string_lossy()
        .to_string(),
    },
    legacy_zh_path: None,
  })
}

// ---------------------------------------------------------------------------
// Prompt ID parsing
// ---------------------------------------------------------------------------

fn parse_prompt_id(prompt_id: &str) -> Result<PromptIdDescriptor, String> {
  match prompt_id {
    "global-memory" => {
      return Ok(PromptIdDescriptor {
        kind: ManagedPromptKind::GlobalMemory,
        ..Default::default()
      });
    }
    "workspace-memory" => {
      return Ok(PromptIdDescriptor {
        kind: ManagedPromptKind::WorkspaceMemory,
        ..Default::default()
      });
    }
    _ => {}
  }
  let separator_index = prompt_id
    .find(':')
    .ok_or_else(|| format!("Unsupported promptId: {}", prompt_id))?;
  let kind_str = &prompt_id[..separator_index];
  let raw_value = &prompt_id[separator_index + 1..];
  let normalized_value = normalize_relative_identifier(raw_value, "promptId")?;

  match kind_str {
    "project-memory" => {
      parse_project_prompt_descriptor(ManagedPromptKind::ProjectMemory, &normalized_value)
    }
    "project-child-memory" => {
      parse_project_prompt_descriptor(ManagedPromptKind::ProjectChildMemory, &normalized_value)
    }
    "skill" => {
      if !is_single_segment_identifier(&normalized_value) {
        return Err("skill promptId must include a single skill name".to_string());
      }
      Ok(PromptIdDescriptor {
        kind: ManagedPromptKind::Skill,
        skill_name: Some(normalized_value),
        ..Default::default()
      })
    }
    "skill-child-doc" => {
      let parts: Vec<&str> = normalized_value.splitn(2, '/').collect();
      if parts.len() != 2 {
        return Err("skill-child-doc promptId must include skill and child path".to_string());
      }
      Ok(PromptIdDescriptor {
        kind: ManagedPromptKind::SkillChildDoc,
        skill_name: Some(parts[0].to_string()),
        relative_name: Some(parts[1].to_string()),
        ..Default::default()
      })
    }
    "command" => Ok(PromptIdDescriptor {
      kind: ManagedPromptKind::Command,
      relative_name: Some(normalized_value),
      ..Default::default()
    }),
    "subagent" => Ok(PromptIdDescriptor {
      kind: ManagedPromptKind::Subagent,
      relative_name: Some(normalized_value),
      ..Default::default()
    }),
    "rule" => Ok(PromptIdDescriptor {
      kind: ManagedPromptKind::Rule,
      relative_name: Some(normalized_value),
      ..Default::default()
    }),
    _ => Err(format!("Unsupported promptId: {}", prompt_id)),
  }
}

fn parse_project_prompt_descriptor(
  kind: ManagedPromptKind,
  normalized_value: &str,
) -> Result<PromptIdDescriptor, String> {
  let segments: Vec<&str> = normalized_value.split('/').collect();
  let maybe_series = segments.first().copied().unwrap_or("");
  let has_series = is_aindex_project_series_name(maybe_series);
  if kind == ManagedPromptKind::ProjectMemory {
    if has_series {
      if segments.len() != 2 {
        return Err(
          "project-memory promptId must include exactly one project name after the series"
            .to_string(),
        );
      }
      return Ok(PromptIdDescriptor {
        kind,
        series_name: Some(maybe_series.to_string()),
        project_name: Some(segments[1].to_string()),
        ..Default::default()
      });
    }
    if !is_single_segment_identifier(normalized_value) {
      return Err("project-memory promptId must include a single project name".to_string());
    }
    return Ok(PromptIdDescriptor {
      kind,
      series_name: Some("app".to_string()),
      project_name: Some(normalized_value.to_string()),
      ..Default::default()
    });
  }
  // project-child-memory
  if has_series {
    if segments.len() < 3 {
      return Err(
        "project-child-memory promptId must include series, project, and child path".to_string(),
      );
    }
    let relative_name = segments[2..].join("/");
    return Ok(PromptIdDescriptor {
      kind,
      series_name: Some(maybe_series.to_string()),
      project_name: Some(segments[1].to_string()),
      relative_name: Some(relative_name),
      ..Default::default()
    });
  }
  if segments.len() < 2 {
    return Err("project-child-memory promptId must include project and child path".to_string());
  }
  let relative_name = segments[1..].join("/");
  Ok(PromptIdDescriptor {
    kind,
    series_name: Some("app".to_string()),
    project_name: Some(segments[0].to_string()),
    relative_name: Some(relative_name),
    ..Default::default()
  })
}

// ---------------------------------------------------------------------------
// Collectors
// ---------------------------------------------------------------------------

fn collect_flat_prompt_ids(
  env: &ResolvedPromptEnvironment,
  kind: ManagedPromptKind,
) -> Vec<String> {
  let (src_default, dist_default) = match kind {
    ManagedPromptKind::Command => (DEFAULT_COMMANDS_SRC_DIR, DEFAULT_COMMANDS_DIST_DIR),
    ManagedPromptKind::Subagent => (DEFAULT_SUB_AGENTS_SRC_DIR, DEFAULT_SUB_AGENTS_DIST_DIR),
    ManagedPromptKind::Rule => (DEFAULT_RULES_SRC_DIR, DEFAULT_RULES_DIST_DIR),
    _ => return vec![],
  };
  let pair = match kind {
    ManagedPromptKind::Command => env.options.aindex.commands.as_ref(),
    ManagedPromptKind::Subagent => env.options.aindex.sub_agents.as_ref(),
    ManagedPromptKind::Rule => env.options.aindex.rules.as_ref(),
    _ => None,
  };
  let source_dir = env
    .aindex_dir
    .join(pair.and_then(|p| p.src.as_deref()).unwrap_or(src_default));
  let dist_dir = env
    .aindex_dir
    .join(pair.and_then(|p| p.dist.as_deref()).unwrap_or(dist_default));
  let mut names = BTreeSet::new();
  for file in list_files(&source_dir, &[SOURCE_PROMPT_EXTENSION, MDX_EXTENSION]) {
    names.insert(strip_prompt_extension(&file));
  }
  for file in list_files(&dist_dir, &[MDX_EXTENSION]) {
    names.insert(strip_prompt_extension(&file));
  }
  names
    .into_iter()
    .map(|name| format!("{}:{}", kind_to_string(kind), name))
    .collect()
}

fn collect_skill_prompt_ids(env: &ResolvedPromptEnvironment) -> Vec<String> {
  let pair = env.options.aindex.skills.as_ref();
  let source_root = env.aindex_dir.join(
    pair
      .and_then(|p| p.src.as_deref())
      .unwrap_or(DEFAULT_SKILLS_SRC_DIR),
  );
  let dist_root = env.aindex_dir.join(
    pair
      .and_then(|p| p.dist.as_deref())
      .unwrap_or(DEFAULT_SKILLS_DIST_DIR),
  );
  let mut skill_names = BTreeSet::new();
  if source_root.is_dir() {
    for e in fs::read_dir(&source_root).into_iter().flatten().flatten() {
      if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
        skill_names.insert(e.file_name().to_string_lossy().to_string());
      }
    }
  }
  if dist_root.is_dir() {
    for e in fs::read_dir(&dist_root).into_iter().flatten().flatten() {
      if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
        skill_names.insert(e.file_name().to_string_lossy().to_string());
      }
    }
  }
  let mut prompt_ids = Vec::new();
  for skill_name in skill_names {
    prompt_ids.push(format!("skill:{}", skill_name));
    let source_dir = source_root.join(&skill_name);
    let dist_dir = dist_root.join(&skill_name);
    let mut child_names = BTreeSet::new();
    for file in list_files(&source_dir, &[SOURCE_PROMPT_EXTENSION, MDX_EXTENSION]) {
      let stripped = strip_prompt_extension(&file);
      if stripped == SKILL_ENTRY_FILE_NAME {
        continue;
      }
      child_names.insert(stripped);
    }
    for file in list_files(&dist_dir, &[MDX_EXTENSION]) {
      let stripped = strip_prompt_extension(&file);
      if stripped == SKILL_ENTRY_FILE_NAME {
        continue;
      }
      child_names.insert(stripped);
    }
    for child in child_names {
      prompt_ids.push(format!("skill-child-doc:{}/{}", skill_name, child));
    }
  }
  prompt_ids
}

fn collect_project_prompt_ids(env: &ResolvedPromptEnvironment) -> Vec<String> {
  let mut prompt_ids = Vec::new();
  let series_list = vec!["app", "ext", "arch", "softwares"];
  for series_name in series_list {
    let pair = get_aindex_pair(&env.options.aindex, series_name);
    let src_dir = env
      .aindex_dir
      .join(pair.and_then(|p| p.src.as_deref()).unwrap_or(series_name));
    let dist_dir = env.aindex_dir.join(
      pair
        .and_then(|p| p.dist.as_deref())
        .unwrap_or(&format!("dist/{}", series_name)),
    );
    let mut relative_dirs = BTreeSet::new();
    let src_patterns = [
      format!("{}{}", PROJECT_MEMORY_FILE_NAME, SOURCE_PROMPT_EXTENSION),
      format!("{}{}", PROJECT_MEMORY_FILE_NAME, MDX_EXTENSION),
    ];
    let dist_patterns = [format!("{}{}", PROJECT_MEMORY_FILE_NAME, MDX_EXTENSION)];
    for file in list_files(
      &src_dir,
      &src_patterns.iter().map(|s| s.as_str()).collect::<Vec<_>>(),
    ) {
      let dir = Path::new(&file)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| ".".to_string());
      let dir = normalize_slash_path(&dir);
      if dir != "." {
        relative_dirs.insert(dir);
      }
    }
    for file in list_files(
      &dist_dir,
      &dist_patterns.iter().map(|s| s.as_str()).collect::<Vec<_>>(),
    ) {
      let dir = Path::new(&file)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| ".".to_string());
      let dir = normalize_slash_path(&dir);
      if dir != "." {
        relative_dirs.insert(dir);
      }
    }
    for relative_dir in relative_dirs {
      let parts: Vec<&str> = relative_dir.split('/').collect();
      let project_name = parts[0];
      let child_path = parts[1..].join("/");
      if project_name.is_empty() {
        continue;
      }
      prompt_ids.push(if child_path.is_empty() {
        format!("project-memory:{}/{}", series_name, project_name)
      } else {
        format!(
          "project-child-memory:{}/{}/{}",
          series_name, project_name, child_path
        )
      });
    }
  }
  prompt_ids
}

fn collect_discovered_prompt_ids(env: &ResolvedPromptEnvironment) -> Vec<String> {
  let mut prompt_ids = HashSet::new();
  let global = build_global_memory_definition(env);
  let workspace = build_workspace_memory_definition(env);
  if Path::new(&global.paths.zh).exists()
    || Path::new(&global.paths.en).exists()
    || Path::new(&global.paths.dist).exists()
  {
    prompt_ids.insert(global.prompt_id.clone());
  }
  if Path::new(&workspace.paths.zh).exists()
    || Path::new(&workspace.paths.en).exists()
    || Path::new(&workspace.paths.dist).exists()
  {
    prompt_ids.insert(workspace.prompt_id.clone());
  }
  for id in collect_project_prompt_ids(env) {
    prompt_ids.insert(id);
  }
  for id in collect_skill_prompt_ids(env) {
    prompt_ids.insert(id);
  }
  for id in collect_flat_prompt_ids(env, ManagedPromptKind::Command) {
    prompt_ids.insert(id);
  }
  for id in collect_flat_prompt_ids(env, ManagedPromptKind::Subagent) {
    prompt_ids.insert(id);
  }
  for id in collect_flat_prompt_ids(env, ManagedPromptKind::Rule) {
    prompt_ids.insert(id);
  }
  let mut sorted: Vec<_> = prompt_ids.into_iter().collect();
  sorted.sort();
  sorted
}

// ---------------------------------------------------------------------------
// File I/O & front matter
// ---------------------------------------------------------------------------

fn parse_front_matter(content: &str) -> Option<Value> {
  let re = regex_lite::Regex::new(r"(?s)^---\r?\n(.*?)\r?\n---(?:(?:\r?\n){1,2}|$)").ok()?;
  let caps = re.captures(content)?;
  let raw_fm = caps.get(1)?.as_str();
  serde_yml::from_str::<Value>(raw_fm).ok()
}

fn system_time_to_rfc3339(st: std::time::SystemTime) -> String {
  let dt: chrono::DateTime<chrono::Utc> = st.into();
  dt.to_rfc3339()
}

fn read_artifact(
  file_path: &str,
  include_content: bool,
  legacy_source: bool,
) -> Option<PromptArtifactRecord> {
  let path = Path::new(file_path);
  if !path.is_file() {
    return None;
  }
  let meta = fs::metadata(path).ok()?;
  let mtime = meta.modified().ok()?;
  let mtime_ms = mtime
    .duration_since(std::time::UNIX_EPOCH)
    .ok()?
    .as_millis() as i64;
  let mtime_iso = system_time_to_rfc3339(mtime);
  let size = meta.len();
  let raw_content = if include_content {
    fs::read_to_string(path).ok()
  } else {
    None
  };
  let mut record = PromptArtifactRecord {
    path: file_path.to_string(),
    exists: true,
    mtime: Some(mtime_iso),
    mtime_ms: Some(mtime_ms),
    size: Some(size),
    legacy_source: if legacy_source { Some(true) } else { None },
    front_matter: None,
    content: raw_content.clone(),
  };
  if let Some(ref content) = raw_content
    && let Some(fm) = parse_front_matter(content)
  {
    record.front_matter = Some(fm);
  }
  Some(record)
}

fn resolve_artifact_status(
  zh_artifact: Option<&PromptArtifactRecord>,
  target_artifact: Option<&PromptArtifactRecord>,
) -> PromptArtifactState {
  match target_artifact {
    None => PromptArtifactState::Missing,
    Some(t) => match zh_artifact {
      Some(z) if t.mtime_ms.unwrap_or(0) < z.mtime_ms.unwrap_or(0) => PromptArtifactState::Stale,
      _ => PromptArtifactState::Ready,
    },
  }
}

fn hydrate_prompt(definition: &PromptDefinition, include_content: bool) -> Option<PromptDetails> {
  let has_canonical_zh = Path::new(&definition.paths.zh).is_file();
  let legacy_zh_path = definition.legacy_zh_path.as_deref();
  let has_legacy_zh = !has_canonical_zh
    && legacy_zh_path
      .map(|p| Path::new(p).is_file())
      .unwrap_or(false);
  let zh_artifact_path = if has_canonical_zh {
    Some(definition.paths.zh.as_str())
  } else if has_legacy_zh {
    legacy_zh_path
  } else {
    None
  };
  let zh_artifact = zh_artifact_path.and_then(|p| read_artifact(p, include_content, has_legacy_zh));
  let en_artifact = if has_canonical_zh
    || legacy_zh_path
      .map(|p| p != definition.paths.en)
      .unwrap_or(true)
  {
    read_artifact(&definition.paths.en, include_content, false)
  } else {
    None
  };
  let dist_artifact = read_artifact(&definition.paths.dist, include_content, false);

  if zh_artifact.is_none() && en_artifact.is_none() && dist_artifact.is_none() {
    return None;
  }

  let updated_at = [&zh_artifact, &en_artifact, &dist_artifact]
    .iter()
    .filter_map(|a| a.as_ref())
    .max_by_key(|a| a.mtime_ms.unwrap_or(0))
    .and_then(|a| a.mtime.clone());

  let en_status = resolve_artifact_status(zh_artifact.as_ref(), en_artifact.as_ref());
  let dist_status = resolve_artifact_status(zh_artifact.as_ref(), dist_artifact.as_ref());

  let mut src = PromptSourceArtifacts::default();
  if let Some(a) = zh_artifact {
    src.zh = Some(a);
  }
  if let Some(a) = en_artifact {
    src.en = Some(a);
  }

  let front_matter = src
    .zh
    .as_ref()
    .and_then(|a| a.front_matter.clone())
    .or_else(|| src.en.as_ref().and_then(|a| a.front_matter.clone()))
    .or_else(|| dist_artifact.as_ref().and_then(|a| a.front_matter.clone()));

  let catalog = PromptCatalogItem {
    prompt_id: definition.prompt_id.clone(),
    kind: definition.kind,
    logical_name: definition.logical_name.clone(),
    paths: PromptCatalogPaths {
      zh: definition.paths.zh.clone(),
      en: definition.paths.en.clone(),
      dist: definition.paths.dist.clone(),
    },
    exists: PromptCatalogPresence {
      zh: src.zh.is_some(),
      en: src.en.is_some(),
      dist: dist_artifact.is_some(),
    },
    en_status,
    dist_status,
    updated_at,
    legacy_zh_source: if has_legacy_zh { Some(true) } else { None },
  };

  Some(PromptDetails {
    catalog,
    src,
    dist: dist_artifact,
    front_matter,
  })
}

fn matches_filter<T: PartialEq>(value: T, allowed: Option<&Vec<T>>) -> bool {
  match allowed {
    None => true,
    Some(list) if list.is_empty() => true,
    Some(list) => list.contains(&value),
  }
}

fn matches_query(item: &PromptCatalogItem, query: Option<&str>) -> bool {
  match query {
    None => true,
    Some(q) if q.trim().is_empty() => true,
    Some(q) => {
      let lower = q.trim().to_lowercase();
      item.prompt_id.to_lowercase().contains(&lower)
        || item.logical_name.to_lowercase().contains(&lower)
    }
  }
}

fn to_catalog_item(details: &PromptDetails) -> PromptCatalogItem {
  details.catalog.clone()
}

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

fn write_text_file(file_path: &str, content: &str) -> Result<(), String> {
  let path = Path::new(file_path);
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir: {}", e))?;
  }
  fs::write(path, content).map_err(|e| format!("Failed to write file: {}", e))
}

fn is_project_memory_definition(definition: &PromptDefinition) -> bool {
  matches!(
    definition.kind,
    ManagedPromptKind::ProjectMemory | ManagedPromptKind::ProjectChildMemory
  )
}

fn prepare_project_memory_for_english_write(definition: &PromptDefinition) {
  if !is_project_memory_definition(definition) {
    return;
  }
  if Path::new(&definition.paths.zh).exists() {
    return;
  }
  if let Some(ref legacy) = definition.legacy_zh_path
    && Path::new(legacy).is_file()
    && let Ok(content) = fs::read_to_string(legacy)
  {
    let _ = write_text_file(&definition.paths.zh, &content);
  }
}

fn migrate_legacy_project_memory_source_on_zh_write(definition: &PromptDefinition) {
  if !is_project_memory_definition(definition) {
    return;
  }
  if let Some(ref legacy) = definition.legacy_zh_path
    && legacy != &definition.paths.zh
    && Path::new(legacy).exists()
  {
    let _ = fs::remove_file(legacy);
  }
}

// ---------------------------------------------------------------------------
// Build definition from ID
// ---------------------------------------------------------------------------

fn build_prompt_definition_from_id(
  prompt_id: &str,
  env: &ResolvedPromptEnvironment,
) -> Result<PromptDefinition, String> {
  let descriptor = parse_prompt_id(prompt_id)?;
  match descriptor.kind {
    ManagedPromptKind::GlobalMemory => Ok(build_global_memory_definition(env)),
    ManagedPromptKind::WorkspaceMemory => Ok(build_workspace_memory_definition(env)),
    ManagedPromptKind::ProjectMemory => {
      let project_name = descriptor
        .project_name
        .ok_or("project-memory promptId must include a project name")?;
      let series = descriptor.series_name.as_deref().unwrap_or("app");
      build_project_memory_definition(env, series, &project_name, None)
    }
    ManagedPromptKind::ProjectChildMemory => {
      let project_name = descriptor
        .project_name
        .ok_or("project-child-memory promptId must include project and child path")?;
      let relative_name = descriptor
        .relative_name
        .as_deref()
        .ok_or("project-child-memory promptId must include project and child path")?;
      let series = descriptor.series_name.as_deref().unwrap_or("app");
      build_project_memory_definition(env, series, &project_name, Some(relative_name))
    }
    ManagedPromptKind::Skill => {
      let skill_name = descriptor
        .skill_name
        .ok_or("skill promptId must include a skill name")?;
      build_skill_definition(env, &skill_name)
    }
    ManagedPromptKind::SkillChildDoc => {
      let skill_name = descriptor
        .skill_name
        .ok_or("skill-child-doc promptId must include skill and child path")?;
      let relative_name = descriptor
        .relative_name
        .as_deref()
        .ok_or("skill-child-doc promptId must include skill and child path")?;
      build_skill_child_doc_definition(env, &skill_name, relative_name)
    }
    ManagedPromptKind::Command | ManagedPromptKind::Subagent | ManagedPromptKind::Rule => {
      let relative_name = descriptor.relative_name.as_deref().ok_or_else(|| {
        format!(
          "{} promptId must include a relative path",
          kind_to_string(descriptor.kind)
        )
      })?;
      build_flat_prompt_definition(env, descriptor.kind, relative_name)
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

pub fn list_prompts(options: &ListPromptsOptions) -> Result<Vec<PromptCatalogItem>, String> {
  let env = resolve_prompt_environment(&options.base)?;
  let items: Vec<PromptCatalogItem> = collect_discovered_prompt_ids(&env)
    .into_iter()
    .filter_map(|id| {
      let def = build_prompt_definition_from_id(&id, &env).ok()?;
      let hydrated = hydrate_prompt(&def, false)?;
      Some(to_catalog_item(&hydrated))
    })
    .filter(|item| matches_filter(item.kind, options.kinds.as_ref()))
    .filter(|item| matches_filter(item.en_status, options.en_status.as_ref()))
    .filter(|item| matches_filter(item.dist_status, options.dist_status.as_ref()))
    .filter(|item| matches_query(item, options.query.as_deref()))
    .collect();
  Ok(items)
}

pub fn get_prompt(
  prompt_id: &str,
  options: &PromptServiceOptions,
) -> Result<Option<PromptDetails>, String> {
  let env = resolve_prompt_environment(options)?;
  let def = build_prompt_definition_from_id(prompt_id, &env)?;
  Ok(hydrate_prompt(&def, true))
}

pub fn upsert_prompt_source(input: &UpsertPromptSourceInput) -> Result<PromptDetails, String> {
  let env = resolve_prompt_environment(&input.base)?;
  let definition = build_prompt_definition_from_id(&input.prompt_id, &env)?;
  let locale = input.locale.unwrap_or(PromptSourceLocale::Zh);
  if locale == PromptSourceLocale::Zh {
    write_text_file(&definition.paths.zh, &input.content)?;
    migrate_legacy_project_memory_source_on_zh_write(&definition);
  } else {
    prepare_project_memory_for_english_write(&definition);
    write_text_file(&definition.paths.en, &input.content)?;
  }
  let result = hydrate_prompt(&definition, true)
    .ok_or_else(|| format!("Failed to load prompt after write: {}", input.prompt_id))?;
  Ok(result)
}

pub fn write_prompt_artifacts(input: &WritePromptArtifactsInput) -> Result<PromptDetails, String> {
  if input.en_content.is_none() && input.dist_content.is_none() {
    return Err("writePromptArtifacts requires enContent or distContent".to_string());
  }
  let env = resolve_prompt_environment(&input.base)?;
  let definition = build_prompt_definition_from_id(&input.prompt_id, &env)?;
  if let Some(ref content) = input.en_content {
    prepare_project_memory_for_english_write(&definition);
    write_text_file(&definition.paths.en, content)?;
  }
  if let Some(ref content) = input.dist_content {
    write_text_file(&definition.paths.dist, content)?;
  }
  let result = hydrate_prompt(&definition, true)
    .ok_or_else(|| format!("Failed to load prompt after write: {}", input.prompt_id))?;
  Ok(result)
}
