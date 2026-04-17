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
  ExportMetadata, MdxGlobalScope, MdxToMdOptions, MdxToMdResult, MetadataSource, mdx_to_md,
  mdx_to_md_with_metadata,
};
pub use parser::parse_mdx;
pub use serializer::serialize;
pub use toml_artifact::{
  BuildPromptTomlArtifactOptions, BuildTomlDocumentOptions, build_prompt_toml_artifact,
  build_toml_document,
};
pub use transformer::ProcessingContext;

#[cfg(test)] // mod napi_binding
