use std::process::ExitCode;

use tnmsc_config::ConfigLoader;
use tnmsc_logger::create_logger;

pub fn execute(pairs: &[(String, String)]) -> ExitCode {
    let logger = create_logger("config", None);
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
    let mut config = result.config;

    for (key, value) in pairs {
        match key.as_str() {
            "workspaceDir" => config.workspace_dir = Some(value.clone()),
            "logLevel" => config.log_level = Some(value.clone()),
            _ => {
                logger.warn(
                    serde_json::Value::String(format!("Unknown config key: {key}")),
                    None,
                );
            }
        }
    }

    let config_path = tnmsc_config::get_global_config_path();
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
                    logger.error(
                        serde_json::Value::String(format!(
                            "Failed to write config to {}: {e}",
                            config_path.display()
                        )),
                        None,
                    );
                    ExitCode::FAILURE
                }
            }
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
