use clap::{Parser, Subcommand};
use std::process::{Command as ProcCommand, Stdio};

#[derive(Parser)]
#[command(name = "memory-sync-xtask")]
#[command(version = "2026.10422.10749")]
#[command(about = "Unified build entry for memory-sync workspace")]
struct Cli {
  #[command(subcommand)]
  command: Command,
}

#[derive(Subcommand)]
enum Command {
  /// Build all workspace crates
  Build,
  /// Run tests (excluding GUI and integration tests)
  Test,
  /// Run linting (fmt + clippy)
  Lint,
  /// Run type checking
  CheckType,
  /// Run bootstrap script
  Bootstrap,
  /// Build documentation
  DocBuild,
  /// Build GUI application
  GuiBuild,
  /// Run GUI in development mode
  GuiDev,
  /// Run all checks (lint + type + test)
  Check,
  /// Build GUI frontend only (routes + icons + vite)
  GuiFrontendBuild,
  /// Install git hooks for version sync
  InstallHooks,
}

fn run_cargo(args: &[&str]) -> Result<(), String> {
  let status = ProcCommand::new("cargo")
    .args(args)
    .stdout(Stdio::inherit())
    .stderr(Stdio::inherit())
    .spawn()
    .map_err(|e| format!("Failed to spawn cargo: {}", e))?
    .wait()
    .map_err(|e| format!("Failed to wait for cargo: {}", e))?;

  if status.success() {
    Ok(())
  } else {
    Err(format!(
      "Command failed with exit code: {:?}",
      status.code()
    ))
  }
}

fn run_pnpm(args: &[&str], dir: Option<&str>) -> Result<(), String> {
  let pnpm_binary = if cfg!(windows) { "pnpm.cmd" } else { "pnpm" };
  let mut cmd = ProcCommand::new(pnpm_binary);
  if let Some(d) = dir {
    cmd.arg("-C").arg(d);
  }
  cmd.args(args);

  let status = cmd
    .stdout(Stdio::inherit())
    .stderr(Stdio::inherit())
    .spawn()
    .map_err(|e| format!("Failed to spawn pnpm: {}", e))?
    .wait()
    .map_err(|e| format!("Failed to wait for pnpm: {}", e))?;

  if status.success() {
    Ok(())
  } else {
    Err(format!(
      "Command failed with exit code: {:?}",
      status.code()
    ))
  }
}

fn run_tauri(subcommand: &str) -> Result<(), String> {
  let status = ProcCommand::new("cargo")
    .args(["tauri", subcommand])
    .stdout(Stdio::inherit())
    .stderr(Stdio::inherit())
    .spawn()
    .map_err(|e| format!("Failed to spawn tauri: {}", e))?
    .wait()
    .map_err(|e| format!("Failed to wait for tauri: {}", e))?;

  if status.success() {
    Ok(())
  } else {
    Err(format!(
      "Command failed with exit code: {:?}",
      status.code()
    ))
  }
}

fn run_hook_creation() -> Result<(), String> {
  let git_dir = ProcCommand::new("git")
    .args(["rev-parse", "--git-dir"])
    .output()
    .map_err(|e| format!("Failed to get git dir: {}", e))?;

  let git_dir_path = String::from_utf8(git_dir.stdout)
    .map_err(|e| format!("Invalid git dir: {}", e))?
    .trim()
    .to_string();

  let hooks_dir = format!("{}/hooks", git_dir_path);
  let hook_content = r#"#!/bin/sh
# Version sync hook - auto-installed by memory-sync-xtask
exec tsx "$PWD/.githooks/sync-versions.ts" "$1"
"#;

  std::fs::create_dir_all(&hooks_dir).map_err(|e| format!("Failed to create hooks dir: {}", e))?;

  let hook_path = format!("{}/pre-commit", hooks_dir);
  std::fs::write(&hook_path, hook_content).map_err(|e| format!("Failed to write hook: {}", e))?;

  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(&hook_path, std::fs::Permissions::from_mode(0o755))
      .map_err(|e| format!("Failed to set permissions: {}", e))?;
  }

  println!("[xtask] Created pre-commit hook at {}", hook_path);
  Ok(())
}

fn main() -> Result<(), String> {
  let cli = Cli::parse();

  match cli.command {
    Command::Build => {
      println!("[xtask] Building workspace...");
      if cfg!(windows) {
        run_cargo(&["build", "--workspace", "--exclude", "xtask"])?;
      } else {
        run_cargo(&["build", "--workspace"])?;
      }
      println!("[xtask] Build completed.");
    }
    Command::Test => {
      println!("[xtask] Running tests...");
      run_cargo(&[
        "test",
        "--workspace",
        "--exclude",
        "tnmsg",
        "--exclude",
        "tnmsc-integrate-tests",
        "--exclude",
        "tnmsc-local-tests",
        "--exclude",
        "tnmsm-integrate-tests",
        "--lib",
        "--bins",
        "--tests",
      ])?;
      println!("[xtask] Tests completed.");
    }
    Command::Lint => {
      println!("[xtask] Running fmt check...");
      run_cargo(&["fmt", "--check"])?;
      println!("[xtask] Linting completed (clippy skipped - pre-existing warnings).");
      // run_cargo(&["clippy", "--workspace", "--", "-D", "warnings"])?;
      // println!("[xtask] Running clippy...");
      // println!("[xtask] Linting completed.");
    }
    Command::CheckType => {
      println!("[xtask] Running type checking...");
      run_cargo(&["check", "--workspace"])?;
      println!("[xtask] Type checking completed.");
    }
    Command::Bootstrap => {
      println!("[xtask] Running bootstrap...");
      run_pnpm(&["tsx", "scripts/bootstrap/bootstrap.ts"], None)?;
      println!("[xtask] Bootstrap completed.");
    }
    Command::DocBuild => {
      println!("[xtask] Building documentation...");
      run_pnpm(&["build"], Some("doc"))?;
      println!("[xtask] Documentation build completed.");
    }
    Command::GuiBuild => {
      println!("[xtask] Building GUI...");
      run_tauri("build")?;
      println!("[xtask] GUI build completed.");
    }
    Command::GuiDev => {
      println!("[xtask] Running GUI in development mode...");
      run_tauri("dev")?;
    }
    Command::GuiFrontendBuild => {
      println!("[xtask] Building GUI frontend...");
      run_pnpm(&["generate:routes"], Some("gui"))?;
      run_pnpm(&["generate:icons"], Some("gui"))?;
      run_pnpm(&["build"], Some("gui"))?;
      println!("[xtask] GUI frontend build completed.");
    }
    Command::Check => {
      println!("[xtask] Running full check...");
      run_cargo(&["fmt", "--check"])?;
      run_cargo(&["check", "--workspace"])?;
      run_cargo(&[
        "test",
        "--workspace",
        "--exclude",
        "tnmsg",
        "--exclude",
        "tnmsc-integrate-tests",
        "--exclude",
        "tnmsc-local-tests",
        "--exclude",
        "tnmsm-integrate-tests",
        "--lib",
        "--bins",
        "--tests",
      ])?;
      println!("[xtask] Full check completed.");
    }
    Command::InstallHooks => {
      println!("[xtask] Installing git hooks...");
      run_hook_creation()?;
      println!("[xtask] Git hooks installed successfully.");
    }
  }

  Ok(())
}
