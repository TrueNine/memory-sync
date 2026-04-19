use super::{MemorySyncCommandOptions, MemorySyncCommandResult, SdkError};
use crate::services::clean_service::clean as svc_clean;

pub fn clean(options: MemorySyncCommandOptions) -> Result<MemorySyncCommandResult, SdkError> {
  svc_clean(options)
}
