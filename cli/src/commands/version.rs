use std::process::ExitCode;

pub fn execute() -> ExitCode {
  println!("{}", tnmsd::version());
  ExitCode::SUCCESS
}
