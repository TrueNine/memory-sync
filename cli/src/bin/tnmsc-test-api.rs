use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Args, Parser, Subcommand};

#[derive(Parser, Debug)]
#[command(name = "tnmsc-test-api", disable_help_subcommand = true)]
struct Cli {
  #[command(subcommand)]
  command: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
  ResolveProxyPath(ResolveProxyPathArgs),
  CollectAindexResolvers(CollectAindexResolversArgs),
}

#[derive(Args, Debug)]
struct ResolveProxyPathArgs {
  #[arg(long = "proxy-path")]
  proxy_path: PathBuf,

  #[arg(long = "root-dir")]
  root_dir: PathBuf,

  #[arg(long = "logical-path")]
  logical_path: String,
}

#[derive(Args, Debug)]
struct CollectAindexResolversArgs {
  #[arg(long = "workspace-dir")]
  workspace_dir: PathBuf,
}

fn print_result(result: Result<String, tnmsd::CliError>) -> ExitCode {
  match result {
    Ok(output) => {
      println!("{output}");
      ExitCode::SUCCESS
    }
    Err(error) => {
      eprintln!("Error: {error}");
      ExitCode::FAILURE
    }
  }
}

fn main() -> ExitCode {
  let cli = Cli::parse();

  match cli.command {
    Command::ResolveProxyPath(args) => print_result(
      tnmsd::infra::script_runtime::resolve_path_via_proxy_impl(
        &args.proxy_path,
        &args.root_dir,
        &args.logical_path,
        serde_json::json!({}),
      )
      .map_err(tnmsd::CliError::ExecutionError),
    ),
    Command::CollectAindexResolvers(args) => {
      let input = serde_json::json!({
        "workspaceDir": args.workspace_dir.to_string_lossy(),
      });
      print_result(
        tnmsd::repositories::aindex_resolvers::collect_aindex_resolvers(&input.to_string()),
      )
    }
  }
}
