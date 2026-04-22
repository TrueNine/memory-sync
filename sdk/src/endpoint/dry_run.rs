use super::{MemorySyncCommandOptions, MemorySyncCommandResult, SdkError};
use crate::services::dry_run_service::dry_run as svc_dry_run;

pub fn dry_run(options: MemorySyncCommandOptions) -> Result<MemorySyncCommandResult, SdkError> {
  svc_dry_run(options)
}
