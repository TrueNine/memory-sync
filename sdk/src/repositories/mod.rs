#![deny(clippy::all)]

//! Input resolvers for the tnmsc pipeline.
//!
//! Resolvers are grouped by type:
//! - File readers (workspace, gitignore, editorconfig, vscode, jetbrains)
//! - MDX directory scanners (fast-command, sub-agent, rule, global-memory)
//! - Complex resolvers (shadow-project, skill, project-prompt, readme)
//! - Effect resolvers (md-cleanup, orphan-cleanup, skill-dist-cleanup)

pub mod aindex_resolvers;
pub mod command;
pub mod editorconfig;
pub mod git_exclude;
pub mod gitignore;
pub mod global_memory;
pub mod jetbrains_config;
pub mod localized_reader;
pub mod project_prompt;
pub mod prompt_artifact;
pub mod public_config;
pub mod readme;
pub mod rule;
pub mod shared_ignore;
pub mod skill;
pub mod subagent;
pub mod vscode_config;
pub mod workspace;
pub mod zed_config;
