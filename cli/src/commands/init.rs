use std::process::ExitCode;

use tnmsc_init_bundle::BUNDLES;
use tnmsc_logger::create_logger;

pub fn execute() -> ExitCode {
    let logger = create_logger("init", None);
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

    let bundles = BUNDLES;
    if bundles.is_empty() {
        logger.warn(
            serde_json::Value::String(
                "No init bundles available. Build the native library first.".into(),
            ),
            None,
        );
        return ExitCode::SUCCESS;
    }

    let mut written = 0usize;
    for bundle in bundles {
        let target = cwd.join(&bundle.path);
        if let Some(parent) = target.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                logger.warn(
                    serde_json::Value::String(format!(
                        "Could not create directory {}: {e}",
                        parent.display()
                    )),
                    None,
                );
                continue;
            }
        }
        if target.exists() {
            logger.debug(
                serde_json::Value::String(format!("Skipping existing: {}", bundle.path)),
                None,
            );
            continue;
        }
        match std::fs::write(&target, &bundle.content) {
            Ok(()) => {
                logger.info(
                    serde_json::Value::String(format!("Created: {}", bundle.path)),
                    None,
                );
                written += 1;
            }
            Err(e) => {
                logger.warn(
                    serde_json::Value::String(format!("Failed to write {}: {e}", bundle.path)),
                    None,
                );
            }
        }
    }

    logger.info(
        serde_json::Value::String(format!("Init complete: {written} file(s) created")),
        None,
    );
    ExitCode::SUCCESS
}
