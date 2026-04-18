use std::process::ExitCode;

pub fn execute() -> ExitCode {
  println!("{}", env!("CARGO_PKG_VERSION"));
  ExitCode::SUCCESS
}
