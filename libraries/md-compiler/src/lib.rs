#![deny(clippy::all)]

//! MDX to Markdown compiler.
//!
//! Uses `markdown-rs` (by wooorm, same author as remark) for MDX parsing,
//! with custom expression evaluation, JSX component processing, and
//! AST-to-Markdown serialization.

pub mod expression_eval;
pub mod mdx_to_md;
pub mod parser;
pub mod serializer;
pub mod toml_artifact;
pub mod transformer;

pub use expression_eval::EvaluationScope;
pub use mdx_to_md::{
    ExportMetadata, MdxGlobalScope, MdxToMdOptions, MdxToMdResult, mdx_to_md,
    mdx_to_md_with_metadata,
};
pub use parser::parse_mdx;
pub use serializer::serialize;
pub use toml_artifact::{
    BuildPromptTomlArtifactOptions, BuildTomlDocumentOptions, build_prompt_toml_artifact,
    build_toml_document,
};
pub use transformer::ProcessingContext;

// ===========================================================================
// NAPI binding layer (only compiled with --features napi)
// ===========================================================================

#[cfg(feature = "napi")]
mod napi_binding {
    use super::{
        BuildPromptTomlArtifactOptions, BuildTomlDocumentOptions, EvaluationScope,
        MdxGlobalScope, MdxToMdOptions, build_prompt_toml_artifact, build_toml_document,
        mdx_to_md, mdx_to_md_with_metadata,
    };
    use napi_derive::napi;
    use serde::Deserialize;
    use serde_json::Value;

    #[napi(object)]
    pub struct ParsedMarkdown {
        pub yaml_front_matter_json: Option<String>,
        pub raw_front_matter: Option<String>,
        pub content_without_front_matter: String,
    }

