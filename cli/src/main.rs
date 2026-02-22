//! tnmsc — Rust CLI entry point.
//!
//! Pure Rust commands: help, version, outdated, init, config, config-show
//! Bridge commands (Node.js): execute, dry-run, clean, plugins

mod cli;
mod commands;
mod bridge;

use std::process::ExitCode;

use clap::Parser;
use tnmsc_logger::set_global_log_level;

use cli::{Cli, ResolvedCommand, resolve_command, resolve_log_level};

fn main() -> ExitCode {
    let cli = Cli::parse();

    // Resolve and set global log level
    if let Some(level) = resolve_log_level(&cli) {
        set_global_log_level(level.to_logger_level());
    }

    // In JSON mode, suppress all log output
    let json_mode = cli.json;
    if json_mode {
        set_global_log_level(tnmsc_logger::LogLevel::Silent);
    }

    let command = resolve_command(&cli);

    match command {
        // Pure Rust commands
        ResolvedCommand::Help => commands::help::execute(),
        ResolvedCommand::Version => commands::version::execute(),
        ResolvedCommand::Outdated => commands::outdated::execute(),
        ResolvedCommand::Init => commands::init::execute(),
        ResolvedCommand::Config(pairs) => commands::config_cmd::execute(&pairs),
        ResolvedCommand::ConfigShow => commands::config_show::execute(),

        // Bridge commands (delegate to Node.js plugin runtime)
        ResolvedCommand::Execute => commands::bridge::execute(json_mode),
        ResolvedCommand::DryRun => commands::bridge::dry_run(json_mode),
        ResolvedCommand::Clean => commands::bridge::clean(json_mode),
        ResolvedCommand::DryRunClean => commands::bridge::dry_run_clean(json_mode),
        ResolvedCommand::Plugins => commands::bridge::plugins(json_mode),
    }
}
