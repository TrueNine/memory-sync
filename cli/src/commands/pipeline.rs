use std::process::ExitCode;

fn map_result(result: Result<tnmsd::MemorySyncCommandResult, tnmsd::CliError>) -> ExitCode {
  match result {
    Ok(r) if r.success => ExitCode::SUCCESS,
    Ok(_) => ExitCode::FAILURE,
    Err(e) => {
      eprintln!("Error: {}", e);
      ExitCode::FAILURE
    }
  }
}

pub fn install() -> ExitCode {
  map_result(tnmsd::install(tnmsd::MemorySyncCommandOptions::default()))
}

pub fn dry_run() -> ExitCode {
  map_result(tnmsd::dry_run(tnmsd::MemorySyncCommandOptions::default()))
}

pub fn clean() -> ExitCode {
  map_result(tnmsd::clean(tnmsd::MemorySyncCommandOptions::default()))
}

pub fn dry_run_clean() -> ExitCode {
  let options = tnmsd::MemorySyncCommandOptions {
    dry_run: Some(true),
    ..Default::default()
  };
  map_result(tnmsd::clean(options))
}
