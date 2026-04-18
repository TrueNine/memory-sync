pub mod base_output_plans;
pub mod config;
pub mod execution_plan;
pub mod output_plans;
pub mod output_runtime_targets;
pub mod plugin_shared;

pub use base_output_plans::{BaseOutputFileDeclarationDto, BaseOutputPlansDto};
pub use config::{ConfigLoader, MergedConfigResult, PluginsConfig, UserConfigFile};
pub use execution_plan::ExecutionScope;
pub use plugin_shared::{
    CollectedInputContext, FastCommandPrompt, GlobalMemoryPrompt, IDEKind, NamingCaseKind,
    PluginKind, Project, ProjectIDEConfigFile, PromptKind, RelativePath, RulePrompt,
    RuleScope, SkillPrompt, SubAgentPrompt, Workspace, AIAgentIgnoreConfigFile, ReadmePrompt,
};

#[cfg(test)]
pub(crate) static TEST_ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());