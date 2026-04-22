mod cli;
mod commands;
mod logger;

use std::process::ExitCode;

use clap::Parser;

pub fn run() -> ExitCode {
  let args = cli::Cli::parse();

  if let Some(level) = cli::resolve_log_level(&args) {
    logger::set_global_log_level(level.to_logger_level());
    tnmsd::infra::logger::set_global_log_level(level.to_sdk_logger_level());
  }

  match cli::resolve_command(&args) {
    cli::ResolvedCommand::Help => commands::help::execute(),
    cli::ResolvedCommand::Version => commands::version::execute(),
    cli::ResolvedCommand::AssembleNpm(ref args) => commands::package::execute(args),
    cli::ResolvedCommand::Install => commands::pipeline::install(),
    cli::ResolvedCommand::DryRun => commands::pipeline::dry_run(),
    cli::ResolvedCommand::Clean => commands::pipeline::clean(),
    cli::ResolvedCommand::DryRunClean => commands::pipeline::dry_run_clean(),
  }
}
