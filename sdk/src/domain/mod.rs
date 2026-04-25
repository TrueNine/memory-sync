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
  AIAgentIgnoreConfigFile, FastCommandPrompt, GlobalMemoryPrompt, IDEKind, NamingCaseKind,
  PluginKind, Project, ProjectIDEConfigFile, PromptKind, ReadmePrompt, RelativePath, RulePrompt,
  RuleScope, SkillPrompt, SubAgentPrompt, Workspace,
};

#[cfg(test)]
pub(crate) static TEST_ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
