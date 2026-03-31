use std::path::Path;
use std::process::ExitCode;

pub fn execute() -> ExitCode {
    match tnmsc::config_show(Path::new(".")) {
        Ok(json) => {
            println!("{json}");
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}
