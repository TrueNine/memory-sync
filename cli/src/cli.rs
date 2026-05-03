//! CLI argument parsing using clap derive API.
//!
//! Mirrors the TS `PluginPipeline.parseArgs()` + `resolveCommand()`.

use std::path::PathBuf;

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

  // 修复 #375：这些日志级别 flag 必须互斥，避免同时传入时出现不透明的覆盖行为。
  /// Set log level to trace (most verbose)
  #[arg(
    long = "trace",
    global = true,
    conflicts_with_all = ["debug", "info", "warn", "error"]
  )]
  pub trace: bool,

  /// Set log level to debug
  #[arg(
    long = "debug",
    global = true,
    conflicts_with_all = ["trace", "info", "warn", "error"]
  )]
  pub debug: bool,

  /// Set log level to info
  #[arg(
    long = "info",
    global = true,
    conflicts_with_all = ["trace", "debug", "warn", "error"]
  )]
  pub info: bool,

  /// Set log level to warn
  #[arg(
    long = "warn",
    global = true,
    conflicts_with_all = ["trace", "debug", "info", "error"]
  )]
  pub warn: bool,

  /// Set log level to error
  #[arg(
    long = "error",
    global = true,
    conflicts_with_all = ["trace", "debug", "info", "warn"]
  )]
  pub error: bool,
}

#[derive(Subcommand, Debug)]
pub enum CliCommand {
  /// Show help message
  Help,

  /// Show version information
  Version,

  /// Hydrate npm package contents from local or downloaded binaries
  #[command(hide = true, name = "assemble-npm")]
  AssembleNpm(AssembleNpmArgs),

  /// Run the install pipeline
  Install,

  /// Preview changes without writing files
  #[command(name = "dry-run")]
  DryRun,

  /// Remove all generated output files and directories
  Clean(CleanArgs),
}

#[derive(Args, Debug)]
pub struct CleanArgs {
  /// Preview cleanup without removing files
  #[arg(short = 'n', long = "dry-run")]
  pub dry_run: bool,
}

#[derive(Args, Debug, Clone, PartialEq, Eq)]
pub struct AssembleNpmArgs {
  /// Directory containing downloaded cli-binary-* artifacts
  #[arg(long = "artifacts-dir")]
  pub artifacts_dir: Option<PathBuf>,

  /// Cargo profile name used for local host builds
  #[arg(long = "profile", default_value = "release")]
  pub profile: String,
}

/// Resolved log level from CLI flags.
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
}

/// Resolve log level from CLI flags.
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
  AssembleNpm(AssembleNpmArgs),
  Install,
  DryRun,
  Clean,
  DryRunClean,
}

/// Resolve the command to execute from parsed CLI args.
pub fn resolve_command(cli: &Cli) -> ResolvedCommand {
  match &cli.command {
    None => ResolvedCommand::Install,
    Some(CliCommand::Help) => ResolvedCommand::Help,
    Some(CliCommand::Version) => ResolvedCommand::Version,
    Some(CliCommand::AssembleNpm(args)) => ResolvedCommand::AssembleNpm(args.clone()),
    Some(CliCommand::Install) => ResolvedCommand::Install,
    Some(CliCommand::DryRun) => ResolvedCommand::DryRun,
    Some(CliCommand::Clean(args)) => {
      if args.dry_run {
        ResolvedCommand::DryRunClean
      } else {
        ResolvedCommand::Clean
      }
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use clap::Parser;
  use clap::error::ErrorKind;

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

  #[test]
  fn log_level_flags_reject_multiple_values() {
    // 修复 #375 的回归测试：同时传入多个日志级别 flag 时应当直接报错。
    let result = Cli::try_parse_from(["tnmsc", "--trace", "--debug"]);
    let error = result.expect_err("expected clap to reject conflicting log level flags");
    assert_eq!(error.kind(), ErrorKind::ArgumentConflict);
  }
}
