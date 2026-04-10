//! CLI argument parsing using clap derive API.
//!
//! Mirrors the TS `PluginPipeline.parseArgs()` + `resolveCommand()`.

use clap::{Args, Parser, Subcommand};

/// Cross-AI-tool prompt synchronisation CLI
#[derive(Parser, Debug)]
#[command(
    name = "tnmsc",
    version = env!("CARGO_PKG_VERSION"),
    about = "Memory Sync CLI — Synchronize AI memory and configuration files across projects.",
    disable_help_subcommand = true,
)]
pub struct Cli {
  #[command(subcommand)]
  pub command: Option<CliCommand>,

  /// Set log level to trace (most verbose)
  #[arg(long = "trace", global = true)]
  pub trace: bool,

  /// Set log level to debug
  #[arg(long = "debug", global = true)]
  pub debug: bool,

  /// Set log level to info
  #[arg(long = "info", global = true)]
  pub info: bool,

  /// Set log level to warn
  #[arg(long = "warn", global = true)]
  pub warn: bool,

  /// Set log level to error
  #[arg(long = "error", global = true)]
  pub error: bool,
}

#[derive(Subcommand, Debug)]
pub enum CliCommand {
  /// Show help message
  Help,

  /// Show version information
  Version,

  /// Run the install pipeline
  Install,

  /// Preview changes without writing files
  #[command(name = "dry-run")]
  DryRun,

  /// Remove all generated output files and directories
  Clean(CleanArgs),

  /// List all registered plugins
  Plugins,
}

#[derive(Args, Debug)]
pub struct CleanArgs {
  /// Preview cleanup without removing files
  #[arg(short = 'n', long = "dry-run")]
  pub dry_run: bool,
}

/// Resolved log level from CLI flags.
/// When multiple flags are provided, the most verbose wins.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResolvedLogLevel {
  Trace,
  Debug,
  Info,
  Warn,
  Error,
}

impl ResolvedLogLevel {
  fn priority(self) -> u8 {
    match self {
      Self::Trace => 0,
      Self::Debug => 1,
      Self::Info => 2,
      Self::Warn => 3,
      Self::Error => 4,
    }
  }

  #[allow(dead_code)]
  pub fn as_str(self) -> &'static str {
    match self {
      Self::Trace => "trace",
      Self::Debug => "debug",
      Self::Info => "info",
      Self::Warn => "warn",
      Self::Error => "error",
    }
  }

  pub fn to_logger_level(self) -> tnmsc_logger::LogLevel {
    match self {
      Self::Trace => tnmsc_logger::LogLevel::Trace,
      Self::Debug => tnmsc_logger::LogLevel::Debug,
      Self::Info => tnmsc_logger::LogLevel::Info,
      Self::Warn => tnmsc_logger::LogLevel::Warn,
      Self::Error => tnmsc_logger::LogLevel::Error,
    }
  }
}

/// Resolve log level from CLI flags.
/// When multiple flags are set, the most verbose (lowest priority number) wins.
pub fn resolve_log_level(cli: &Cli) -> Option<ResolvedLogLevel> {
  let mut levels = Vec::new();
  if cli.trace {
    levels.push(ResolvedLogLevel::Trace);
  }
  if cli.debug {
    levels.push(ResolvedLogLevel::Debug);
  }
  if cli.info {
    levels.push(ResolvedLogLevel::Info);
  }
  if cli.warn {
    levels.push(ResolvedLogLevel::Warn);
  }
  if cli.error {
    levels.push(ResolvedLogLevel::Error);
  }

  if levels.is_empty() {
    return None;
  }

  levels.into_iter().min_by_key(|l| l.priority())
}

/// Resolved command after processing CLI args.
/// Maps clap subcommands to the internal command enum used by the runner.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResolvedCommand {
  Help,
  Version,
  Install,
  DryRun,
  Clean,
  DryRunClean,
  Plugins,
}

/// Resolve the command to execute from parsed CLI args.
pub fn resolve_command(cli: &Cli) -> ResolvedCommand {
  match &cli.command {
    None => ResolvedCommand::Install,
    Some(CliCommand::Help) => ResolvedCommand::Help,
    Some(CliCommand::Version) => ResolvedCommand::Version,
    Some(CliCommand::Install) => ResolvedCommand::Install,
    Some(CliCommand::DryRun) => ResolvedCommand::DryRun,
    Some(CliCommand::Clean(args)) => {
      if args.dry_run {
        ResolvedCommand::DryRunClean
      } else {
        ResolvedCommand::Clean
      }
    }
    Some(CliCommand::Plugins) => ResolvedCommand::Plugins,
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use clap::Parser;

  #[test]
  fn resolve_command_defaults_to_install() {
    let cli = Cli::parse_from(["tnmsc"]);
    assert_eq!(resolve_command(&cli), ResolvedCommand::Install);
  }

  #[test]
  fn resolve_command_parses_install() {
    let cli = Cli::parse_from(["tnmsc", "install"]);
    assert_eq!(resolve_command(&cli), ResolvedCommand::Install);
  }

  #[test]
  fn resolve_command_parses_clean_dry_run() {
    let cli = Cli::parse_from(["tnmsc", "clean", "--dry-run"]);
    assert_eq!(resolve_command(&cli), ResolvedCommand::DryRunClean);
  }
}
