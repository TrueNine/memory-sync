use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use crate::cli::AssembleNpmArgs;

struct PackageTarget {
  suffix: &'static str,
  package_dir: &'static str,
  binary_name: &'static str,
}

const PACKAGE_TARGETS: &[PackageTarget] = &[
  PackageTarget {
    suffix: "linux-x64-gnu",
    package_dir: "linux-x64-gnu",
    binary_name: "tnmsc",
  },
  PackageTarget {
    suffix: "linux-arm64-gnu",
    package_dir: "linux-arm64-gnu",
    binary_name: "tnmsc",
  },
  PackageTarget {
    suffix: "darwin-arm64",
    package_dir: "darwin-arm64",
    binary_name: "tnmsc",
  },
  PackageTarget {
    suffix: "darwin-x64",
    package_dir: "darwin-x64",
    binary_name: "tnmsc",
  },
  PackageTarget {
    suffix: "win32-x64-msvc",
    package_dir: "win32-x64-msvc",
    binary_name: "tnmsc.exe",
  },
];

pub fn execute(args: &AssembleNpmArgs) -> ExitCode {
  match assemble_packages(args) {
    Ok(copied) => {
      for path in copied {
        println!("Hydrated {}", path.display());
      }
      ExitCode::SUCCESS
    }
    Err(error) => {
      eprintln!("Error: {error}");
      ExitCode::FAILURE
    }
  }
}

fn assemble_packages(args: &AssembleNpmArgs) -> Result<Vec<PathBuf>, String> {
  if let Some(artifacts_dir) = args.artifacts_dir.as_deref() {
    return PACKAGE_TARGETS
      .iter()
      .map(|target| copy_target_from_artifacts(target, artifacts_dir))
      .collect();
  }

  let host_target = detect_host_target()?;
  copy_target_from_local_build(host_target, &args.profile).map(|path| vec![path])
}

fn copy_target_from_artifacts(
  target: &PackageTarget,
  artifacts_dir: &Path,
) -> Result<PathBuf, String> {
  let source = artifacts_dir
    .join(format!("cli-binary-{}", target.suffix))
    .join(target.binary_name);

  if !source.is_file() {
    return Err(format!(
      "Missing artifact binary for {} at {}",
      target.suffix,
      source.display()
    ));
  }

  copy_into_package(target, &source)
}

fn copy_target_from_local_build(target: &PackageTarget, profile: &str) -> Result<PathBuf, String> {
  let source = workspace_root()
    .join("target")
    .join(profile)
    .join(target.binary_name);

  if !source.is_file() {
    return Err(format!(
      "Missing local host binary at {}. Run cargo build --{} --manifest-path cli/Cargo.toml first.",
      source.display(),
      profile
    ));
  }

  copy_into_package(target, &source)
}

fn copy_into_package(target: &PackageTarget, source: &Path) -> Result<PathBuf, String> {
  let destination = package_root()
    .join("npm")
    .join(target.package_dir)
    .join("bin")
    .join(target.binary_name);

  if let Some(parent) = destination.parent() {
    fs::create_dir_all(parent).map_err(|error| {
      format!(
        "Failed to create package directory {}: {error}",
        parent.display()
      )
    })?;
  }

  fs::copy(source, &destination).map_err(|error| {
    format!(
      "Failed to copy {} into {}: {error}",
      source.display(),
      destination.display()
    )
  })?;

  set_executable_permissions(&destination)?;

  Ok(destination)
}

fn detect_host_target() -> Result<&'static PackageTarget, String> {
  match (std::env::consts::OS, std::env::consts::ARCH) {
    ("linux", "x86_64") => Ok(find_target("linux-x64-gnu")),
    ("linux", "aarch64") => Ok(find_target("linux-arm64-gnu")),
    ("macos", "aarch64") => Ok(find_target("darwin-arm64")),
    ("macos", "x86_64") => Ok(find_target("darwin-x64")),
    ("windows", "x86_64") => Ok(find_target("win32-x64-msvc")),
    (os, arch) => Err(format!(
      "Unsupported host platform for npm package assembly: {os}-{arch}"
    )),
  }
}

fn find_target(suffix: &str) -> &'static PackageTarget {
  PACKAGE_TARGETS
    .iter()
    .find(|target| target.suffix == suffix)
    .expect("package target mapping must stay in sync")
}

fn package_root() -> PathBuf {
  PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn workspace_root() -> PathBuf {
  package_root()
    .parent()
    .expect("cli crate should always live under the workspace root")
    .to_path_buf()
}

#[cfg(unix)]
fn set_executable_permissions(path: &Path) -> Result<(), String> {
  use std::os::unix::fs::PermissionsExt;

  let mut permissions = fs::metadata(path)
    .map_err(|error| format!("Failed to read metadata for {}: {error}", path.display()))?
    .permissions();
  permissions.set_mode(0o755);
  fs::set_permissions(path, permissions)
    .map_err(|error| format!("Failed to mark {} as executable: {error}", path.display()))
}

#[cfg(not(unix))]
fn set_executable_permissions(_path: &Path) -> Result<(), String> {
  Ok(())
}
