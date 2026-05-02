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

fn build_collect_aindex_resolvers_input(
  workspace_dir: &std::path::Path,
) -> Result<serde_json::Value, tnmsd::CliError> {
  let workspace_dir = workspace_dir.to_str().ok_or_else(|| {
    // Fixes #382: test/debug tooling must reject non-UTF-8 workspace paths
    // explicitly instead of silently corrupting them with to_string_lossy().
    tnmsd::CliError::ConfigError(
      "CollectAindexResolvers requires --workspace-dir to be valid UTF-8".to_string(),
    )
  })?;

  Ok(serde_json::json!({
    "workspaceDir": workspace_dir,
  }))
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
      let result = build_collect_aindex_resolvers_input(&args.workspace_dir).and_then(|input| {
        tnmsd::repositories::aindex_resolvers::collect_aindex_resolvers(&input.to_string())
      });
      print_result(result)
    }
  }
}

#[cfg(test)]
mod tests {
  use super::build_collect_aindex_resolvers_input;
  use std::path::Path;

  #[test]
  fn collect_aindex_resolvers_input_preserves_utf8_workspace_dir() {
    let input = build_collect_aindex_resolvers_input(Path::new("/tmp/demo")).unwrap();

    assert_eq!(input["workspaceDir"], serde_json::json!("/tmp/demo"));
  }

  #[cfg(unix)]
  #[test]
  fn collect_aindex_resolvers_input_rejects_non_utf8_workspace_dir() {
    use std::ffi::OsString;
    use std::os::unix::ffi::OsStringExt;
    use std::path::PathBuf;

    let invalid_path = PathBuf::from(OsString::from_vec(vec![0x66, 0x6f, 0x80, 0x6f]));
    let result = build_collect_aindex_resolvers_input(&invalid_path);

    assert!(
      result
        .as_ref()
        .err()
        .is_some_and(|error| error.to_string().contains("valid UTF-8")),
      "unexpected result: {result:?}"
    );
  }
}
