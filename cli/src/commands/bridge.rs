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

pub fn plugins() -> ExitCode {
  let plugins = tnmsd::list_plugins();

  println!("# Registered adaptors");
  println!();

  if plugins.is_empty() {
    println!("- No adaptors are currently registered.");
  } else {
    for plugin in plugins {
      if plugin.dependencies.is_empty() {
        println!("- {}", plugin.name);
      } else {
        println!(
          "- {} (depends on: {})",
          plugin.name,
          plugin.dependencies.join(", ")
        );
      }
    }
  }

  ExitCode::SUCCESS
}
