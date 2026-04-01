use std::path::Path;
use std::process::ExitCode;

use tnmsc_logger::create_logger;

pub fn execute(pairs: &[(String, String)]) -> ExitCode {
    let logger = create_logger("config", None);

    for (key, _) in pairs {
        if key != "workspaceDir" && key != "logLevel" {
            logger.info(
                format!(
                    "Unknown config key was ignored: {key}. Supported keys: workspaceDir, logLevel"
                ),
                None,
            );
        }
    }

    match tnmsc::update_global_config_from_pairs(Path::new("."), pairs) {
        Ok(config_path) => {
            logger.info(
                serde_json::Value::String(format!("Config saved to {}", config_path.display())),
                None,
            );
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}
