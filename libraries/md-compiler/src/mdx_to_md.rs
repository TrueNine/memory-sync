//! Main entry point for MDX-to-Markdown conversion.
//!
//! Parses MDX source, transforms the AST (evaluating expressions, expanding components),
//! and serializes back to Markdown.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

use crate::expression_eval::EvaluationScope;
use crate::parser::parse_mdx;
use crate::serializer::serialize;
use crate::transformer::{ProcessingContext, transform_ast};

/// Global scope for MDX compilation (os, env, profile, code style, tool info).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MdxGlobalScope {
  pub os: Option<HashMap<String, Value>>,
  pub env: Option<HashMap<String, Value>>,
  pub profile: Option<HashMap<String, Value>>,
  pub code_styles: Option<HashMap<String, Value>>,
  pub tool: Option<HashMap<String, Value>>,
}

/// Options for the `mdx_to_md` function.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MdxToMdOptions {
  pub scope: Option<EvaluationScope>,
  pub base_path: Option<String>,
  pub global_scope: Option<MdxGlobalScope>,
  pub extract_metadata: bool,
}

/// Result of MDX-to-Markdown conversion when metadata extraction is enabled.
#[derive(Debug, Clone)]
pub struct MdxToMdResult {
  pub content: String,
  pub metadata: ExportMetadata,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MetadataSource {
  Export,
  #[default]
  Yaml,
  Mixed,
}

impl MetadataSource {
  pub fn as_str(self) -> &'static str {
    match self {
      Self::Export => "export",
      Self::Yaml => "yaml",
      Self::Mixed => "mixed",
    }
  }
}

/// Extracted metadata from YAML frontmatter and export statements.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportMetadata {
  pub yaml_front_matter: Option<HashMap<String, Value>>,
  pub exports: HashMap<String, Value>,
  pub source: MetadataSource,
}

/// Merge global scope with custom scope. Custom scope takes priority.
fn merge_scopes(
  global_scope: &Option<MdxGlobalScope>,
  custom_scope: &Option<EvaluationScope>,
) -> EvaluationScope {
  let mut result = EvaluationScope::new();

  if let Some(gs) = global_scope {
    if let Some(os) = &gs.os {
      result.insert("os".into(), serde_json::to_value(os).unwrap_or(Value::Null));
    }
    if let Some(env) = &gs.env {
      result.insert(
        "env".into(),
        serde_json::to_value(env).unwrap_or(Value::Null),
      );
    }
    if let Some(profile) = &gs.profile {
      result.insert(
        "profile".into(),
        serde_json::to_value(profile).unwrap_or(Value::Null),
      );
    }
    if let Some(code_styles) = &gs.code_styles {
      result.insert(
        "codeStyles".into(),
        serde_json::to_value(code_styles).unwrap_or(Value::Null),
      );
    }
    if let Some(tool) = &gs.tool {
      result.insert(
        "tool".into(),
        serde_json::to_value(tool).unwrap_or(Value::Null),
      );
    }
  }

  if let Some(cs) = custom_scope {
    for (key, value) in cs {
      // Deep merge objects, override primitives
      if let (Some(Value::Object(existing)), Value::Object(new_map)) = (result.get(key), value) {
        let mut merged = existing.clone();
        for (k, v) in new_map {
          merged.insert(k.clone(), v.clone());
        }
        result.insert(key.clone(), Value::Object(merged));
      } else {
        result.insert(key.clone(), value.clone());
      }
    }
  }

  result
}

/// Extract YAML frontmatter from the AST.
fn extract_yaml_frontmatter(ast: &markdown::mdast::Node) -> Option<HashMap<String, Value>> {
  if let markdown::mdast::Node::Root(root) = ast {
    for child in &root.children {
      if let markdown::mdast::Node::Yaml(yaml) = child
        && let Ok(Value::Object(map)) = serde_yml::from_str::<Value>(&yaml.value)
      {
        return Some(map.into_iter().collect());
      }
    }
  }
  None
}

