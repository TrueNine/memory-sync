use super::{MemorySyncCommandOptions, MemorySyncCommandResult, SdkError};
use crate::services::install_service::install as svc_install;

pub fn install(options: MemorySyncCommandOptions) -> Result<MemorySyncCommandResult, SdkError> {
  svc_install(options)
}
