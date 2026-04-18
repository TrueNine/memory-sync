pub use crate::core::config::{ConfigLoader, MergedConfigResult, PluginsConfig, UserConfigFile};
pub use crate::core::execution_plan::ExecutionScope;
pub use crate::core::plugin_shared::{
    CollectedInputContext, FastCommandPrompt, GlobalMemoryPrompt, IDEKind, NamingCaseKind,
    PluginKind, Project, ProjectIDEConfigFile, PromptKind, RelativePath, RulePrompt,
    RuleScope, SkillPrompt, SubAgentPrompt, Workspace, AIAgentIgnoreConfigFile, ReadmePrompt,
};
pub use crate::core::base_output_plans::{BaseOutputFileDeclarationDto, BaseOutputPlansDto};
pub use crate::core::output_runtime_targets;