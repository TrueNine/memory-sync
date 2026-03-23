use std::process::ExitCode;

use crate::diagnostic_helpers::{diagnostic, line, optional_details};
use serde_json::json;
use tnmsc_logger::create_logger;

use crate::core::config::ConfigLoader;

pub fn execute() -> ExitCode {
    let logger = create_logger("config-show", None);
    let result = match ConfigLoader::with_defaults().try_load(std::path::Path::new(".")) {
        Ok(result) => result,
        Err(error) => {
            logger.error(diagnostic(
                "GLOBAL_CONFIG_PATH_RESOLUTION_FAILED",
                "Failed to resolve the global config path",
                line("The runtime could not determine which global config file should be shown."),
                Some(line(
                    "Ensure the required global config exists and retry the command.",
                )),
                None,
                optional_details(json!({ "error": error })),
            ));
            return ExitCode::FAILURE;
        }
    };
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
