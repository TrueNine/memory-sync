use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

struct TempDir(PathBuf);

impl TempDir {
  fn new() -> Self {
    let nonce = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("clock should be after the Unix epoch")
      .as_nanos();
    let path = std::env::temp_dir().join(format!("tnmsc-packaging-{}-{nonce}", std::process::id()));
    fs::create_dir_all(&path).expect("packaging temp dir should be created");
    Self(path)
  }
}

impl Drop for TempDir {
  fn drop(&mut self) {
    let _ = fs::remove_dir_all(&self.0);
  }
}

fn host_package() -> (&'static str, &'static str) {
  match (std::env::consts::OS, std::env::consts::ARCH) {
    ("windows", "x86_64") => ("win32-x64-msvc", "tnmsc.exe"),
    ("linux", "x86_64") => ("linux-x64-gnu", "tnmsc"),
    ("linux", "aarch64") => ("linux-arm64-gnu", "tnmsc"),
    ("macos", "x86_64") => ("darwin-x64", "tnmsc"),
    ("macos", "aarch64") => ("darwin-arm64", "tnmsc"),
    (os, arch) => panic!("unsupported packaging smoke host: {os}-{arch}"),
  }
}

fn npm() -> &'static str {
  if cfg!(windows) { "npm.cmd" } else { "npm" }
}

fn copy_file(source: impl AsRef<Path>, target: impl AsRef<Path>) {
  let target = target.as_ref();
  fs::create_dir_all(target.parent().expect("target should have a parent"))
    .expect("target parent should be created");
  fs::copy(source, target).expect("package file should be copied");
}

fn run(command: &mut Command, context: &str) -> std::process::Output {
  let output = command
    .output()
    .unwrap_or_else(|error| panic!("{context} should start: {error}"));
  assert!(
    output.status.success(),
    "{context} should succeed.\nstdout:\n{}\nstderr:\n{}",
    String::from_utf8_lossy(&output.stdout),
    String::from_utf8_lossy(&output.stderr)
  );
  output
}

fn pack(package_dir: &Path, output_dir: &Path) -> PathBuf {
  let output = run(
    Command::new(npm())
      .args(["pack", "--json", "--pack-destination"])
      .arg(output_dir)
      .current_dir(package_dir),
    "npm pack",
  );
  let reports: serde_json::Value =
    serde_json::from_slice(&output.stdout).expect("npm pack output should be JSON");
  let filename = reports[0]["filename"]
    .as_str()
    .expect("npm pack report should include filename");
  output_dir.join(filename)
}

#[test]
fn packaging_smoke_covers_release_binary_and_global_install() {
  let workspace_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .parent()
    .and_then(Path::parent)
    .expect("local-tests should be nested under cli")
    .to_path_buf();
  let source_root = workspace_root.join("cli");
  let (suffix, binary_name) = host_package();
  let temp = TempDir::new();
  let staged = temp.0.join("staged");
  let platform_dir = staged.join("npm").join(suffix);
  let tarballs = temp.0.join("tarballs");
  let install_root = temp.0.join("install");
  fs::create_dir_all(&tarballs).expect("tarball dir should be created");

  copy_file(
    source_root.join("package.json"),
    staged.join("package.json"),
  );
  copy_file(
    source_root.join("bin/tnmsc.js"),
    staged.join("bin/tnmsc.js"),
  );
  copy_file(
    source_root.join("schema/tnmsc.schema.json"),
    staged.join("schema/tnmsc.schema.json"),
  );
  copy_file(
    source_root.join("npm").join(suffix).join("package.json"),
    platform_dir.join("package.json"),
  );

  let release_binary = workspace_root.join("target/release").join(binary_name);
  assert!(
    release_binary.is_file(),
    "release binary missing at {}; run cargo build --release -p tnmsc first",
    release_binary.display()
  );
  run(
    Command::new(&release_binary)
      .args(["assemble-npm", "--profile", "release"])
      .env("TNMSC_NPM_PACKAGE_ROOT", &staged)
      .env("TNMSC_WORKSPACE_ROOT", &workspace_root)
      .current_dir(&workspace_root),
    "tnmsc assemble-npm",
  );

  let platform_tarball = pack(&platform_dir, &tarballs);
  let main_tarball = pack(&staged, &tarballs);
  run(
    Command::new(npm())
      .arg("install")
      .arg("--ignore-scripts")
      .arg("--prefix")
      .arg(&install_root)
      .arg(&main_tarball)
      .arg(&platform_tarball),
    "isolated npm install",
  );

  let shim = install_root
    .join("node_modules/.bin")
    .join(if cfg!(windows) { "tnmsc.cmd" } else { "tnmsc" });
  let help = run(Command::new(&shim).arg("help"), "installed tnmsc help");
  let stdout = String::from_utf8_lossy(&help.stdout);
  for subcommand in tnmsc_local_tests::EXPECTED_SUBCOMMANDS {
    assert!(
      stdout.contains(subcommand),
      "help should include {subcommand}: {stdout}"
    );
  }
}
