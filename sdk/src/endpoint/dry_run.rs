use super::{CroessweaveCommandOptions, CroessweaveCommandResult, SdkError};
use crate::services::dry_run_service::dry_run as svc_dry_run;

pub fn dry_run(options: CroessweaveCommandOptions) -> Result<CroessweaveCommandResult, SdkError> {
  svc_dry_run(options)
}
