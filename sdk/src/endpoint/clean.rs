use crate::services::clean_service::clean as svc_clean;
use super::{SdkError, MemorySyncCommandOptions, MemorySyncCommandResult};

pub fn clean(
  options: MemorySyncCommandOptions,
) -> Result<MemorySyncCommandResult, SdkError> {
  svc_clean(options)
}
