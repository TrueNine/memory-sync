use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use crate::cli::AssembleNpmArgs;

struct PackageTarget {
  suffix: &'static str,
  package_dir: &'static str,
  binary_name: &'static str,
}

struct PackageAssemblyReport {
  copied: Vec<PathBuf>,
  skipped: Vec<String>,
}

enum LocalBuildCopyAttempt {
  Copied(PathBuf),
  MissingBinary(String),
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
    Ok(report) => {
      for path in report.copied {
        println!("Hydrated {}", path.display());
      }
      // Fixes #381: best-effort assembly still needs to explain skipped targets,
      // otherwise partial output looks like a complete success.
      for skipped in report.skipped {
        eprintln!("Skipped {skipped}");
      }
      ExitCode::SUCCESS
    }
    Err(error) => {
      eprintln!("Error: {error}");
      ExitCode::FAILURE
    }
  }
}

fn assemble_packages(args: &AssembleNpmArgs) -> Result<PackageAssemblyReport, String> {
  if let Some(artifacts_dir) = args.artifacts_dir.as_deref() {
    return PACKAGE_TARGETS
      .iter()
      .map(|target| copy_target_from_artifacts(target, artifacts_dir))
      .collect::<Result<Vec<_>, _>>()
      .map(|copied| PackageAssemblyReport {
        copied,
        skipped: Vec::new(),
      });
  }

  // Fixes #381: missing targets stay best-effort, but real copy errors and skips
  // are now surfaced instead of being silently discarded.
  let mut copied = Vec::new();
  let mut skipped = Vec::new();
  for target in PACKAGE_TARGETS {
    match try_copy_target_from_local_build(target, &args.profile)? {
      LocalBuildCopyAttempt::Copied(path) => copied.push(path),
      LocalBuildCopyAttempt::MissingBinary(reason) => skipped.push(reason),
    }
  }

  if copied.is_empty() {
    let host_target = detect_host_target()?;
    copy_target_from_local_build(host_target, &args.profile).map(|path| PackageAssemblyReport {
      copied: vec![path],
      skipped: Vec::new(),
    })
  } else {
    Ok(PackageAssemblyReport { copied, skipped })
  }
}

fn try_copy_target_from_local_build(
  target: &PackageTarget,
  profile: &str,
) -> Result<LocalBuildCopyAttempt, String> {
  // Fixes #381: distinguish "target was never built" from "copy failed" so the
  // caller can keep best-effort behavior without swallowing real I/O errors.
  let target_triple = target_to_triple(target.suffix);
  let cross_source = workspace_root()
    .join("target")
    .join(target_triple)
    .join(profile)
    .join(target.binary_name);

  if cross_source.is_file() {
    return copy_into_package(target, &cross_source).map(LocalBuildCopyAttempt::Copied);
  }

  let source = workspace_root()
    .join("target")
    .join(profile)
    .join(target.binary_name);

  if !source.is_file() {
    return Ok(LocalBuildCopyAttempt::MissingBinary(format!(
      "{}: missing binary. Tried:\n  - {}\n  - {}\n  Run cargo build --{} --target {} -p tnmsc first.",
      target.suffix,
      cross_source.display(),
      source.display(),
      profile,
      target_triple
    )));
  }

  copy_into_package(target, &source).map(LocalBuildCopyAttempt::Copied)
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
  // Fixes #381: the host-target fallback still needs the old fail-fast contract,
  // so convert the richer attempt result back into a plain error here.
  match try_copy_target_from_local_build(target, profile)? {
    LocalBuildCopyAttempt::Copied(path) => Ok(path),
    LocalBuildCopyAttempt::MissingBinary(reason) => Err(reason),
  }
}

