use std::collections::HashMap;
use std::path::Path;

use serde::Deserialize;
use serde_json::Value;

use crate::core::input_plugins::prompt_artifact::read_prompt_artifact;
use crate::core::plugin_shared::{
  FilePathKind, McpServerConfig, PromptKind, RelativePath, SkillChildDoc, SkillMcpConfig,
  SkillPrompt, SkillResource, SkillResourceEncoding, SkillYAMLFrontMatter,
};

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillInputOptions {
  workspace_dir: String,
  #[serde(default)]
  aindex: Option<SkillAindexInput>,
  #[serde(default)]
  global_scope: Option<Value>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillAindexInput {
  #[serde(default)]
  dir: Option<String>,
  #[serde(default)]
  skills: Option<SkillPair>,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct SkillPair {
  #[allow(dead_code)]
  #[serde(default)]
  src: Option<String>,
  #[serde(default)]
  dist: Option<String>,
}

fn transform_mdx_references_to_md(content: &str) -> String {
  let re = regex_lite::Regex::new(r"(!?\[)([^\]]*?)(\]\()([^)]+)(\))").unwrap();
  re.replace_all(content, |caps: &regex_lite::Captures| {
    let prefix = &caps[1];
    let text = caps[2].replace(".mdx", ".md");
    let middle = &caps[3];
    let url = &caps[4];
    let suffix = &caps[5];
    let transformed_url =
      if url.starts_with("http://") || url.starts_with("https://") || url.starts_with("//") {
        url.to_string()
      } else {
        url.replace(".mdx", ".md")
      };
    format!("{}{}{}{}{}", prefix, text, middle, transformed_url, suffix)
  })
  .into_owned()
}

fn assert_no_residual_module_syntax(content: &str, file_path: &str) -> Result<(), String> {
  let code_fence_pattern = regex_lite::Regex::new(r"^\s*(```|~~~)").unwrap();
  let residual_patterns = [
    regex_lite::Regex::new(r"^\s*export\s+default\b").unwrap(),
    regex_lite::Regex::new(r"^\s*export\s+const\b").unwrap(),
    regex_lite::Regex::new(r"^\s*import\b").unwrap(),
  ];
  let mut active_fence: Option<&str> = None;
  for (index, line) in content.lines().enumerate() {
    if let Some(caps) = code_fence_pattern.captures(line) {
      let marker = caps.get(1).map(|m| m.as_str()).unwrap_or("");
      if active_fence.is_none() {
        active_fence = Some(marker);
      } else if active_fence == Some(marker) {
        active_fence = None;
      }
      continue;
    }
    if active_fence.is_some() {
      continue;
    }
    for pat in &residual_patterns {
      if pat.is_match(line) {
        return Err(format!(
          "Compiled prompt still contains residual module syntax at {}:{}: {}",
          file_path,
          index + 1,
          line.trim()
        ));
      }
    }
  }
  Ok(())
}

fn extract_front_matter(raw_mdx: &str) -> (Option<Value>, Option<String>) {
  let front_matter_regex =
    regex_lite::Regex::new(r"(?s)^---\r?\n(.*?)\r?\n---(?:(?:\r?\n){1,2}|$)").ok();
  if let Some(re) = front_matter_regex {
    if let Some(caps) = re.captures(raw_mdx) {
      let raw_fm = caps.get(1).map(|m| m.as_str().to_string());
      let yaml_json = raw_fm
        .as_deref()
        .and_then(|fm| serde_yml::from_str::<Value>(fm).ok());
      return (yaml_json, raw_fm);
    }
  }
  (None, None)
}

fn extract_skill_metadata_from_export(content: &str) -> Value {
  let mut metadata = serde_json::Map::new();

  let export_default_regex = regex_lite::Regex::new(r"export\s+default\s*\{([\s\S]*?)\}").unwrap();
  let object_content = match export_default_regex.captures(content) {
    Some(caps) => caps.get(1).map(|m| m.as_str()).unwrap_or(""),
    None => return Value::Object(metadata),
  };

  let description_regex =
    regex_lite::Regex::new(r#"description\s*:\s*['\"`]([^'\"`]+)['\"`]"#).unwrap();
  if let Some(caps) = description_regex.captures(object_content) {
    if let Some(m) = caps.get(1) {
      metadata.insert(
        "description".to_string(),
        Value::String(m.as_str().to_string()),
      );
    }
  }

  let name_regex = regex_lite::Regex::new(r#"name\s*:\s*['\"`]([^'\"`]+)['\"`]"#).unwrap();
  if let Some(caps) = name_regex.captures(object_content) {
    if let Some(m) = caps.get(1) {
      metadata.insert("name".to_string(), Value::String(m.as_str().to_string()));
    }
  }

  let display_name_regex =
    regex_lite::Regex::new(r#"displayName\s*:\s*['\"`]([^'\"`]+)['\"`]"#).unwrap();
  if let Some(caps) = display_name_regex.captures(object_content) {
    if let Some(m) = caps.get(1) {
      metadata.insert(
        "displayName".to_string(),
        Value::String(m.as_str().to_string()),
      );
    }
  }

  let keywords_regex = regex_lite::Regex::new(r"keywords\s*:\s*\[([^\]]+)\]").unwrap();
  if let Some(caps) = keywords_regex.captures(object_content) {
    if let Some(m) = caps.get(1) {
      let keywords: Vec<Value> = m
        .as_str()
        .split(',')
        .map(|k| {
          k.trim()
            .trim_matches(|c: char| c == '"' || c == '\'' || c == '`')
        })
        .filter(|k| !k.is_empty())
        .map(|k| Value::String(k.to_string()))
        .collect();
      metadata.insert("keywords".to_string(), Value::Array(keywords));
    }
  }

  let author_regex = regex_lite::Regex::new(r#"author\s*:\s*['\"`]([^'\"`]+)['\"`]"#).unwrap();
  if let Some(caps) = author_regex.captures(object_content) {
    if let Some(m) = caps.get(1) {
      metadata.insert("author".to_string(), Value::String(m.as_str().to_string()));
    }
  }

  let version_regex = regex_lite::Regex::new(r#"version\s*:\s*['\"`]([^'\"`]+)['\"`]"#).unwrap();
  if let Some(caps) = version_regex.captures(object_content) {
    if let Some(m) = caps.get(1) {
      metadata.insert("version".to_string(), Value::String(m.as_str().to_string()));
    }
  }

  Value::Object(metadata)
}

fn merge_defined_skill_metadata(sources: &[Option<Value>]) -> Value {
  let mut merged = serde_json::Map::new();
  for source in sources {
    if let Some(Value::Object(map)) = source {
      for (key, value) in map {
        if !value.is_null() {
          merged.insert(key.clone(), value.clone());
        }
      }
    }
  }
  Value::Object(merged)
}

const MIME_TYPES: &[(&str, &str)] = &[
  (".ts", "text/typescript"),
  (".tsx", "text/typescript"),
  (".js", "text/javascript"),
  (".jsx", "text/javascript"),
  (".json", "application/json"),
  (".py", "text/x-python"),
  (".java", "text/x-java"),
  (".kt", "text/x-kotlin"),
  (".go", "text/x-go"),
  (".rs", "text/x-rust"),
  (".c", "text/x-c"),
  (".cpp", "text/x-c++"),
  (".cs", "text/x-csharp"),
  (".rb", "text/x-ruby"),
  (".php", "text/x-php"),
  (".swift", "text/x-swift"),
  (".scala", "text/x-scala"),
  (".sql", "application/sql"),
  (".xml", "application/xml"),
  (".yaml", "text/yaml"),
  (".yml", "text/yaml"),
  (".toml", "text/toml"),
  (".csv", "text/csv"),
  (".graphql", "application/graphql"),
  (".txt", "text/plain"),
  (".pdf", "application/pdf"),
  (
    ".docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ),
  (
    ".xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ),
  (".html", "text/html"),
  (".css", "text/css"),
  (".svg", "image/svg+xml"),
  (".png", "image/png"),
  (".jpg", "image/jpeg"),
  (".jpeg", "image/jpeg"),
  (".gif", "image/gif"),
  (".webp", "image/webp"),
  (".ico", "image/x-icon"),
  (".bmp", "image/bmp"),
];

const SKILL_RESOURCE_BINARY_EXTENSIONS: &[&str] = &[
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".tiff", ".svg", ".exe", ".dll", ".so",
  ".dylib", ".bin", ".wasm", ".class", ".jar", ".war", ".pyd", ".pyc", ".pyo", ".zip", ".tar",
  ".gz", ".bz2", ".7z", ".rar", ".ttf", ".otf", ".woff", ".woff2", ".eot", ".db", ".sqlite",
  ".sqlite3", ".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".odt", ".ods", ".odp",
];

fn is_binary_resource_extension(ext: &str) -> bool {
  SKILL_RESOURCE_BINARY_EXTENSIONS.contains(&ext.to_lowercase().as_str())
}

fn get_mime_type(ext: &str) -> Option<&'static str> {
  let lower = ext.to_lowercase();
  MIME_TYPES
    .iter()
    .find(|(e, _)| *e == lower)
    .map(|(_, m)| *m)
}

fn read_file_content(
  file_path: &Path,
  ext: &str,
) -> Result<(String, SkillResourceEncoding, usize), crate::CliError> {
  if is_binary_resource_extension(ext) {
    let buffer = std::fs::read(file_path).map_err(crate::CliError::IoError)?;
    let length = buffer.len();
    let content = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &buffer);
    Ok((content, SkillResourceEncoding::Base64, length))
  } else {
    let content = std::fs::read_to_string(file_path).map_err(crate::CliError::IoError)?;
    let length = content.len();
    Ok((content, SkillResourceEncoding::Text, length))
  }
}

fn scan_child_docs(
  current_dir: &Path,
  root_dist_dir: &Path,
  skill_dir: &str,
  global_scope_json: Option<&str>,
) -> Result<Vec<SkillChildDoc>, crate::CliError> {
  let mut docs = Vec::new();
  let entries = match std::fs::read_dir(current_dir) {
    Ok(e) => e,
    Err(_) => return Ok(docs),
  };

  for entry in entries.flatten() {
    let path = entry.path();
    if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
      docs.extend(scan_child_docs(
        &path,
        root_dist_dir,
        skill_dir,
        global_scope_json,
      )?);
      continue;
    }
    let Some(file_name) = path.file_name().and_then(|s| s.to_str()) else {
      continue;
    };
    if file_name == "skill.mdx" || file_name.ends_with(".src.mdx") || !file_name.ends_with(".mdx") {
      continue;
    }

    let file_path_str = path.to_string_lossy().into_owned();
    let artifact = read_prompt_artifact(&file_path_str, "dist", global_scope_json)
      .map_err(|e| crate::CliError::ConfigError(e))?;
    let compiled_content = transform_mdx_references_to_md(&artifact.content);
    assert_no_residual_module_syntax(&compiled_content, &file_path_str)
      .map_err(crate::CliError::ConfigError)?;

    let relative_path = path
      .strip_prefix(root_dist_dir)
      .unwrap_or(&path)
      .to_string_lossy()
      .replace('\\', "/");
    let length = compiled_content.len();
    let (_yaml_front_matter, raw_front_matter) = extract_front_matter(&artifact.raw_mdx);

    docs.push(SkillChildDoc {
      prompt_type: PromptKind::SkillChildDoc,
      content: compiled_content,
      length,
      file_path_kind: FilePathKind::Relative,
      relative_path,
      dir: RelativePath::new(
        &path
          .parent()
          .map(|p| p.to_string_lossy().into_owned())
          .unwrap_or_default(),
        skill_dir,
      ),
      raw_front_matter,
      markdown_ast: None,
      markdown_contents: None,
    });
  }

  Ok(docs)
}

fn scan_resources(
  current_dir: &Path,
  root_src_dir: &Path,
  skill_dir: &str,
) -> Result<Vec<SkillResource>, crate::CliError> {
  let mut resources = Vec::new();
  let entries = match std::fs::read_dir(current_dir) {
    Ok(e) => e,
    Err(_) => return Ok(resources),
  };

  for entry in entries.flatten() {
    let path = entry.path();
    if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
      resources.extend(scan_resources(&path, root_src_dir, skill_dir)?);
      continue;
    }
    let Some(file_name) = path.file_name().and_then(|s| s.to_str()) else {
      continue;
    };
    if file_name == "mcp.json" || file_name.ends_with(".mdx") {
      continue;
    }

    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
    let relative_path = path
      .strip_prefix(root_src_dir)
      .unwrap_or(&path)
      .to_string_lossy()
      .replace('\\', "/");

    let (content, encoding, length) = read_file_content(&path, ext)?;
    let mime_type = get_mime_type(ext).map(|m| m.to_string());

    resources.push(SkillResource {
      prompt_type: PromptKind::SkillResource,
      extension: ext.to_string(),
      file_name: file_name.to_string(),
      relative_path,
      content,
      encoding,
      length,
      mime_type,
    });
  }

  Ok(resources)
}

fn collect_expected_child_doc_paths(
  skill_src_dir: &Path,
  current_dir: &Path,
) -> Result<Vec<String>, crate::CliError> {
  let mut expected = Vec::new();
  let entries = match std::fs::read_dir(current_dir) {
    Ok(e) => e,
    Err(_) => return Ok(expected),
  };

  for entry in entries.flatten() {
    let path = entry.path();
    if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
      expected.extend(collect_expected_child_doc_paths(skill_src_dir, &path)?);
      continue;
    }
    let Some(file_name) = path.file_name().and_then(|s| s.to_str()) else {
      continue;
    };
    if !file_name.ends_with(".src.mdx") {
      continue;
    }
    if current_dir == skill_src_dir && file_name == "skill.src.mdx" {
      continue;
    }
    let relative_path = path
      .strip_prefix(skill_src_dir)
      .unwrap_or(&path)
      .to_string_lossy()
      .replace('\\', "/")
      .replace(".src.mdx", ".mdx");
    expected.push(relative_path);
  }

  Ok(expected)
}

fn assert_compiled_child_docs_exist(
  skill_name: &str,
  skill_src_dir: &Path,
  skill_dist_dir: &Path,
) -> Result<(), crate::CliError> {
  if !skill_src_dir.is_dir() {
    return Ok(());
  }
  for relative_path in collect_expected_child_doc_paths(skill_src_dir, skill_src_dir)? {
    let dist_path = skill_dist_dir.join(&relative_path);
    if dist_path.exists() {
      continue;
    }
    let src_path = skill_src_dir.join(relative_path.replace(".mdx", ".src.mdx"));
    return Err(crate::CliError::ConfigError(format!(
      "Missing compiled dist prompt for skill child doc \"{}\". source: {} expected dist: {}",
      format!("{}/{}", skill_name, relative_path),
      src_path.to_string_lossy(),
      dist_path.to_string_lossy()
    )));
  }
  Ok(())
}

fn read_mcp_config(skill_src_dir: &Path) -> Result<Option<SkillMcpConfig>, crate::CliError> {
  let mcp_json_path = skill_src_dir.join("mcp.json");
  if !mcp_json_path.is_file() {
    return Ok(None);
  }
  let raw_content = std::fs::read_to_string(&mcp_json_path).map_err(crate::CliError::IoError)?;
  let parsed: Value = serde_json::from_str(&raw_content)
    .map_err(|e| crate::CliError::ConfigError(format!("Failed to parse mcp.json: {}", e)))?;

  if let Some(Value::Object(servers)) = parsed.get("mcpServers") {
    let mut mcp_servers = HashMap::new();
    for (key, value) in servers {
      let config: McpServerConfig = serde_json::from_value(value.clone()).map_err(|e| {
        crate::CliError::ConfigError(format!("Invalid McpServerConfig for {}: {}", key, e))
      })?;
      mcp_servers.insert(key.clone(), config);
    }
    return Ok(Some(SkillMcpConfig {
      prompt_type: PromptKind::SkillMcpConfig,
      mcp_servers,
      raw_content,
    }));
  }

  Ok(None)
}

fn validate_supported_scope(scope: Option<&str>, file_path: &str) -> Result<(), crate::CliError> {
  let Some(scope) = scope else {
    return Ok(());
  };
  if scope == "project" || scope == "global" {
    return Ok(());
  }
  Err(crate::CliError::ConfigError(format!(
    "Field \"scope\" must be \"project\" or \"global\" in {}",
    file_path
  )))
}

fn validate_skill_metadata(metadata: &Value, file_path: &str) -> Result<(), crate::CliError> {
  let prefix = format!(" in {}", file_path);
  if let Some(desc) = metadata.get("description") {
    let desc_str = desc.as_str().unwrap_or("");
    if desc_str.trim().is_empty() {
      return Err(crate::CliError::ConfigError(format!(
        "Required field \"description\" cannot be empty{}",
        prefix
      )));
    }
  } else {
    return Err(crate::CliError::ConfigError(format!(
      "Missing required field \"description\"{}",
      prefix
    )));
  }

  let scope = metadata.get("scope").and_then(|v| v.as_str());
  validate_supported_scope(scope, file_path)?;

  Ok(())
}

fn create_skill_prompt(
  name: &str,
  skill_dist_dir: &Path,
  skill_src_dir: &Path,
  global_scope_json: Option<&str>,
  diagnostics: &mut Vec<crate::core::plugin_shared::Diagnostic>,
) -> Result<SkillPrompt, crate::CliError> {
  let dist_file_path = skill_dist_dir.join("skill.mdx");
  if !dist_file_path.is_file() {
    let src_file_path = skill_src_dir.join("skill.src.mdx");
    return Err(crate::CliError::ConfigError(format!(
      "Missing compiled dist prompt for skill \"{}\". source: {} expected dist: {}",
      name,
      src_file_path.to_string_lossy(),
      dist_file_path.to_string_lossy()
    )));
  }

  let dist_file_path_str = dist_file_path.to_string_lossy().into_owned();
  let artifact = read_prompt_artifact(&dist_file_path_str, "dist", global_scope_json)
    .map_err(|e| crate::CliError::ConfigError(e))?;

  let raw_content = artifact.raw_mdx.clone();
  let content = transform_mdx_references_to_md(&artifact.content);
  assert_no_residual_module_syntax(&content, &dist_file_path_str)
    .map_err(crate::CliError::ConfigError)?;

  let export_metadata = extract_skill_metadata_from_export(&raw_content);
  let dist_metadata = Value::Object(artifact.metadata.into_iter().map(|(k, v)| (k, v)).collect());
  let merged_metadata = merge_defined_skill_metadata(&[Some(export_metadata), Some(dist_metadata)]);

  let (yaml_front_matter, _raw_front_matter) = extract_front_matter(&raw_content);

  let mut final_front_matter = if let Some(Value::Object(mut map)) = yaml_front_matter {
    if let Value::Object(merge_map) = &merged_metadata {
      for (k, v) in merge_map {
        if !map.contains_key(k) {
          map.insert(k.clone(), v.clone());
        }
      }
    }
    Value::Object(map)
  } else {
    merged_metadata.clone()
  };

  let had_authored_name = final_front_matter
    .get("name")
    .and_then(|v| v.as_str())
    .is_some();

  if let Value::Object(ref mut map) = final_front_matter {
    map.insert("name".to_string(), Value::String(name.to_string()));
  }

  if had_authored_name {
    diagnostics.push(crate::core::plugin_shared::Diagnostic {
      level: "warn".to_string(),
      code: "SKILL_NAME_IGNORED".to_string(),
      title: format!(
        "Skill name metadata is ignored in favor of directory name \"{}\"",
        name
      ),
      exact_fix: None,
    });
  }

  validate_skill_metadata(&final_front_matter, &dist_file_path_str)?;

  let length = content.len();
  let skill_dir_str = skill_dist_dir.to_string_lossy().into_owned();

  let yaml_front_matter_typed: Option<SkillYAMLFrontMatter> =
    serde_json::from_value(final_front_matter.clone()).ok();

  let child_docs = scan_child_docs(
    skill_dist_dir,
    skill_dist_dir,
    &skill_dir_str,
    global_scope_json,
  )?;
  let resources = if skill_src_dir.is_dir() {
    scan_resources(skill_src_dir, skill_src_dir, &skill_dir_str)?
  } else {
    vec![]
  };
  let mcp_config = read_mcp_config(skill_src_dir)?;

  assert_compiled_child_docs_exist(name, skill_src_dir, skill_dist_dir)?;

  Ok(SkillPrompt {
    prompt_type: PromptKind::Skill,
    content,
    length,
    skill_name: name.to_string(),
    dir: RelativePath::new(name, &skill_dir_str),
    yaml_front_matter: yaml_front_matter_typed,
    mcp_config,
    child_docs: if child_docs.is_empty() {
      None
    } else {
      Some(child_docs)
    },
    resources: if resources.is_empty() {
      None
    } else {
      Some(resources)
    },
    markdown_contents: None,
  })
}

pub fn collect_skill(options_json: &str) -> Result<String, crate::CliError> {
  let options: SkillInputOptions =
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

  let src_skill_dir_name = options
    .aindex
    .as_ref()
    .and_then(|a| a.skills.as_ref().and_then(|p| p.src.clone()))
    .unwrap_or_else(|| "skills".to_string());
  let dist_skill_dir_name = options
    .aindex
    .as_ref()
    .and_then(|a| a.skills.as_ref().and_then(|p| p.dist.clone()))
    .unwrap_or_else(|| "dist/skills".to_string());

  let src_skill_dir = aindex_dir.join(&src_skill_dir_name);
  let dist_skill_dir = aindex_dir.join(&dist_skill_dir_name);

  let global_scope_json = options.global_scope.as_ref().map(|v| v.to_string());

  let mut skills: Vec<SkillPrompt> = Vec::new();

  let mut skill_names: Vec<String> = Vec::new();

  if src_skill_dir.is_dir() {
    if let Ok(entries) = std::fs::read_dir(&src_skill_dir) {
      for entry in entries.flatten() {
        if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
          skill_names.push(entry.file_name().to_string_lossy().into_owned());
        }
      }
    }
  }

  if dist_skill_dir.is_dir() {
    if let Ok(entries) = std::fs::read_dir(&dist_skill_dir) {
      for entry in entries.flatten() {
        if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
          skill_names.push(entry.file_name().to_string_lossy().into_owned());
        }
      }
    }
  }

  if skill_names.is_empty() {
    return Ok("{\"skills\":[]}".to_string());
  }

  skill_names.sort();
  skill_names.dedup();

  let mut diagnostics: Vec<crate::core::plugin_shared::Diagnostic> = Vec::new();

  for skill_name in skill_names {
    let skill_dist = dist_skill_dir.join(&skill_name);
    let skill_src = src_skill_dir.join(&skill_name);
    let prompt = create_skill_prompt(
      &skill_name,
      &skill_dist,
      &skill_src,
      global_scope_json.as_deref(),
      &mut diagnostics,
    )?;
    skills.push(prompt);
  }

  #[derive(Debug, Clone, serde::Serialize)]
  #[serde(rename_all = "camelCase")]
  struct SkillResult {
    skills: Vec<SkillPrompt>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    diagnostics: Vec<crate::core::plugin_shared::Diagnostic>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    debug_logs: Vec<crate::core::plugin_shared::DebugLog>,
  }

  let result = SkillResult {
    skills,
    diagnostics,
    debug_logs: vec![],
  };
  serde_json::to_string(&result).map_err(crate::CliError::SerializationError)
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;
  use tempfile::TempDir;

  #[test]
  fn collect_skill_reads_dist_and_resources() {
    let tmp = TempDir::new().unwrap();
    let src = tmp.path().join("aindex").join("skills").join("demo");
    let dist = tmp
      .path()
      .join("aindex")
      .join("dist")
      .join("skills")
      .join("demo");
    fs::create_dir_all(&src).unwrap();
    fs::create_dir_all(&dist).unwrap();

    fs::write(
      src.join("skill.src.mdx"),
      "---\ndescription: src skill\n---\nSkill source",
    )
    .unwrap();
    fs::write(
      src.join("guide.src.mdx"),
      "---\ndescription: src guide\n---\nGuide source",
    )
    .unwrap();
    fs::write(src.join("notes.md"), "Source notes").unwrap();
    fs::write(src.join("demo.kts"), "println(\"source\")").unwrap();
    fs::write(
      src.join("mcp.json"),
      r#"{"mcpServers":{"demo":{"command":"demo"}}}"#,
    )
    .unwrap();
    fs::write(
      dist.join("skill.mdx"),
      "---\ndescription: dist skill\n---\nexport const x = 1\n\nSkill dist",
    )
    .unwrap();
    fs::write(
      dist.join("guide.mdx"),
      "---\ndescription: dist guide\n---\nGuide dist",
    )
    .unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_skill(&options.to_string()).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
    let skills = parsed["skills"].as_array().unwrap();
    assert_eq!(skills.len(), 1);

    let skill = &skills[0];
    assert_eq!(skill["skillName"], "demo");
    assert_eq!(skill["content"], "Skill dist");
    assert_eq!(skill["yamlFrontMatter"]["name"], "demo");
    assert_eq!(skill["yamlFrontMatter"]["description"], "dist skill");

    let child_paths: Vec<String> = skill["childDocs"]
      .as_array()
      .unwrap()
      .iter()
      .map(|d| d["relativePath"].as_str().unwrap().to_string())
      .collect();
    assert_eq!(child_paths, vec!["guide.mdx"]);
    assert_eq!(skill["childDocs"][0]["content"], "Guide dist");

    let resource_paths: std::collections::HashSet<String> = skill["resources"]
      .as_array()
      .unwrap()
      .iter()
      .map(|r| r["relativePath"].as_str().unwrap().to_string())
      .collect();
    assert_eq!(
      resource_paths,
      std::collections::HashSet::from(["notes.md".to_string(), "demo.kts".to_string()])
    );
    assert_eq!(
      skill["resources"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["relativePath"] == "notes.md")
        .unwrap()["content"],
      "Source notes"
    );
    assert_eq!(
      skill["resources"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["relativePath"] == "demo.kts")
        .unwrap()["content"],
      "println(\"source\")"
    );
    assert_eq!(skill["mcpConfig"]["mcpServers"]["demo"]["command"], "demo");
  }

  #[test]
  fn collect_skill_prefers_src_resources() {
    let tmp = TempDir::new().unwrap();
    let src = tmp.path().join("aindex").join("skills").join("demo");
    let dist = tmp
      .path()
      .join("aindex")
      .join("dist")
      .join("skills")
      .join("demo");
    fs::create_dir_all(&src).unwrap();
    fs::create_dir_all(&dist).unwrap();

    fs::write(
      src.join("skill.src.mdx"),
      "---\ndescription: src skill\n---\nSkill source",
    )
    .unwrap();
    fs::write(src.join("notes.md"), "Source notes").unwrap();
    fs::write(
      dist.join("skill.mdx"),
      "---\ndescription: dist skill\n---\nSkill dist",
    )
    .unwrap();
    fs::write(dist.join("notes.md"), "Legacy dist notes").unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_skill(&options.to_string()).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
    let skill = &parsed["skills"][0];
    assert_eq!(
      skill["resources"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["relativePath"] == "notes.md")
        .unwrap()["content"],
      "Source notes"
    );
  }

  #[test]
  fn collect_skill_fails_missing_child_doc() {
    let tmp = TempDir::new().unwrap();
    let src = tmp.path().join("aindex").join("skills").join("demo");
    let dist = tmp
      .path()
      .join("aindex")
      .join("dist")
      .join("skills")
      .join("demo");
    fs::create_dir_all(&src).unwrap();
    fs::create_dir_all(&dist).unwrap();

    fs::write(
      src.join("skill.src.mdx"),
      "---\ndescription: src skill\n---\nSkill source",
    )
    .unwrap();
    fs::write(
      src.join("guide.src.mdx"),
      "---\ndescription: src guide\n---\nGuide source",
    )
    .unwrap();
    fs::write(
      dist.join("skill.mdx"),
      "---\ndescription: dist skill\n---\nSkill dist",
    )
    .unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_skill(&options.to_string());
    assert!(result.is_err());
    assert!(
      result
        .unwrap_err()
        .to_string()
        .contains("Missing compiled dist prompt")
    );
  }

  #[test]
  fn collect_skill_fails_missing_main_dist() {
    let tmp = TempDir::new().unwrap();
    let src = tmp.path().join("aindex").join("skills").join("demo");
    fs::create_dir_all(&src).unwrap();

    fs::write(
      src.join("skill.src.mdx"),
      "---\ndescription: src only skill\n---\nSkill source",
    )
    .unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_skill(&options.to_string());
    assert!(result.is_err());
    assert!(
      result
        .unwrap_err()
        .to_string()
        .contains("Missing compiled dist prompt")
    );
  }

  #[test]
  fn collect_skill_rejects_workspace_scope() {
    let tmp = TempDir::new().unwrap();
    let src = tmp.path().join("aindex").join("skills").join("demo");
    let dist = tmp
      .path()
      .join("aindex")
      .join("dist")
      .join("skills")
      .join("demo");
    fs::create_dir_all(&src).unwrap();
    fs::create_dir_all(&dist).unwrap();

    fs::write(
      src.join("skill.src.mdx"),
      "---\ndescription: src skill\n---\nSkill source",
    )
    .unwrap();
    fs::write(
      dist.join("skill.mdx"),
      "---\ndescription: dist skill\nscope: workspace\n---\nSkill dist",
    )
    .unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_skill(&options.to_string());
    assert!(result.is_err());
    assert!(
      result
        .unwrap_err()
        .to_string()
        .contains("Field \"scope\" must be \"project\" or \"global\"")
    );
  }

  #[test]
  fn collect_skill_ignores_authored_name() {
    let tmp = TempDir::new().unwrap();
    let src = tmp.path().join("aindex").join("skills").join("demo");
    let dist = tmp
      .path()
      .join("aindex")
      .join("dist")
      .join("skills")
      .join("demo");
    fs::create_dir_all(&src).unwrap();
    fs::create_dir_all(&dist).unwrap();

    fs::write(
      src.join("skill.src.mdx"),
      "---\nname: custom-demo\ndescription: src skill\n---\nSkill source",
    )
    .unwrap();
    fs::write(
      dist.join("skill.mdx"),
      "---\nname: custom-demo\ndescription: dist skill\n---\nSkill dist",
    )
    .unwrap();

    let options = serde_json::json!({
      "workspaceDir": tmp.path().to_string_lossy().to_string(),
    });

    let result = collect_skill(&options.to_string()).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
    let skill = &parsed["skills"][0];
    assert_eq!(skill["skillName"], "demo");
    assert_eq!(skill["yamlFrontMatter"]["name"], "demo");
    assert_eq!(skill["yamlFrontMatter"]["description"], "dist skill");
    let diagnostics = parsed["diagnostics"].as_array().unwrap();
    assert!(
      diagnostics
        .iter()
        .any(|d| d["code"] == "SKILL_NAME_IGNORED")
    );
  }
}
