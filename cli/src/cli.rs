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

    /// Output results as JSON (suppresses all log output)
    #[arg(short = 'j', long = "json", global = true)]
    pub json: bool,

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

    /// Preview changes without writing files
    #[command(name = "dry-run")]
    DryRun,

    /// Remove all generated output files and directories
    Clean(CleanArgs),

    /// Set or show configuration values
    Config(ConfigArgs),

    /// List all registered plugins
    Plugins,
}

#[derive(Args, Debug)]
pub struct CleanArgs {
    /// Preview cleanup without removing files
    #[arg(short = 'n', long = "dry-run")]
    pub dry_run: bool,
}

#[derive(Args, Debug)]
pub struct ConfigArgs {
    /// Show merged configuration as JSON
    #[arg(long = "show")]
    pub show: bool,

    /// Configuration key=value pairs to set
    #[arg(long = "set", value_name = "KEY=VALUE")]
    pub set: Vec<String>,

    /// Positional key=value pairs
    pub positional: Vec<String>,
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
    Execute,
    DryRun,
    Clean,
    DryRunClean,
    Config(Vec<(String, String)>),
    ConfigShow,
    Plugins,
}

/// Parse --set and positional key=value pairs into (key, value) tuples.
fn parse_key_value_pairs(args: &ConfigArgs) -> Vec<(String, String)> {
    let mut pairs = Vec::new();

    for s in &args.set {
        if let Some(eq_idx) = s.find('=') {
            if eq_idx > 0 {
                pairs.push((s[..eq_idx].to_string(), s[eq_idx + 1..].to_string()));
            }
        }
    }

    for s in &args.positional {
        if let Some(eq_idx) = s.find('=') {
            if eq_idx > 0 {
                pairs.push((s[..eq_idx].to_string(), s[eq_idx + 1..].to_string()));
            }
        }
    }

    pairs
}

/// Resolve the command to execute from parsed CLI args.
pub fn resolve_command(cli: &Cli) -> ResolvedCommand {
    match &cli.command {
        None => ResolvedCommand::Execute,
        Some(CliCommand::Help) => ResolvedCommand::Help,
        Some(CliCommand::Version) => ResolvedCommand::Version,
        Some(CliCommand::DryRun) => ResolvedCommand::DryRun,
        Some(CliCommand::Clean(args)) => {
            if args.dry_run {
                ResolvedCommand::DryRunClean
            } else {
                ResolvedCommand::Clean
            }
        }
        Some(CliCommand::Config(args)) => {
            if args.show {
                ResolvedCommand::ConfigShow
            } else {
                let pairs = parse_key_value_pairs(args);
                if pairs.is_empty() {
                    // No key=value pairs and no --show: default to execute
                    ResolvedCommand::Execute
                } else {
                    ResolvedCommand::Config(pairs)
                }
            }
        }
        Some(CliCommand::Plugins) => ResolvedCommand::Plugins,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(args: &[&str]) -> Cli {
        Cli::try_parse_from(args).unwrap()
    }

    #[test]
    fn test_no_args_defaults_to_execute() {
        let cli = parse(&["tnmsc"]);
        assert_eq!(resolve_command(&cli), ResolvedCommand::Execute);
    }

    #[test]
    fn test_help_subcommand() {
        let cli = parse(&["tnmsc", "help"]);
        assert_eq!(resolve_command(&cli), ResolvedCommand::Help);
    }

    #[test]
    fn test_version_subcommand() {
        let cli = parse(&["tnmsc", "version"]);
        assert_eq!(resolve_command(&cli), ResolvedCommand::Version);
    }

    #[test]
    fn test_dry_run_subcommand() {
        let cli = parse(&["tnmsc", "dry-run"]);
        assert_eq!(resolve_command(&cli), ResolvedCommand::DryRun);
    }

    #[test]
    fn test_clean_subcommand() {
        let cli = parse(&["tnmsc", "clean"]);
        assert_eq!(resolve_command(&cli), ResolvedCommand::Clean);
    }

    #[test]
    fn test_clean_dry_run() {
        let cli = parse(&["tnmsc", "clean", "--dry-run"]);
        assert_eq!(resolve_command(&cli), ResolvedCommand::DryRunClean);
    }

    #[test]
    fn test_clean_short_dry_run() {
        let cli = parse(&["tnmsc", "clean", "-n"]);
        assert_eq!(resolve_command(&cli), ResolvedCommand::DryRunClean);
    }

    #[test]
    fn test_config_show() {
        let cli = parse(&["tnmsc", "config", "--show"]);
        assert_eq!(resolve_command(&cli), ResolvedCommand::ConfigShow);
    }

    #[test]
    fn test_config_set() {
        let cli = parse(&["tnmsc", "config", "workspaceDir=~/my-project"]);
        assert_eq!(
            resolve_command(&cli),
            ResolvedCommand::Config(vec![("workspaceDir".into(), "~/my-project".into())])
        );
    }

    #[test]
    fn test_config_set_flag() {
        let cli = parse(&["tnmsc", "config", "--set", "logLevel=debug"]);
        assert_eq!(
            resolve_command(&cli),
            ResolvedCommand::Config(vec![("logLevel".into(), "debug".into())])
        );
    }

    #[test]
    fn test_plugins_subcommand() {
        let cli = parse(&["tnmsc", "plugins"]);
        assert_eq!(resolve_command(&cli), ResolvedCommand::Plugins);
    }

    #[test]
    fn test_json_flag() {
        let cli = parse(&["tnmsc", "--json"]);
        assert!(cli.json);
    }

    #[test]
    fn test_json_short_flag() {
        let cli = parse(&["tnmsc", "-j"]);
        assert!(cli.json);
    }

    #[test]
    fn test_log_level_trace() {
        let cli = parse(&["tnmsc", "--trace"]);
        assert_eq!(resolve_log_level(&cli), Some(ResolvedLogLevel::Trace));
    }

    #[test]
    fn test_log_level_multiple_most_verbose_wins() {
        let cli = parse(&["tnmsc", "--warn", "--debug"]);
        assert_eq!(resolve_log_level(&cli), Some(ResolvedLogLevel::Debug));
    }

    #[test]
    fn test_no_log_level() {
        let cli = parse(&["tnmsc"]);
        assert_eq!(resolve_log_level(&cli), None);
    }
}
