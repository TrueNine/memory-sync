pub mod base_output_plans;
pub mod cleanup;
pub mod config;
pub mod output_context;
pub mod output_plans;
pub mod plugin_shared;

pub use base_output_plans::{BaseOutputFileDeclarationDto, BaseOutputPlansDto};
pub use cleanup::{
  CleanupDeclarationsDto, CleanupPlan, CleanupSnapshot, CleanupTargetDto, CleanupTargetKindDto,
  ProtectionModeDto,
};
pub use config::{ConfigLoader, MergedConfigResult, PluginsConfig, UserConfigFile};
pub use output_context::OutputContext;
pub use plugin_shared::{
  AIAgentIgnoreConfigFile, GlobalMemoryPrompt, IDEKind, NamingCaseKind, PluginKind, Project,
  ProjectIDEConfigFile, PromptKind, ReadmePrompt, RelativePath, RulePrompt, RuleScope, SkillPrompt,
  SlashCommandPrompt, SubAgentPrompt, Workspace,
};

#[cfg(test)]
pub(crate) static TEST_ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[cfg(test)]
pub(crate) fn with_test_home_dir<T>(home_dir: &std::path::Path, callback: impl FnOnce() -> T) -> T {
  let _guard = match TEST_ENV_LOCK.lock() {
    Ok(g) => g,
    Err(error) => error.into_inner(),
  };
  let previous_home = std::env::var_os("HOME");

  unsafe {
    std::env::set_var("HOME", home_dir);
  }

  let result = callback();

  match previous_home {
    Some(value) => unsafe {
      std::env::set_var("HOME", value);
    },
    None => unsafe {
      std::env::remove_var("HOME");
    },
  }

  result
}
