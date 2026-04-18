#![allow(dead_code)]

use std::env;
use std::ffi::OsString;
use std::fs;
use std::io::{self, Read, Write};
use std::path::PathBuf;
use std::process::{Command, ExitStatus, Stdio};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{CliError, MemorySyncCommandOptions, MemorySyncCommandResult};

pub(crate) const INTERNAL_COMMAND_BRIDGE_ENV: &str = "TNMSC_INTERNAL_COMMAND_BRIDGE";
pub(crate) const NODE_EXECUTABLE_ENV: &str = "TNMSC_NODE_EXECUTABLE";
pub(crate) const INTERNAL_COMMAND_BRIDGE_RESULT_PATH_ENV: &str =
  "TNMSC_INTERNAL_COMMAND_BRIDGE_RESULT_PATH";

const DEFAULT_INTERNAL_COMMAND_BRIDGE: &str = "dist/internal/native-command-bridge.mjs";
const DEFAULT_NODE_EXECUTABLE: &str = "node";

enum OutputTarget {
  Stdout,
  Stderr,
}

struct BridgeProcessOutput {
  status: ExitStatus,
  stdout: Vec<u8>,
  stderr: Vec<u8>,
}

pub(crate) fn execute_internal_command(
  command_name: &str,
  options: &MemorySyncCommandOptions,
) -> Result<MemorySyncCommandResult, CliError> {
  let bridge_entry = resolve_internal_command_bridge_path()?;
  let node_executable = resolve_node_executable();
  let result_path = create_bridge_result_path().map_err(CliError::IoError)?;
  let options_json = serde_json::to_string(options)?;

  let mut command = Command::new(&node_executable);
  command
    .arg(&bridge_entry)
    .arg(command_name)
    .arg(&options_json)
    .env("TNMSC_FORCE_NATIVE_BINDING", "1")
    .env(INTERNAL_COMMAND_BRIDGE_RESULT_PATH_ENV, &result_path)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

  if let Some(cwd) = options.cwd.as_deref() {
    command.current_dir(cwd);
  }

  let output = run_bridge_process(&mut command).map_err(CliError::IoError)?;
  if !output.status.success() {
    let _ = fs::remove_file(&result_path);
    return Err(CliError::ExecutionError(format!(
      "Internal command bridge failed for `{command_name}` via \"{}\" (node: {}). {}",
      bridge_entry.display(),
      node_executable.to_string_lossy(),
      format_process_failure(output.status, &output.stdout, &output.stderr),
    )));
  }

  let result_json = fs::read_to_string(&result_path).map_err(|error| {
    CliError::ExecutionError(format!(
      "Internal command bridge did not write a result payload for `{command_name}` via \"{}\": {error}. {}",
      bridge_entry.display(),
      format_captured_output(&output.stdout, &output.stderr),
    ))
  })?;
  let _ = fs::remove_file(&result_path);

  let trimmed = result_json.trim();
  if trimmed.is_empty() {
    return Err(CliError::ExecutionError(format!(
      "Internal command bridge returned empty output for `{command_name}` via \"{}\". {}",
      bridge_entry.display(),
      format_captured_output(&output.stdout, &output.stderr),
    )));
  }

  serde_json::from_str(trimmed).map_err(|error| {
    CliError::ExecutionError(format!(
      "Internal command bridge returned invalid JSON for `{command_name}` via \"{}\": {error}. Result: {trimmed}",
      bridge_entry.display(),
    ))
  })
}

fn create_bridge_result_path() -> io::Result<PathBuf> {
  let temp_dir = env::temp_dir();
  let process_id = std::process::id();
  let now = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_nanos();

  for attempt in 0..32 {
    let candidate = temp_dir.join(format!(
      "tnmsd-internal-command-bridge-{process_id}-{now}-{attempt}.json"
    ));
    if !candidate.exists() {
      return Ok(candidate);
    }
  }

  Err(io::Error::new(
    io::ErrorKind::AlreadyExists,
    "Failed to allocate a unique internal command bridge result path.",
  ))
}

fn spawn_output_forwarder<R>(
  mut reader: R,
  target: OutputTarget,
) -> thread::JoinHandle<io::Result<Vec<u8>>>
where
  R: Read + Send + 'static,
{
  thread::spawn(move || {
    let mut buffer = [0_u8; 8192];
    let mut collected = Vec::new();

    loop {
      let bytes_read = reader.read(&mut buffer)?;
      if bytes_read == 0 {
        break;
      }

      let chunk = &buffer[..bytes_read];
      collected.extend_from_slice(chunk);

      match target {
        OutputTarget::Stdout => {
          let mut stdout = io::stdout().lock();
          stdout.write_all(chunk)?;
          stdout.flush()?;
        }
        OutputTarget::Stderr => {
          let mut stderr = io::stderr().lock();
          stderr.write_all(chunk)?;
          stderr.flush()?;
        }
      }
    }

    Ok(collected)
  })
}

