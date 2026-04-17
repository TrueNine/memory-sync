use std::process::ExitCode;

pub fn execute() -> ExitCode {
  match tnmsc::generate_schema() {
    Ok(schema) => {
      println!("{schema}");
      ExitCode::SUCCESS
    }
    Err(error) => {
      eprintln!("Error: {error}");
      ExitCode::FAILURE
    }
  }
}
