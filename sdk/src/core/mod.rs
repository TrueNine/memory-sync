pub mod base_output_plans;
pub mod claude_code_output_plan;
pub mod cleanup;
pub mod codex_output_plan;
pub mod command_bridge;
pub mod config;
pub mod context_merger;
pub mod cursor_output_plan;
pub mod dependency_resolver;
pub mod desk_paths;
pub mod droid_output_plan;
pub mod execution_plan;
pub mod gemini_output_plan;
pub mod generic_skills_output_plan;
pub mod git_discovery;
pub mod jetbrains_ai_assistant_codex_output_plan;
pub mod kiro_output_plan;
pub mod md_cleanup;
pub mod opencode_output_plan;
pub mod output_runtime_targets;
pub mod path_blocking;
pub mod plugin_shared;
pub mod qoder_output_plan;
pub mod skill_dist_cleanup;
pub mod trae_output_plan;
pub mod warp_output_plan;
pub mod windsurf_output_plan;
pub mod wsl_mirror_sync;

/// Shared mutex for tests that mutate process-global environment variables (e.g. HOME).
/// Acquiring this lock prevents parallel tests from observing inconsistent env state.
#[cfg(test)]
pub(crate) static TEST_ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