fn join_output_forwarder(
  handle: thread::JoinHandle<io::Result<Vec<u8>>>,
  stream_name: &str,
) -> io::Result<Vec<u8>> {
  match handle.join() {
    Ok(result) => result,
    Err(_) => Err(io::Error::other(format!(
      "Internal command bridge {stream_name} forwarder panicked."
    ))),
  }
}

fn run_bridge_process(command: &mut Command) -> io::Result<BridgeProcessOutput> {
  let mut child = command.spawn()?;
  let stdout = child
    .stdout
    .take()
    .ok_or_else(|| io::Error::other("Internal command bridge stdout pipe was unavailable."))?;
  let stderr = child
    .stderr
    .take()
    .ok_or_else(|| io::Error::other("Internal command bridge stderr pipe was unavailable."))?;

  let stdout_thread = spawn_output_forwarder(stdout, OutputTarget::Stdout);
  let stderr_thread = spawn_output_forwarder(stderr, OutputTarget::Stderr);
  let status = child.wait()?;
  let stdout = join_output_forwarder(stdout_thread, "stdout")?;
  let stderr = join_output_forwarder(stderr_thread, "stderr")?;

  Ok(BridgeProcessOutput {
    status,
    stdout,
    stderr,
  })
}

fn format_captured_output(stdout: &[u8], stderr: &[u8]) -> String {
  let stdout = String::from_utf8_lossy(stdout).trim().to_string();
  let stderr = String::from_utf8_lossy(stderr).trim().to_string();
  let mut details = Vec::new();

  if !stdout.is_empty() {
    details.push(format!("Stdout: {stdout}"));
  }
  if !stderr.is_empty() {
    details.push(format!("Stderr: {stderr}"));
  }

  if details.is_empty() {
    return "No stdout/stderr captured.".to_string();
  }

  details.join(" ")
}

fn resolve_internal_command_bridge_path() -> Result<PathBuf, CliError> {
  if let Some(override_path) = env::var_os(INTERNAL_COMMAND_BRIDGE_ENV) {
    let bridge_path = PathBuf::from(override_path);
    if bridge_path.exists() {
      return Ok(bridge_path);
    }

    return Err(CliError::ExecutionError(format!(
      "Internal command bridge override points to a missing file: \"{}\".",
      bridge_path.display(),
    )));
  }

  let bridge_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(DEFAULT_INTERNAL_COMMAND_BRIDGE);
  if bridge_path.exists() {
    return Ok(bridge_path);
  }

  Err(CliError::ExecutionError(format!(
    "Internal command bridge bundle is missing at \"{}\". Run `pnpm -C cli run build` before using native install/dry-run/clean commands.",
    bridge_path.display(),
  )))
}

fn resolve_node_executable() -> OsString {
  for key in [NODE_EXECUTABLE_ENV, "npm_node_execpath", "NODE"] {
    if let Some(value) = env::var_os(key)
      && !value.is_empty()
    {
      return value;
    }
  }

  OsString::from(DEFAULT_NODE_EXECUTABLE)
}

