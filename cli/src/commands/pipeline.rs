use std::process::ExitCode;

use serde_json::{Value, json};

use tnmsd::infra::logger::{Logger, create_logger, flush};

#[derive(Debug, PartialEq, Eq)]
struct RenderedCommandResult {
  success: bool,
  stdout_lines: Vec<String>,
  stderr_lines: Vec<String>,
}

fn render_result(
  result: Result<tnmsd::MemorySyncCommandResult, tnmsd::CliError>,
) -> RenderedCommandResult {
  match result {
    Ok(r) => {
      let mut stdout_lines = Vec::new();
      let mut stderr_lines = Vec::new();

      if let Some(message) = r
        .message
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
      {
        if r.success {
          stdout_lines.push(message.to_string());
        } else {
          stderr_lines.push(format!("Error: {message}"));
        }
      }

      stderr_lines.extend(render_entries("Warning", &r.warnings));
      stderr_lines.extend(render_entries("Error", &r.errors));

      if !r.success && stderr_lines.is_empty() {
        stderr_lines.push("Error: Command failed without additional details.".to_string());
      }

      RenderedCommandResult {
        success: r.success,
        stdout_lines,
        stderr_lines,
      }
    }
    Err(e) => RenderedCommandResult {
      success: false,
      stdout_lines: Vec::new(),
      stderr_lines: vec![format!("Error: {e}")],
    },
  }
}

fn render_entries(label: &str, values: &[Value]) -> Vec<String> {
  values
    .iter()
    .flat_map(|value| render_entry(label, value))
    .collect()
}

fn render_entry(label: &str, value: &Value) -> Vec<String> {
  match value {
    Value::String(text) => vec![format!("{label}: {text}")],
    Value::Object(map) => {
      if map.get("type").and_then(Value::as_str) == Some("workspace_mismatch") {
        let mut lines = vec![format!(
          "{label}: {}",
          map
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("Current directory is outside configured workspaceDir.")
        )];
        if let Some(current_dir) = map.get("currentDir").and_then(Value::as_str) {
          lines.push(format!("  currentDir: {current_dir}"));
        }
        if let Some(workspace_dir) = map.get("workspaceDir").and_then(Value::as_str) {
          lines.push(format!("  workspaceDir: {workspace_dir}"));
        }
        if let Some(config_sources) = map.get("configSources").and_then(Value::as_array)
          && !config_sources.is_empty()
        {
          lines.push(format!(
            "  configSources: {}",
            config_sources
              .iter()
              .filter_map(Value::as_str)
              .collect::<Vec<_>>()
              .join(", ")
          ));
        }
        return lines;
      }

      if map.get("type").and_then(Value::as_str) == Some("violation") {
        let target = map
          .get("target")
          .and_then(Value::as_str)
          .unwrap_or("<unknown>");
        let protected = map
          .get("protected")
          .and_then(Value::as_str)
          .unwrap_or("<unknown>");
        let reason = map
          .get("reason")
          .and_then(Value::as_str)
          .unwrap_or("cleanup target is protected");
        return vec![format!(
          "{label}: Cleanup violation for {target} (protected: {protected}): {reason}"
        )];
      }

      if map.get("type").and_then(Value::as_str) == Some("conflict") {
        let output = map
          .get("output")
          .and_then(Value::as_str)
          .unwrap_or("<unknown>");
        let protected = map
          .get("protected")
          .and_then(Value::as_str)
          .unwrap_or("<unknown>");
        let reason = map
          .get("reason")
          .and_then(Value::as_str)
          .unwrap_or("cleanup target conflicts with a protected path");
        return vec![format!(
          "{label}: Cleanup conflict for {output} (protected: {protected}): {reason}"
        )];
      }

      if let Some(error) = map.get("error").and_then(Value::as_str) {
        if let Some(path) = map.get("path").and_then(Value::as_str) {
          return vec![format!("{label}: {path}: {error}")];
        }
        return vec![format!("{label}: {error}")];
      }

      if let Some(warning) = map.get("warning").and_then(Value::as_str) {
        if let Some(path) = map.get("path").and_then(Value::as_str) {
          return vec![format!("{label}: {path}: {warning}")];
        }
        return vec![format!("{label}: {warning}")];
      }

      vec![format!(
        "{label}: {}",
        serde_json::to_string(value).unwrap_or_else(|_| "<unprintable diagnostic>".to_string())
      )]
    }
    _ => vec![format!(
      "{label}: {}",
      serde_json::to_string(value).unwrap_or_else(|_| "<unprintable diagnostic>".to_string())
    )],
  }
}

fn log_command_start(logger: &Logger, command_name: &str) {
  logger.info(format!("Running {command_name}"), None);
  if let Ok(current_dir) = std::env::current_dir() {
    logger.debug(
      "currentDir",
      Some(json!({ "currentDir": current_dir.display().to_string() })),
    );
  }
}

