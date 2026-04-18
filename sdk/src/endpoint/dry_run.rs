use crate::services::dry_run_service::dry_run as svc_dry_run;
use crate::MemorySyncCommandOptions;
use crate::MemorySyncCommandResult;

pub fn dry_run(options: MemorySyncCommandOptions) -> Result<MemorySyncCommandResult, crate::CliError> {
    svc_dry_run(options)
}