use std::path::PathBuf;

use clap::{Args, Parser, Subcommand};

#[derive(Parser, Debug)]
#[command(
  name = "memory-sync-mcp",
  version = env!("CARGO_PKG_VERSION"),
  about = "Memory Sync MCP stdio server",
  disable_help_subcommand = true,
)]
pub struct Cli {
  #[command(subcommand)]
  pub command: Option<CliCommand>,
}

#[derive(Subcommand, Debug)]
pub enum CliCommand {
  /// Hydrate npm package contents from local or downloaded binaries
  #[command(hide = true, name = "assemble-npm")]
  AssembleNpm(AssembleNpmArgs),
}

#[derive(Args, Debug, Clone, PartialEq, Eq)]
pub struct AssembleNpmArgs {
  /// Directory containing downloaded mcp-binary-* artifacts
  #[arg(long = "artifacts-dir")]
  pub artifacts_dir: Option<PathBuf>,

  /// Cargo profile name used for local host builds
  #[arg(long = "profile", default_value = "release")]
  pub profile: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResolvedCommand {
  Serve,
  AssembleNpm(AssembleNpmArgs),
}

pub fn resolve_command(cli: &Cli) -> ResolvedCommand {
  match &cli.command {
    None => ResolvedCommand::Serve,
    Some(CliCommand::AssembleNpm(args)) => ResolvedCommand::AssembleNpm(args.clone()),
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use clap::Parser;

  #[test]
  fn resolve_command_defaults_to_stdio_server() {
    let cli = Cli::parse_from(["memory-sync-mcp"]);
    assert_eq!(resolve_command(&cli), ResolvedCommand::Serve);
  }

  #[test]
  fn resolve_command_parses_assemble_npm() {
    let cli = Cli::parse_from(["memory-sync-mcp", "assemble-npm", "--profile", "release"]);
    assert_eq!(
      resolve_command(&cli),
      ResolvedCommand::AssembleNpm(AssembleNpmArgs {
        artifacts_dir: None,
        profile: "release".to_string(),
      })
    );
  }
}
