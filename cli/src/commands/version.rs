use std::process::ExitCode;

pub fn execute() -> ExitCode {
  println!("{}", tnmsc::version());
  ExitCode::SUCCESS
}
