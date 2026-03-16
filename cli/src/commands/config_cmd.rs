use std::process::ExitCode;

use crate::diagnostic_helpers::{diagnostic, line, optional_details};
use serde_json::json;
use tnmsc_logger::create_logger;

use crate::core::config::{ConfigLoader, get_global_config_path};

pub fn execute(pairs: &[(String, String)]) -> ExitCode {
    let logger = create_logger("config", None);
    let result = ConfigLoader::with_defaults().load(std::path::Path::new("."));
    let mut config = result.config;

    for (key, value) in pairs {
        match key.as_str() {
            "workspaceDir" => config.workspace_dir = Some(value.clone()),
            "logLevel" => config.log_level = Some(value.clone()),
            _ => {
                logger.warn(diagnostic(
                    "CONFIG_KEY_UNKNOWN",
                    "Unknown config key was ignored",
                    line("The provided config key is not supported by this command."),
                    Some(line(
                        "Use one of the supported keys: `workspaceDir`, `logLevel`.",
                    )),
                    None,
                    optional_details(json!({ "key": key })),
                ));
            }
        }
    }

    let config_path = get_global_config_path();
    match serde_json::to_string_pretty(&config) {
        Ok(json) => {
            if let Some(parent) = config_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            match std::fs::write(&config_path, &json) {
                Ok(()) => {
                    logger.info(
                        serde_json::Value::String(format!(
                            "Config saved to {}",
                            config_path.display()
                        )),
                        None,
                    );
                    ExitCode::SUCCESS
                }
                Err(e) => {
                    logger.error(diagnostic(
                        "CONFIG_WRITE_FAILED",
                        "Failed to write the global config file",
                        line("The CLI generated the config JSON but could not write it to disk."),
                        Some(line("Check that the config path is writable and retry.")),
                        None,
                        optional_details(json!({
                            "path": config_path.to_string_lossy(),
                            "error": e.to_string()
                        })),
                    ));
                    ExitCode::FAILURE
                }
            }
        }
        Err(e) => {
            logger.error(diagnostic(
                "CONFIG_SERIALIZATION_FAILED",
                "Failed to serialize the config",
                line("The config object could not be converted to JSON."),
                None,
                None,
                optional_details(json!({ "error": e.to_string() })),
            ));
            ExitCode::FAILURE
        }
    }
}