fn target_to_triple(suffix: &str) -> &str {
  match suffix {
    "linux-x64-gnu" => "x86_64-unknown-linux-gnu",
    "linux-arm64-gnu" => "aarch64-unknown-linux-gnu",
    "darwin-arm64" => "aarch64-apple-darwin",
    "darwin-x64" => "x86_64-apple-darwin",
    "win32-x64-msvc" => "x86_64-pc-windows-msvc",
    _ => suffix,
  }
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
    .unwrap_or_else(|| unreachable!("package target mapping must stay in sync"))
}

fn package_root() -> PathBuf {
  std::env::var_os("TNMSC_NPM_PACKAGE_ROOT")
    .map(PathBuf::from)
    .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")))
}

fn workspace_root() -> PathBuf {
  if let Some(path) = std::env::var_os("TNMSC_WORKSPACE_ROOT") {
    return PathBuf::from(path);
  }

  PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .parent()
    .map(Path::to_path_buf)
    .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")))
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

#[cfg(test)]
mod tests {
  use std::sync::{Mutex, OnceLock};
  use std::time::{SystemTime, UNIX_EPOCH};

  use super::*;

  fn test_env_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
  }

  fn unique_temp_dir(label: &str) -> PathBuf {
    let nanos = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("system time should be after unix epoch")
      .as_nanos();
    let path = std::env::temp_dir().join(format!(
      "tnmsc-package-tests-{label}-{}-{nanos}",
      std::process::id()
    ));
    fs::create_dir_all(&path).expect("temp dir should be created");
    path
  }

  #[test]
  fn assemble_packages_reports_copy_errors_instead_of_silently_skipping_targets() {
    let _guard = test_env_lock()
      .lock()
      .expect("test env lock should not poison");
    let package_root = unique_temp_dir("package-root");
    let workspace_root = unique_temp_dir("workspace-root");

    let release_dir = workspace_root.join("target");
    let linux_x64_dir = release_dir.join("x86_64-unknown-linux-gnu").join("release");
    let linux_arm64_dir = release_dir
      .join("aarch64-unknown-linux-gnu")
      .join("release");
    fs::create_dir_all(&linux_x64_dir).expect("x64 target dir should exist");
    fs::create_dir_all(&linux_arm64_dir).expect("arm64 target dir should exist");
    fs::write(linux_x64_dir.join("tnmsc"), "x64").expect("x64 binary should exist");
    fs::write(linux_arm64_dir.join("tnmsc"), "arm64").expect("arm64 binary should exist");

    let broken_bin_path = package_root.join("npm").join("linux-arm64-gnu").join("bin");
    fs::create_dir_all(
      broken_bin_path
        .parent()
        .expect("broken bin parent should be present"),
    )
    .expect("broken bin parent dir should exist");
    fs::write(&broken_bin_path, "not-a-directory").expect("broken bin marker should exist");

    let previous_package_root = std::env::var_os("TNMSC_NPM_PACKAGE_ROOT");
    let previous_workspace_root = std::env::var_os("TNMSC_WORKSPACE_ROOT");
    unsafe {
      std::env::set_var("TNMSC_NPM_PACKAGE_ROOT", &package_root);
      std::env::set_var("TNMSC_WORKSPACE_ROOT", &workspace_root);
    }

    let result = assemble_packages(&AssembleNpmArgs {
      artifacts_dir: None,
      profile: "release".to_string(),
    });

    match previous_package_root {
      Some(value) => unsafe {
        std::env::set_var("TNMSC_NPM_PACKAGE_ROOT", value);
      },
      None => unsafe {
        std::env::remove_var("TNMSC_NPM_PACKAGE_ROOT");
      },
    }
    match previous_workspace_root {
      Some(value) => unsafe {
        std::env::set_var("TNMSC_WORKSPACE_ROOT", value);
      },
      None => unsafe {
        std::env::remove_var("TNMSC_WORKSPACE_ROOT");
      },
    }

    assert!(
      result.is_err(),
      "copy errors for discovered local targets must not be silently skipped"
    );

    let _ = fs::remove_dir_all(package_root);
    let _ = fs::remove_dir_all(workspace_root);
  }
}