fn log_command_finish(
  logger: &Logger,
  command_name: &str,
  result: &Result<tnmsd::MemorySyncCommandResult, tnmsd::CliError>,
) {
  match result {
    Ok(command_result) => {
      logger.debug(
        "command result",
        Some(json!({
          "command": command_name,
          "success": command_result.success,
          "filesAffected": command_result.files_affected,
          "dirsAffected": command_result.dirs_affected,
          "warnings": command_result.warnings.len(),
          "errors": command_result.errors.len(),
        })),
      );
    }
    Err(error) => {
      logger.error(tnmsd::infra::logger::DiagnosticInput {
        code: "COMMAND_FAILED".to_string(),
        title: format!("{command_name} failed"),
        root_cause: vec![error.to_string()],
        exact_fix: None,
        possible_fixes: None,
        details: None,
      });
    }
  }
}

fn run_command(
  command_name: &str,
  operation: impl FnOnce(
    tnmsd::MemorySyncCommandOptions,
  ) -> Result<tnmsd::MemorySyncCommandResult, tnmsd::CliError>,
  options: tnmsd::MemorySyncCommandOptions,
) -> ExitCode {
  let logger = create_logger("pipeline", None);
  log_command_start(&logger, command_name);
  let result = operation(options);
  log_command_finish(&logger, command_name, &result);
  let rendered = render_result(result);

  for line in rendered.stdout_lines {
    println!("{line}");
  }
  for line in rendered.stderr_lines {
    eprintln!("{line}");
  }

  flush();

  if rendered.success {
    ExitCode::SUCCESS
  } else {
    ExitCode::FAILURE
  }
}

pub fn install() -> ExitCode {
  run_command(
    "install",
    tnmsd::install,
    tnmsd::MemorySyncCommandOptions::default(),
  )
}

pub fn dry_run() -> ExitCode {
  run_command(
    "dry-run",
    tnmsd::dry_run,
    tnmsd::MemorySyncCommandOptions::default(),
  )
}

pub fn clean() -> ExitCode {
  run_command(
    "clean",
    tnmsd::clean,
    tnmsd::MemorySyncCommandOptions::default(),
  )
}

pub fn dry_run_clean() -> ExitCode {
  let options = tnmsd::MemorySyncCommandOptions {
    dry_run: Some(true),
    ..Default::default()
  };
  run_command("clean --dry-run", tnmsd::clean, options)
}

#[cfg(test)]
mod tests {
  use serde_json::json;

  use super::*;

  #[test]
  fn render_result_prints_success_message_to_stdout() {
    let rendered = render_result(Ok(tnmsd::MemorySyncCommandResult {
      success: true,
      files_affected: 1,
      dirs_affected: 0,
      message: Some("Deleted 1 files and 0 directories".to_string()),
      warnings: Vec::new(),
      errors: Vec::new(),
    }));

    assert_eq!(
      rendered,
      RenderedCommandResult {
        success: true,
        stdout_lines: vec!["Deleted 1 files and 0 directories".to_string()],
        stderr_lines: Vec::new(),
      }
    );
  }

  #[test]
  fn render_result_formats_workspace_mismatch_warning() {
    let rendered = render_result(Ok(tnmsd::MemorySyncCommandResult {
      success: true,
      files_affected: 0,
      dirs_affected: 0,
      message: Some("No files needed updates".to_string()),
      warnings: vec![json!({
        "type": "workspace_mismatch",
        "message": "Current directory is outside configured workspaceDir. tnmsc will operate on the configured workspace instead of the current directory.",
        "currentDir": "C:/workspace/memory-sync",
        "workspaceDir": "C:/temp/demo",
        "configSources": ["C:/Users/truen/.aindex/.tnmsc.json"]
      })],
      errors: Vec::new(),
    }));

    assert_eq!(
      rendered.stderr_lines,
      vec![
        "Warning: Current directory is outside configured workspaceDir. tnmsc will operate on the configured workspace instead of the current directory.".to_string(),
        "  currentDir: C:/workspace/memory-sync".to_string(),
        "  workspaceDir: C:/temp/demo".to_string(),
        "  configSources: C:/Users/truen/.aindex/.tnmsc.json".to_string(),
      ]
    );
  }

  #[test]
  fn render_result_formats_path_errors() {
    let rendered = render_result(Ok(tnmsd::MemorySyncCommandResult {
      success: false,
      files_affected: 0,
      dirs_affected: 0,
      message: Some("Cleanup blocked".to_string()),
      warnings: Vec::new(),
      errors: vec![json!({
        "path": "C:/workspace/file.md",
        "error": "access denied"
      })],
    }));

    assert_eq!(rendered.stderr_lines[0], "Error: Cleanup blocked");
    assert_eq!(
      rendered.stderr_lines[1],
      "Error: C:/workspace/file.md: access denied"
    );
  }
}
