use super::{CroessweaveCommandOptions, CroessweaveCommandResult, SdkError};
use crate::services::install_service::install as svc_install;

pub fn install(options: CroessweaveCommandOptions) -> Result<CroessweaveCommandResult, SdkError> {
  svc_install(options)
}
