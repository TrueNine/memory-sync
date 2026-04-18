use crate::MemorySyncCommandOptions;
use crate::MemorySyncCommandResult;
use crate::services::dry_run_service::dry_run as svc_dry_run;

pub fn dry_run(options: MemorySyncCommandOptions) -> Result<MemorySyncCommandResult, crate::CliError> {
    svc_dry_run(options)
}