/// Extract export metadata from lines starting with "export ".
/// Since markdown-rs doesn't always parse ESM as MdxjsEsm nodes,
/// we also do a pre-pass on the source text.
fn extract_exports_from_source(source: &str) -> HashMap<String, Value> {
  let mut exports = HashMap::new();

  if let Some((_, _, object_literal)) = find_export_default_object(source)
    && let Ok(Value::Object(map)) = json5::from_str::<Value>(&object_literal)
  {
    for (key, value) in map {
      exports.insert(key, value);
    }
  }

  for line in source.lines() {
    let trimmed = line.trim();
    if !is_supported_export_metadata_line(trimmed) {
      continue;
    }

    // Try to parse: export const NAME = VALUE
    if let Some(rest) = trimmed.strip_prefix("export const ")
      && let Some(eq_pos) = rest.find('=')
    {
      let name = rest[..eq_pos].trim();
      let value_str = rest[eq_pos + 1..].trim();
      if let Ok(val) = serde_json::from_str::<Value>(value_str) {
        exports.insert(name.to_string(), val);
      }
    }
  }

  exports
}

fn is_supported_export_metadata_line(trimmed: &str) -> bool {
  trimmed.starts_with("export const ")
}

fn strip_supported_export_lines(source: &str) -> String {
  let stripped_source = if let Some((start, end, _)) = find_export_default_object(source) {
    let mut after = end;
    while let Some(character) = source[after..].chars().next() {
      if character != '\r' && character != '\n' && character != ' ' && character != '\t' {
        break;
      }
      after += character.len_utf8();
    }

    format!("{}{}", &source[..start], &source[after..])
  } else {
    source.to_string()
  };

  let mut stripped = String::new();
  let mut skip_blank_line = false;

  for line in stripped_source.lines() {
    let trimmed = line.trim();
    if is_supported_export_metadata_line(trimmed) {
      skip_blank_line = true;
      continue;
    }

    if skip_blank_line && trimmed.is_empty() {
      continue;
    }

    skip_blank_line = false;
    stripped.push_str(line);
    stripped.push('\n');
  }

  if !stripped_source.ends_with('\n') && stripped.ends_with('\n') {
    stripped.pop();
  }

  stripped
}

fn find_export_default_object(source: &str) -> Option<(usize, usize, String)> {
  let prefix_index = source.find("export default")?;
  let mut object_start = prefix_index + "export default".len();

  while let Some(character) = source[object_start..].chars().next() {
    if !character.is_whitespace() {
      break;
    }
    object_start += character.len_utf8();
  }

  if source[object_start..].chars().next()? != '{' {
    return None;
  }

  extract_object_literal(source, object_start)
    .map(|(literal, end_index)| (prefix_index, end_index, literal))
}

fn extract_object_literal(source: &str, start_index: usize) -> Option<(String, usize)> {
  if source[start_index..].chars().next()? != '{' {
    return None;
  }

  let mut depth = 0usize;
  let mut in_string: Option<char> = None;
  let mut escaped = false;
  let mut in_line_comment = false;
  let mut in_block_comment = false;

  for (relative_index, character) in source[start_index..].char_indices() {
    let absolute_index = start_index + relative_index;
    let next = source[absolute_index + character.len_utf8()..]
      .chars()
      .next();

    if in_line_comment {
      if character == '\n' {
        in_line_comment = false;
      }
      continue;
    }

    if in_block_comment {
      if character == '*' && next == Some('/') {
        in_block_comment = false;
      }
      continue;
    }

    if escaped {
      escaped = false;
      continue;
    }

    if let Some(quote) = in_string {
      if character == '\\' {
        escaped = true;
        continue;
      }

      if character == quote {
        in_string = None;
      }
      continue;
    }

    match character {
      '"' | '\'' | '`' => {
        in_string = Some(character);
      }
      '/' if next == Some('/') => {
        in_line_comment = true;
      }
      '/' if next == Some('*') => {
        in_block_comment = true;
      }
      '{' => depth += 1,
      '}' => {
        depth = depth.saturating_sub(1);
        if depth == 0 {
          let end_index = absolute_index + character.len_utf8();
          return Some((source[start_index..end_index].to_string(), end_index));
        }
      }
      _ => {}
    }
  }

  None
}

