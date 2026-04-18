//! tnmsc — Rust CLI entry point.
//!
//! Pure Rust commands: help, version
//! Facade commands: install, dry-run, clean

mod cli;
mod commands;
pub mod logger;

use std::process::ExitCode;

use clap::Parser;

use cli::{Cli, ResolvedCommand, resolve_command, resolve_log_level};
use logger::{flush_output, set_global_log_level};

fn main() -> ExitCode {
  let cli = Cli::parse();

  if let Some(level) = resolve_log_level(&cli) {
    set_global_log_level(level.to_logger_level());
  }

  let command = resolve_command(&cli);

  let exit_code = match command {
    ResolvedCommand::Help => commands::help::execute(),
    ResolvedCommand::Version => commands::version::execute(),
    ResolvedCommand::AssembleNpm(args) => commands::package::execute(&args),
    ResolvedCommand::Install => commands::pipeline::install(),
    ResolvedCommand::DryRun => commands::pipeline::dry_run(),
    ResolvedCommand::Clean => commands::pipeline::clean(),
    ResolvedCommand::DryRunClean => commands::pipeline::dry_run_clean(),
  };

  flush_output();
  exit_code
}
