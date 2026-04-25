mod cli;
mod commands;

use std::process::ExitCode;

use clap::Parser;
use tnmsd::infra::logger::{LogLevel, set_global_level};

pub fn run() -> ExitCode {
  let args = cli::Cli::parse();

  if let Some(level) = cli::resolve_log_level(&args) {
    let log_level = match level {
      cli::ResolvedLogLevel::Trace => LogLevel::Trace,
      cli::ResolvedLogLevel::Debug => LogLevel::Debug,
      cli::ResolvedLogLevel::Info => LogLevel::Info,
      cli::ResolvedLogLevel::Warn => LogLevel::Warn,
      cli::ResolvedLogLevel::Error => LogLevel::Error,
    };
    set_global_level(log_level);
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
