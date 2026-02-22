use std::process::ExitCode;

use tnmsc_logger::create_logger;

pub fn execute() -> ExitCode {
    let logger = create_logger("outdated", None);
    let current = env!("CARGO_PKG_VERSION");

    let output = std::process::Command::new("npm")
        .args(["view", "@truenine/memory-sync-cli", "version", "--json"])
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let raw = String::from_utf8_lossy(&out.stdout);
            let latest = raw.trim().trim_matches('"');
            if latest == current {
                println!("tnmsc is up to date: {current}");
            } else {
                println!("tnmsc is outdated: {current} → {latest}");
                println!("Run: npm install -g @truenine/memory-sync-cli");
                return ExitCode::from(1);
            }
            ExitCode::SUCCESS
        }
        _ => {
            logger.warn(
                serde_json::Value::String("Could not check npm registry for latest version".into()),
                None,
            );
            ExitCode::SUCCESS
        }
    }
}