/// Remove YAML frontmatter and ESM export nodes from the AST.
fn strip_metadata_nodes(ast: &markdown::mdast::Node) -> markdown::mdast::Node {
  if let markdown::mdast::Node::Root(root) = ast {
    let filtered: Vec<markdown::mdast::Node> = root
      .children
      .iter()
      .filter(|child| {
        !matches!(
          child,
          markdown::mdast::Node::Yaml(_) | markdown::mdast::Node::MdxjsEsm(_)
        )
      })
      .cloned()
      .collect();
    return markdown::mdast::Node::Root(markdown::mdast::Root {
      children: filtered,
      position: root.position.clone(),
    });
  }
  ast.clone()
}

/// Convert MDX source to Markdown.
///
/// This is the main entry point, equivalent to the TS `mdxToMd()` function.
pub fn mdx_to_md(content: &str, options: Option<MdxToMdOptions>) -> Result<String, String> {
  let opts = options.unwrap_or_default();
  let ast = parse_mdx(content)?;
  let merged_scope = merge_scopes(&opts.global_scope, &opts.scope);
  let ctx = ProcessingContext::new(merged_scope, Some(content.to_string()));
  let transformed = transform_ast(&ast, &ctx);
  Ok(serialize(&transformed))
}

/// Convert MDX source to Markdown with metadata extraction.
pub fn mdx_to_md_with_metadata(
  content: &str,
  options: Option<MdxToMdOptions>,
) -> Result<MdxToMdResult, String> {
  let opts = options.unwrap_or_default();
  let stripped_source = strip_supported_export_lines(content);
  let ast = parse_mdx(&stripped_source)?;

  // Extract metadata
  let yaml_fm = extract_yaml_frontmatter(&ast);
  let mut exports = extract_exports_from_source(content);
  let has_yaml_front_matter = yaml_fm
    .as_ref()
    .is_some_and(|front_matter| !front_matter.is_empty());
  let has_export_metadata = !exports.is_empty();
  let source = match (has_export_metadata, has_yaml_front_matter) {
    (true, true) => MetadataSource::Mixed,
    (true, false) => MetadataSource::Export,
    _ => MetadataSource::Yaml,
  };

  let mut metadata = ExportMetadata {
    yaml_front_matter: yaml_fm.clone(),
    exports: HashMap::new(),
    source,
  };

  // Merge YAML frontmatter into exports (exports take priority)
  if let Some(yaml) = &yaml_fm {
    for (k, v) in yaml {
      if !exports.contains_key(k) {
        exports.insert(k.clone(), v.clone());
      }
    }
  }
  metadata.exports = exports;

  // Strip metadata nodes from AST
  let stripped = strip_metadata_nodes(&ast);

  let merged_scope = merge_scopes(&opts.global_scope, &opts.scope);
  let ctx = ProcessingContext::new(merged_scope, Some(stripped_source));
  let transformed = transform_ast(&stripped, &ctx);
  let markdown = serialize(&transformed);

  Ok(MdxToMdResult {
    content: markdown,
    metadata,
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  fn make_options() -> MdxToMdOptions {
    let mut scope = EvaluationScope::new();
    scope.insert("os".into(), json!({"platform": "win32"}));
    scope.insert("profile".into(), json!({"name": "TrueNine"}));
    MdxToMdOptions {
      scope: Some(scope),
      ..Default::default()
    }
  }

  #[test]
  fn test_simple_markdown() {
    let result = mdx_to_md("# Hello\n\nWorld\n", None).unwrap();
    assert!(result.contains("# Hello"));
    assert!(result.contains("World"));
  }

  #[test]
  fn test_expression_evaluation() {
    let result = mdx_to_md("Platform: {os.platform}\n", Some(make_options())).unwrap();
    assert!(result.contains("Platform: win32"), "Got: {}", result);
  }

  #[test]
  fn test_md_component() {
    let result = mdx_to_md(
      "<Md when={true}>\n\nVisible\n\n</Md>\n",
      Some(make_options()),
    )
    .unwrap();
    assert!(result.contains("Visible"), "Got: {}", result);
  }

  #[test]
  fn test_md_component_false() {
    let result = mdx_to_md(
      "<Md when={false}>\n\nHidden\n\n</Md>\n",
      Some(make_options()),
    )
    .unwrap();
    assert!(!result.contains("Hidden"), "Got: {}", result);
  }

  #[test]
  fn test_metadata_extraction() {
    let source = "---\ndescription: test skill\n---\n\n# Hello\n";
    let result = mdx_to_md_with_metadata(source, Some(make_options())).unwrap();
    assert!(result.content.contains("# Hello"));
    assert!(!result.content.contains("---"));
    assert_eq!(
      result
        .metadata
        .exports
        .get("description")
        .and_then(|v| v.as_str()),
      Some("test skill")
    );
  }

  #[test]
  fn test_export_extraction() {
    let source = "export const meta = {\"name\": \"test\"}\n\n# Hello\n";
    let result = mdx_to_md_with_metadata(source, Some(make_options())).unwrap();
    assert!(result.content.contains("# Hello"));
    assert!(!result.content.contains("export const meta"));
    let meta = result.metadata.exports.get("meta");
    assert!(
      meta.is_some(),
      "Expected meta export, got: {:?}",
      result.metadata.exports
    );
  }

  #[test]
  fn test_supported_export_lines_are_removed_from_compiled_content() {
    let source = "---\ndescription: dist\n---\nexport const x = 1\n\nCommand dist\n";
    let result = mdx_to_md_with_metadata(source, Some(make_options())).unwrap();
    assert_eq!(result.content, "Command dist");
    assert_eq!(
      result
        .metadata
        .exports
        .get("x")
        .and_then(|value| value.as_i64()),
      Some(1)
    );
    assert_eq!(
      result
        .metadata
        .exports
        .get("description")
        .and_then(|value| value.as_str()),
      Some("dist")
    );
  }

  #[test]
  fn test_global_scope() {
    let opts = MdxToMdOptions {
      global_scope: Some(MdxGlobalScope {
        os: Some({
          let mut m = HashMap::new();
          m.insert("platform".into(), json!("linux"));
          m
        }),
        ..Default::default()
      }),
      ..Default::default()
    };
    let result = mdx_to_md("OS: {os.platform}\n", Some(opts)).unwrap();
    assert!(result.contains("OS: linux"), "Got: {}", result);
  }

  #[test]
  fn test_global_scope_code_styles() {
    let opts = MdxToMdOptions {
      global_scope: Some(MdxGlobalScope {
        code_styles: Some({
          let mut m = HashMap::new();
          m.insert("indent".into(), json!("space"));
          m.insert("tabSize".into(), json!(2));
          m
        }),
        ..Default::default()
      }),
      ..Default::default()
    };
    let result = mdx_to_md(
      "Indent: {codeStyles.indent}, width: {codeStyles.tabSize}\n",
      Some(opts),
    )
    .unwrap();
    assert!(
      result.contains("Indent: space, width: 2"),
      "Got: {}",
      result
    );
  }

  #[test]
  fn test_scope_merge_priority() {
    let mut custom = EvaluationScope::new();
    custom.insert("os".into(), json!({"platform": "darwin"}));

    let opts = MdxToMdOptions {
      global_scope: Some(MdxGlobalScope {
        os: Some({
          let mut m = HashMap::new();
          m.insert("platform".into(), json!("linux"));
          m.insert("arch".into(), json!("x64"));
          m
        }),
        ..Default::default()
      }),
      scope: Some(custom),
      ..Default::default()
    };
    let result = mdx_to_md("OS: {os.platform}\n", Some(opts)).unwrap();
    // Custom scope should override global
    assert!(result.contains("OS: darwin"), "Got: {}", result);
  }

  #[test]
  fn test_preserves_intrinsic_html_block_with_nested_image() {
    let source = "<p align=\"center\">\n    <img alt=\"logo\" src=\"./src/app/icon.svg\"\n        width=\"138\" />\n</p>\n";
    let result = mdx_to_md(source, None).unwrap();

    assert!(result.contains("<p align=\"center\">"), "Got: {}", result);
    assert!(
      result.contains("<img alt=\"logo\" src=\"./src/app/icon.svg\""),
      "Got: {}",
      result
    );
    assert!(result.contains("width=\"138\" />"), "Got: {}", result);
    assert!(result.contains("</p>"), "Got: {}", result);
  }

  #[test]
  fn test_preserves_intrinsic_html_block_with_inline_markup() {
    let source =
      "<p align=\"right\">\n    <b>English</b> | <a href=\"./README_zh.md\">简体中文</a>\n</p>\n";
    let result = mdx_to_md(source, None).unwrap();

    assert!(result.contains("<p align=\"right\">"), "Got: {}", result);
    assert!(
      result.contains("<b>English</b> | <a href=\"./README_zh.md\">简体中文</a>"),
      "Got: {}",
      result
    );
    assert!(result.contains("</p>"), "Got: {}", result);
  }

  #[test]
  fn test_url_labeled_links_serialize_as_valid_autolinks() {
    let source = "Open [http://localhost:9002](http://localhost:9002) in your browser.\n";
    let result = mdx_to_md(source, None).unwrap();

    assert!(!result.contains("[["), "Got: {}", result);
    assert_eq!(result, "Open <http://localhost:9002> in your browser.");
  }

  #[test]
  fn test_non_url_self_labeled_links_remain_bracketed() {
    let source = "[README](README) and [#section](#section)\n";
    let result = mdx_to_md(source, None).unwrap();

    assert_eq!(result, "[README](README) and [#section](#section)");
  }

  #[test]
  fn test_formatted_url_labels_do_not_collapse_to_autolinks() {
    let source = "[**http://localhost:9002**](http://localhost:9002)\n";
    let result = mdx_to_md(source, None).unwrap();

    assert_eq!(result, "[**http://localhost:9002**](http://localhost:9002)");
  }

  #[test]
  fn test_preserved_intrinsic_html_evaluates_children_and_attributes() {
    let source = "<p align={side}>{count}<img src={logo} width={width} /></p>\n";
    let mut scope = EvaluationScope::new();
    scope.insert("side".into(), json!("right"));
    scope.insert("count".into(), json!(2));
    scope.insert("logo".into(), json!("./logo.svg"));
    scope.insert("width".into(), json!(138));

    let result = mdx_to_md(
      source,
      Some(MdxToMdOptions {
        scope: Some(scope),
        ..Default::default()
      }),
    )
    .unwrap();

    assert_eq!(
      result,
      "<p align=\"right\">2<img src=\"./logo.svg\" width=\"138\" /></p>"
    );
  }

  #[test]
  fn test_preserves_opening_sample_section() {
    let source = "<p align=\"center\">\n    <img alt=\"logo\" src=\"./src/app/icon.svg\"\n        width=\"138\" />\n</p>\n\n# China Unemployment Watch\n\n<p align=\"right\">\n    <b>English</b> | <a href=\"./README_zh.md\">简体中文</a>\n</p>\n";
    let result = mdx_to_md(source, None).unwrap();

    assert!(result.contains("<p align=\"center\">"), "Got: {}", result);
    assert!(
      result.contains("# China Unemployment Watch"),
      "Got: {}",
      result
    );
    assert!(result.contains("<p align=\"right\">"), "Got: {}", result);
  }
}
