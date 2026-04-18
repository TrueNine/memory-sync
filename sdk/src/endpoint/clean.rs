use crate::MemorySyncCommandOptions;
use crate::MemorySyncCommandResult;
use crate::services::clean_service::clean as svc_clean;

pub fn clean(options: MemorySyncCommandOptions) -> Result<MemorySyncCommandResult, crate::CliError> {
    svc_clean(options)
}