use std::process::ExitCode;

use crate::diagnostic_helpers::{diagnostic, line, optional_details};
use serde_json::json;
use tnmsc_logger::create_logger;

use crate::core::config::ConfigLoader;

pub fn execute() -> ExitCode {
    let logger = create_logger("config-show", None);
    let result = ConfigLoader::with_defaults().load(std::path::Path::new("."));
    match serde_json::to_string_pretty(&result.config) {
        Ok(json) => {
            println!("{json}");
            ExitCode::SUCCESS
        }
        Err(e) => {
            logger.error(diagnostic(
                "CONFIG_SERIALIZATION_FAILED",
                "Failed to serialize the config",
                line("The merged config could not be converted to JSON for display."),
                None,
                None,
                optional_details(json!({ "error": e.to_string() })),
            ));
            ExitCode::FAILURE
        }
    }
}
