//! Main entry point for MDX-to-Markdown conversion.
//!
//! Parses MDX source, transforms the AST (evaluating expressions, expanding components),
//! and serializes back to Markdown.

use std::collections::HashMap;
use serde_json::Value;

use crate::expression_eval::EvaluationScope;
use crate::parser::parse_mdx;
use crate::serializer::serialize;
use crate::transformer::{ProcessingContext, transform_ast};

/// Global scope for MDX compilation (os, env, profile, tool info).
#[derive(Debug, Clone, Default)]
pub struct MdxGlobalScope {
    pub os: Option<HashMap<String, Value>>,
    pub env: Option<HashMap<String, Value>>,
    pub profile: Option<HashMap<String, Value>>,
    pub tool: Option<HashMap<String, Value>>,
}

/// Options for the `mdx_to_md` function.
#[derive(Debug, Clone, Default)]
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

/// Extracted metadata from YAML frontmatter and export statements.
#[derive(Debug, Clone, Default)]
pub struct ExportMetadata {
    pub yaml_front_matter: Option<HashMap<String, Value>>,
    pub exports: HashMap<String, Value>,
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
            result.insert("env".into(), serde_json::to_value(env).unwrap_or(Value::Null));
        }
        if let Some(profile) = &gs.profile {
            result.insert("profile".into(), serde_json::to_value(profile).unwrap_or(Value::Null));
        }
        if let Some(tool) = &gs.tool {
            result.insert("tool".into(), serde_json::to_value(tool).unwrap_or(Value::Null));
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
            if let markdown::mdast::Node::Yaml(yaml) = child {
                if let Ok(parsed) = serde_yml::from_str::<Value>(&yaml.value) {
                    if let Value::Object(map) = parsed {
                        return Some(map.into_iter().collect());
                    }
                }
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

    for line in source.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with("export ") {
            continue;
        }

        // Try to parse: export const NAME = VALUE
        if let Some(rest) = trimmed.strip_prefix("export const ") {
            if let Some(eq_pos) = rest.find('=') {
                let name = rest[..eq_pos].trim();
                let value_str = rest[eq_pos + 1..].trim();
                if let Ok(val) = serde_json::from_str::<Value>(value_str) {
                    exports.insert(name.to_string(), val);
                }
            }
        }
    }

    exports
}

/// Remove YAML frontmatter and ESM export nodes from the AST.
fn strip_metadata_nodes(ast: &markdown::mdast::Node) -> markdown::mdast::Node {
    if let markdown::mdast::Node::Root(root) = ast {
        let filtered: Vec<markdown::mdast::Node> = root.children.iter()
            .filter(|child| {
                !matches!(child, markdown::mdast::Node::Yaml(_) | markdown::mdast::Node::MdxjsEsm(_))
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
    let ctx = ProcessingContext::new(merged_scope);
    let transformed = transform_ast(&ast, &ctx);
    Ok(serialize(&transformed))
}

/// Convert MDX source to Markdown with metadata extraction.
pub fn mdx_to_md_with_metadata(
    content: &str,
    options: Option<MdxToMdOptions>,
) -> Result<MdxToMdResult, String> {
    let opts = options.unwrap_or_default();
    let ast = parse_mdx(content)?;

    // Extract metadata
    let yaml_fm = extract_yaml_frontmatter(&ast);
    let exports = extract_exports_from_source(content);

    let mut metadata = ExportMetadata {
        yaml_front_matter: yaml_fm.clone(),
        exports,
    };

    // Merge YAML frontmatter into exports (exports take priority)
    if let Some(yaml) = &yaml_fm {
        for (k, v) in yaml {
            if !metadata.exports.contains_key(k) {
                metadata.exports.insert(k.clone(), v.clone());
            }
        }
    }

    // Strip metadata nodes from AST
    let stripped = strip_metadata_nodes(&ast);

    let merged_scope = merge_scopes(&opts.global_scope, &opts.scope);
    let ctx = ProcessingContext::new(merged_scope);
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
        ).unwrap();
        assert!(result.contains("Visible"), "Got: {}", result);
    }

    #[test]
    fn test_md_component_false() {
        let result = mdx_to_md(
            "<Md when={false}>\n\nHidden\n\n</Md>\n",
            Some(make_options()),
        ).unwrap();
        assert!(!result.contains("Hidden"), "Got: {}", result);
    }

    #[test]
    fn test_metadata_extraction() {
        let source = "---\ndescription: test skill\n---\n\n# Hello\n";
        let result = mdx_to_md_with_metadata(source, Some(make_options())).unwrap();
        assert!(result.content.contains("# Hello"));
        assert!(!result.content.contains("---"));
        assert_eq!(
            result.metadata.exports.get("description").and_then(|v| v.as_str()),
            Some("test skill")
        );
    }

    #[test]
    fn test_export_extraction() {
        let source = "export const meta = {\"name\": \"test\"}\n\n# Hello\n";
        let result = mdx_to_md_with_metadata(source, Some(make_options())).unwrap();
        assert!(result.content.contains("# Hello"));
        let meta = result.metadata.exports.get("meta");
        assert!(meta.is_some(), "Expected meta export, got: {:?}", result.metadata.exports);
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
}
