//! tnmsc — Rust CLI shell entry point.
//!
//! Pure Rust commands: help, version, config, config-show
//! Bridge commands (Node.js): execute, dry-run, clean, plugins

mod cli;

use std::process::ExitCode;

use clap::Parser;
use tnmsc_logger::set_global_log_level;

use cli::{Cli, ResolvedCommand, resolve_command, resolve_log_level};

fn main() -> ExitCode {
    let cli = Cli::parse();

    if let Some(level) = resolve_log_level(&cli) {
        set_global_log_level(level.to_logger_level());
    }

    let json_mode = cli.json;
    if json_mode {
        set_global_log_level(tnmsc_logger::LogLevel::Silent);
    }

    let command = resolve_command(&cli);

    match command {
        ResolvedCommand::Help => tnmsc::commands::help::execute(),
        ResolvedCommand::Version => tnmsc::commands::version::execute(),
        ResolvedCommand::Config(pairs) => tnmsc::commands::config_cmd::execute(&pairs),
        ResolvedCommand::ConfigShow => tnmsc::commands::config_show::execute(),
        ResolvedCommand::Execute => tnmsc::commands::bridge::execute(json_mode),
        ResolvedCommand::DryRun => tnmsc::commands::bridge::dry_run(json_mode),
        ResolvedCommand::Clean => tnmsc::commands::bridge::clean(json_mode),
        ResolvedCommand::DryRunClean => tnmsc::commands::bridge::dry_run_clean(json_mode),
        ResolvedCommand::Plugins => tnmsc::commands::bridge::plugins(json_mode),
    }
}
