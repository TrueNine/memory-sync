use std::process::ExitCode;

use tnmsc_logger::create_logger;
use crate::core::config::ConfigLoader;

pub fn execute() -> ExitCode {
    let logger = create_logger("config-show", None);
    let cwd = match std::env::current_dir() {
        Ok(p) => p,
        Err(e) => {
            logger.error(
                serde_json::Value::String(format!("Failed to get current directory: {e}")),
                None,
            );
            return ExitCode::FAILURE;
        }
    };

    let result = ConfigLoader::with_defaults().load(&cwd);
    match serde_json::to_string_pretty(&result.config) {
        Ok(json) => {
            println!("{json}");
            ExitCode::SUCCESS
        }
        Err(e) => {
            logger.error(
                serde_json::Value::String(format!("Failed to serialize config: {e}")),
                None,
            );
            ExitCode::FAILURE
        }
    }
}
