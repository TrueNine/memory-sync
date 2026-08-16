use super::{CroessweaveCommandOptions, CroessweaveCommandResult, SdkError};
use crate::services::clean_service::clean as svc_clean;

pub fn clean(options: CroessweaveCommandOptions) -> Result<CroessweaveCommandResult, SdkError> {
  svc_clean(options)
}
