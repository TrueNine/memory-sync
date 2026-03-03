#![deny(clippy::all)]

//! All 17 input plugins for the tnmsc pipeline.
//!
//! Plugins are grouped by type:
//! - File readers (workspace, gitignore, editorconfig, vscode, jetbrains)
//! - MDX directory scanners (fast-command, sub-agent, rule, global-memory)
//! - Complex plugins (shadow-project, skill, project-prompt, readme)
//! - Effect plugins (md-cleanup, orphan-cleanup, skill-sync)

