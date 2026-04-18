use crate::services::install_service::install as svc_install;
use crate::MemorySyncCommandOptions;
use crate::MemorySyncCommandResult;

pub fn install(options: MemorySyncCommandOptions) -> Result<MemorySyncCommandResult, crate::CliError> {
    svc_install(options)
}