    #[derive(Debug, Default, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct CompileMdxToMdOptions {
        #[serde(default)]
        scope: Option<EvaluationScope>,
        #[serde(default)]
        base_path: Option<String>,
        #[serde(default)]
        global_scope: Option<MdxGlobalScope>,
        #[serde(default)]
        extract_metadata: bool,
    }

    fn parse_compile_options(options_json: Option<String>) -> napi::Result<MdxToMdOptions> {
        let parsed = match options_json {
            None => CompileMdxToMdOptions::default(),
            Some(json) => serde_json::from_str::<CompileMdxToMdOptions>(&json)
                .map_err(|e| napi::Error::from_reason(e.to_string()))?,
        };

        Ok(MdxToMdOptions {
            scope: parsed.scope,
            base_path: parsed.base_path,
            global_scope: parsed.global_scope,
            extract_metadata: parsed.extract_metadata,
        })
    }

    // ---------------------------------------------------------------------------
    // mdxToMd — convert MDX source to plain Markdown
    // ---------------------------------------------------------------------------

    /// Convert MDX source to plain Markdown.
    /// Returns the converted Markdown string, or throws on parse error.
    #[napi]
    pub fn mdx_to_md_str(content: String) -> napi::Result<String> {
        mdx_to_md(&content, None).map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    /// Convert MDX source to plain Markdown with a JSON scope string.
    /// `scope_json` should be a JSON object string, e.g. `{"os":{"platform":"win32"}}`.
    #[napi]
    pub fn mdx_to_md_with_scope(content: String, scope_json: String) -> napi::Result<String> {
        let scope: EvaluationScope = serde_json::from_str(&scope_json)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        let opts = MdxToMdOptions {
            scope: Some(scope),
            ..Default::default()
        };
        mdx_to_md(&content, Some(opts)).map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    /// Compile MDX source with JSON options and return a JSON result payload.
    #[napi]
    pub fn compile_mdx_to_md(
        content: String,
        options_json: Option<String>,
    ) -> napi::Result<String> {
        let options = parse_compile_options(options_json)?;

        let result = if options.extract_metadata {
            let compiled = mdx_to_md_with_metadata(&content, Some(options))
                .map_err(|e| napi::Error::from_reason(e.to_string()))?;

            serde_json::json!({
                "content": compiled.content,
                "metadata": {
                    "fields": compiled.metadata.exports,
                    "source": compiled.metadata.source.as_str(),
                },
            })
        } else {
            let compiled = mdx_to_md(&content, Some(options))
                .map_err(|e| napi::Error::from_reason(e.to_string()))?;

            serde_json::json!({
                "content": compiled,
            })
        };

        serde_json::to_string(&result).map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    // ---------------------------------------------------------------------------
    // buildFrontMatter / buildMarkdownWithFrontMatter
    // ---------------------------------------------------------------------------

    /// Build a YAML front matter block from a JSON object string.
    /// Returns a string like `---\nkey: value\n---`.
    #[napi]
    pub fn build_front_matter(front_matter_json: String) -> napi::Result<String> {
        let obj: Value = serde_json::from_str(&front_matter_json)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;

        let map = match &obj {
            Value::Object(m) => m,
            _ => {
                return Err(napi::Error::from_reason(
                    "frontMatter must be a JSON object",
                ));
            }
        };

        let cleaned: serde_json::Map<String, Value> = map
            .iter()
            .filter(|(_, v)| !v.is_null())
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();

        if cleaned.is_empty() {
            return Ok("---\n---".to_string());
        }

        let yaml_str = serde_yml::to_string(&Value::Object(cleaned))
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        let yaml_trimmed = yaml_str.trim_end();
        Ok(format!("---\n{yaml_trimmed}\n---"))
    }

    /// Build a Markdown string with YAML front matter prepended.
    /// `front_matter_json` is a JSON object string; pass `"null"` or `"{}"` to skip.
    #[napi]
    pub fn build_markdown_with_front_matter(
        front_matter_json: Option<String>,
        content: String,
    ) -> napi::Result<String> {
        let fm = match front_matter_json {
            None => return Ok(content),
            Some(ref s) if s == "null" || s == "{}" => return Ok(content),
            Some(ref s) => s,
        };

        let obj: Value =
            serde_json::from_str(fm).map_err(|e| napi::Error::from_reason(e.to_string()))?;

        match &obj {
            Value::Null => return Ok(content),
            Value::Object(m) if m.is_empty() => return Ok(content),
            _ => {}
        }

        let fm_block = build_front_matter(fm.to_string())?;
        Ok(format!("{fm_block}\n\n{content}"))
    }

    // ---------------------------------------------------------------------------
    // parseMarkdown — extract front matter + content
    // ---------------------------------------------------------------------------

    /// Parse a Markdown/MDX string and extract YAML front matter and content.
    #[napi]
    pub fn parse_markdown(raw_content: String) -> ParsedMarkdown {
        let front_matter_regex =
            regex_lite::Regex::new(r"(?s)^---\r?\n(.*?)\r?\n---(?:(?:\r?\n){1,2}|$)").ok();

        if let Some(re) = &front_matter_regex {
            if let Some(caps) = re.captures(&raw_content) {
                let raw_fm = caps.get(1).map(|m| m.as_str().to_string());
                let full_match = caps.get(0).map(|m| m.end()).unwrap_or(0);
                let content_without = raw_content[full_match..].to_string();

                let yaml_json = raw_fm.as_deref().and_then(|fm| {
                    serde_yml::from_str::<Value>(fm)
                        .ok()
                        .and_then(|v| serde_json::to_string(&v).ok())
                });

                return ParsedMarkdown {
                    yaml_front_matter_json: yaml_json,
                    raw_front_matter: raw_fm,
                    content_without_front_matter: content_without,
                };
            }
        }

        ParsedMarkdown {
            yaml_front_matter_json: None,
            raw_front_matter: None,
            content_without_front_matter: raw_content,
        }
    }

    /// Transform MDX-style link/image references to plain .md extensions.
    #[napi]
    pub fn transform_mdx_references_to_md(content: String) -> String {
        let re = regex_lite::Regex::new(r"(!?\[)([^\]]*?)(\]\()([^)]+)(\))").unwrap();
        re.replace_all(&content, |caps: &regex_lite::Captures| {
            let prefix = &caps[1];
            let text = caps[2].replace(".mdx", ".md");
            let middle = &caps[3];
            let url = &caps[4];
            let suffix = &caps[5];
            let transformed_url = if url.starts_with("http://")
                || url.starts_with("https://")
                || url.starts_with("//")
            {
                url.to_string()
            } else {
                url.replace(".mdx", ".md")
            };
            format!("{prefix}{text}{middle}{transformed_url}{suffix}")
        })
        .into_owned()
    }

    #[napi(js_name = "buildTomlDocument")]
    pub fn build_toml_document_binding(
        document_json: String,
        options_json: Option<String>,
    ) -> napi::Result<String> {
        let document: Value = serde_json::from_str(&document_json)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        let options = match options_json {
            None => None,
            Some(json) => Some(
                serde_json::from_str::<BuildTomlDocumentOptions>(&json)
                    .map_err(|e| napi::Error::from_reason(e.to_string()))?,
            ),
        };

        build_toml_document(document, options).map_err(napi::Error::from_reason)
    }

    #[napi(js_name = "buildPromptTomlArtifact")]
    pub fn build_prompt_toml_artifact_binding(options_json: String) -> napi::Result<String> {
        let options = serde_json::from_str::<BuildPromptTomlArtifactOptions>(&options_json)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;

        build_prompt_toml_artifact(options).map_err(napi::Error::from_reason)
    }
} // mod napi_binding
