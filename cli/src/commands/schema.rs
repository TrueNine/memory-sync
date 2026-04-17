use std::fs;
use std::path::Path;
use std::process::ExitCode;

use crate::cli::SchemaArgs;

pub fn execute(args: &SchemaArgs) -> ExitCode {
  match tnmsd::generate_schema() {
    Ok(schema) => match write_schema(args.output.as_deref(), &schema) {
      Ok(()) => ExitCode::SUCCESS,
      Err(error) => {
        eprintln!("Error: {error}");
        ExitCode::FAILURE
      }
    },
    Err(error) => {
      eprintln!("Error: {error}");
      ExitCode::FAILURE
    }
  }
}

fn write_schema(output: Option<&Path>, schema: &str) -> Result<(), String> {
  if let Some(path) = output {
    if let Some(parent) = path.parent() {
      fs::create_dir_all(parent).map_err(|error| {
        format!(
          "Failed to create schema output directory {}: {error}",
          parent.display()
        )
      })?;
    }

    fs::write(path, schema)
      .map_err(|error| format!("Failed to write schema to {}: {error}", path.display()))?;
  } else {
    println!("{schema}");
  }

  Ok(())
}
