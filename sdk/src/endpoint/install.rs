use crate::services::install_service::install as svc_install;
use super::{SdkError, MemorySyncCommandOptions, MemorySyncCommandResult};

pub fn install(
  options: MemorySyncCommandOptions,
) -> Result<MemorySyncCommandResult, SdkError> {
  svc_install(options)
}