fn format_process_failure(status: ExitStatus, stdout: &[u8], stderr: &[u8]) -> String {
  let status = status.code().map_or_else(
    || "terminated by signal".to_string(),
    |code| format!("Exit code: {code}."),
  );
  format!("{status} {}", format_captured_output(stdout, stderr))
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;

  use tempfile::TempDir;

  fn write_bridge_script(temp_dir: &TempDir, name: &str, body: &str) -> PathBuf {
    let path = temp_dir.path().join(name);
    fs::write(&path, body).expect("bridge script should be written");
    path
  }

  fn bridge_script_with_result(body: &str) -> String {
    format!(
      r#"import {{writeFileSync}} from 'node:fs'
const resultPath = process.env.{}
function emitResult(payload) {{
  const serialized = JSON.stringify(payload)
  if (resultPath && resultPath.length > 0) {{
    writeFileSync(resultPath, serialized, 'utf8')
    return
  }}
  process.stdout.write(serialized)
}}
{}
"#,
      INTERNAL_COMMAND_BRIDGE_RESULT_PATH_ENV, body
    )
  }

  fn with_bridge_env<T>(bridge_path: &PathBuf, callback: impl FnOnce() -> T) -> T {
    let _guard = match crate::domain::TEST_ENV_LOCK.lock() {
      Ok(g) => g,
      Err(e) => e.into_inner(),
    };
    let previous_bridge = env::var_os(INTERNAL_COMMAND_BRIDGE_ENV);
    let previous_node = env::var_os(NODE_EXECUTABLE_ENV);

    unsafe {
      env::set_var(INTERNAL_COMMAND_BRIDGE_ENV, bridge_path);
      env::set_var(NODE_EXECUTABLE_ENV, "node");
    }

    let result = callback();

    match previous_bridge {
      Some(value) => unsafe {
        env::set_var(INTERNAL_COMMAND_BRIDGE_ENV, value);
      },
      None => unsafe {
        env::remove_var(INTERNAL_COMMAND_BRIDGE_ENV);
      },
    }
    match previous_node {
      Some(value) => unsafe {
        env::set_var(NODE_EXECUTABLE_ENV, value);
      },
      None => unsafe {
        env::remove_var(NODE_EXECUTABLE_ENV);
      },
    }

    result
  }

  #[test]
  fn execute_internal_command_parses_success_result() {
    let temp_dir = TempDir::new().expect("temp dir should exist");
    let bridge_path = write_bridge_script(
      &temp_dir,
      "bridge-success.mjs",
      &bridge_script_with_result(
        r#"const [, , commandName, optionsJson] = process.argv
const options = JSON.parse(optionsJson ?? '{}')
emitResult({
  success: true,
  filesAffected: commandName === 'install' ? 3 : 0,
  dirsAffected: options.cwd ? 1 : 0,
  message: options.cwd ?? null,
  warnings: [],
  errors: []
})"#,
      ),
    );

    let result = with_bridge_env(&bridge_path, || {
      execute_internal_command(
        "install",
        &MemorySyncCommandOptions {
          cwd: Some(temp_dir.path().display().to_string()),
          ..Default::default()
        },
      )
    })
    .expect("bridge-backed install should succeed");

    assert!(result.success);
    assert_eq!(result.files_affected, 3);
    assert_eq!(result.dirs_affected, 1);
    assert_eq!(
      result.message.as_deref(),
      Some(temp_dir.path().to_string_lossy().as_ref())
    );
  }

  #[test]
  fn execute_internal_command_passes_dry_run_to_clean_bridge() {
    let temp_dir = TempDir::new().expect("temp dir should exist");
    let bridge_path = write_bridge_script(
      &temp_dir,
      "bridge-clean.mjs",
      &bridge_script_with_result(
        r#"const [, , commandName, optionsJson] = process.argv
const options = JSON.parse(optionsJson ?? '{}')
emitResult({
  success: commandName === 'clean' && options.dryRun === true,
  filesAffected: options.dryRun === true ? 5 : 0,
  dirsAffected: options.dryRun === true ? 2 : 0,
  warnings: [],
  errors: []
})"#,
      ),
    );

    let result = with_bridge_env(&bridge_path, || {
      execute_internal_command(
        "clean",
        &MemorySyncCommandOptions {
          dry_run: Some(true),
          ..Default::default()
        },
      )
    })
    .expect("bridge-backed clean should succeed");

    assert!(result.success);
    assert_eq!(result.files_affected, 5);
    assert_eq!(result.dirs_affected, 2);
  }

  #[test]
  fn execute_internal_command_ignores_non_json_stdout_before_result() {
    let temp_dir = TempDir::new().expect("temp dir should exist");
    let bridge_path = write_bridge_script(
      &temp_dir,
      "bridge-logged-success.mjs",
      &bridge_script_with_result(
        r####"process.stdout.write("### progress\n")
emitResult({
  success: true,
  filesAffected: 1,
  dirsAffected: 0,
  warnings: [],
  errors: []
})"####,
      ),
    );

    let result = with_bridge_env(&bridge_path, || {
      execute_internal_command("install", &MemorySyncCommandOptions::default())
    })
    .expect("bridge-backed install should succeed when stdout includes logs before JSON");

    assert!(result.success);
    assert_eq!(result.files_affected, 1);
    assert_eq!(result.dirs_affected, 0);
  }

  #[test]
  fn execute_internal_command_reports_invalid_json() {
    let temp_dir = TempDir::new().expect("temp dir should exist");
    let bridge_path = write_bridge_script(
      &temp_dir,
      "bridge-invalid-json.mjs",
      &format!(
        "import {{writeFileSync}} from 'node:fs'\nconst resultPath = process.env.{}\nif (resultPath) writeFileSync(resultPath, 'not-json', 'utf8')\nelse process.stdout.write('not-json')\n",
        INTERNAL_COMMAND_BRIDGE_RESULT_PATH_ENV
      ),
    );

    let error = with_bridge_env(&bridge_path, || {
      execute_internal_command("dry-run", &MemorySyncCommandOptions::default())
    })
    .expect_err("invalid bridge output should fail");

    assert!(matches!(error, CliError::ExecutionError(_)));
    assert!(error.to_string().contains("invalid JSON"));
  }

  #[test]
  fn execute_internal_command_reports_bridge_failures() {
    let temp_dir = TempDir::new().expect("temp dir should exist");
    let bridge_path = write_bridge_script(
      &temp_dir,
      "bridge-failure.mjs",
      "process.stderr.write('bridge exploded\\n')\nprocess.exit(7)\n",
    );

    let error = with_bridge_env(&bridge_path, || {
      execute_internal_command("install", &MemorySyncCommandOptions::default())
    })
    .expect_err("bridge failure should surface");

    assert!(matches!(error, CliError::ExecutionError(_)));
    assert!(error.to_string().contains("bridge exploded"));
    assert!(error.to_string().contains("Exit code: 7"));
  }
}
