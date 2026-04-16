pub mod base_output_plans;
pub mod cleanup;
pub mod command_bridge;
pub mod config;
pub mod context_merger;
pub mod dependency_resolver;
pub mod desk_paths;
pub mod droid_output_plan;
pub mod execution_plan;
pub mod gemini_output_plan;
pub mod git_discovery;
pub mod input_plugins;
pub mod kiro_output_plan;
pub mod md_cleanup;
pub mod output_runtime_targets;
pub mod path_blocking;
pub mod plugin_shared;
pub mod skill_dist_cleanup;
pub mod warp_output_plan;
pub mod wsl_mirror_sync;

/// Shared mutex for tests that mutate process-global environment variables (e.g. HOME).
/// Acquiring this lock prevents parallel tests from observing inconsistent env state.
#[cfg(test)]
pub(crate) static TEST_ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
