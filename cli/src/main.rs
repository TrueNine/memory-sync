//! tnmsc — Rust CLI shell entry point.
//!
//! Pure Rust commands: help, version, config, config-show
//! Bridge commands (Node.js): execute, dry-run, clean, plugins

mod cli;
mod commands;

use std::process::ExitCode;

use clap::Parser;
use tnmsc_logger::{flush_output, set_global_log_level};

use cli::{Cli, ResolvedCommand, resolve_command, resolve_log_level};

fn main() -> ExitCode {
    let cli = Cli::parse();

    if let Some(level) = resolve_log_level(&cli) {
        set_global_log_level(level.to_logger_level());
    }

    let command = resolve_command(&cli);

    let exit_code = match command {
        ResolvedCommand::Help => commands::help::execute(),
        ResolvedCommand::Version => commands::version::execute(),
        ResolvedCommand::Config(pairs) => commands::config_cmd::execute(&pairs),
        ResolvedCommand::ConfigShow => commands::config_show::execute(),
        ResolvedCommand::Execute => commands::bridge::execute(),
        ResolvedCommand::DryRun => commands::bridge::dry_run(),
        ResolvedCommand::Clean => commands::bridge::clean(),
        ResolvedCommand::DryRunClean => commands::bridge::dry_run_clean(),
        ResolvedCommand::Plugins => commands::bridge::plugins(),
    };

    flush_output();
    exit_code
}
