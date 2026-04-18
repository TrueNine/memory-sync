use crate::services::dry_run_service::dry_run as svc_dry_run;
use super::{SdkError, MemorySyncCommandOptions, MemorySyncCommandResult};

pub fn dry_run(
  options: MemorySyncCommandOptions,
) -> Result<MemorySyncCommandResult, SdkError> {
  svc_dry_run(options)
}
