use std::process::ExitCode;

fn map_result(result: Result<tnmsc::MemorySyncCommandResult, tnmsc::CliError>) -> ExitCode {
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
  map_result(tnmsc::install(tnmsc::MemorySyncCommandOptions::default()))
}

pub fn dry_run() -> ExitCode {
  map_result(tnmsc::dry_run(tnmsc::MemorySyncCommandOptions::default()))
}

pub fn clean() -> ExitCode {
  map_result(tnmsc::clean(tnmsc::MemorySyncCommandOptions::default()))
}

pub fn dry_run_clean() -> ExitCode {
  let options = tnmsc::MemorySyncCommandOptions {
    dry_run: Some(true),
    ..Default::default()
  };
  map_result(tnmsc::clean(options))
}

pub fn plugins() -> ExitCode {
  let plugins = tnmsc::list_plugins();

  println!("# Registered plugins");
  println!();

  if plugins.is_empty() {
    println!("- No plugins are currently registered.");
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
