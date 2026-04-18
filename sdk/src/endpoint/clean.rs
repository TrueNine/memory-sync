use crate::services::clean_service::clean as svc_clean;
use crate::MemorySyncCommandOptions;
use crate::MemorySyncCommandResult;

pub fn clean(options: MemorySyncCommandOptions) -> Result<MemorySyncCommandResult, crate::CliError> {
    svc_clean(options)
}