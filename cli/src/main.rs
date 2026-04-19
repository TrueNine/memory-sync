//! tnmsc — Rust CLI entry point.
//!
//! Pure Rust commands: help, version
//! Facade commands: install, dry-run, clean

use std::process::ExitCode;

fn main() -> ExitCode {
  tnmsc::run()
}
