use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

struct TempDir(PathBuf);

impl TempDir {
  fn new() -> Self {
    let nonce = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("clock should be after the Unix epoch")
      .as_nanos();
    let path = std::env::temp_dir().join(format!("tnmsm-packaging-{}-{nonce}", std::process::id()));
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
    ("windows", "x86_64") => ("win32-x64-msvc", "tnmsm.exe"),
    ("linux", "x86_64") => ("linux-x64-gnu", "tnmsm"),
    ("linux", "aarch64") => ("linux-arm64-gnu", "tnmsm"),
    ("macos", "x86_64") => ("darwin-x64", "tnmsm"),
    ("macos", "aarch64") => ("darwin-arm64", "tnmsm"),
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
  let source_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
  let workspace_root = source_root.parent().expect("mcp should be under workspace");
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
    source_root.join("bin/tnmsm.js"),
    staged.join("bin/tnmsm.js"),
  );
  copy_file(
    source_root.join("npm").join(suffix).join("package.json"),
    platform_dir.join("package.json"),
  );

  let release_binary = workspace_root.join("target/release").join(binary_name);
  assert!(
    release_binary.is_file(),
    "release binary missing at {}; run cargo build --release -p tnmsm first",
    release_binary.display()
  );
  run(
    Command::new(&release_binary)
      .args(["assemble-npm", "--profile", "release"])
      .env("TNMSM_NPM_PACKAGE_ROOT", &staged)
      .env("TNMSM_WORKSPACE_ROOT", workspace_root)
      .current_dir(workspace_root),
    "tnmsm assemble-npm",
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
    .join(if cfg!(windows) { "tnmsm.cmd" } else { "tnmsm" });
  let mut child = Command::new(&shim)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .expect("installed tnmsm should start");
  child
    .stdin
    .take()
    .expect("tnmsm stdin should be piped")
    .write_all(b"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{}}\n")
    .expect("initialize request should be written");
  let output = child
    .wait_with_output()
    .expect("tnmsm should exit after EOF");
  assert!(
    output.status.success(),
    "installed tnmsm should initialize.\nstdout:\n{}\nstderr:\n{}",
    String::from_utf8_lossy(&output.stdout),
    String::from_utf8_lossy(&output.stderr)
  );
  let stdout = String::from_utf8_lossy(&output.stdout);
  for expected in [
    "\"jsonrpc\":\"2.0\"",
    "\"protocolVersion\":\"2024-11-05\"",
    "\"name\":\"@truenine/memory-sync-mcp\"",
  ] {
    assert!(
      stdout.contains(expected),
      "initialize output should include {expected}: {stdout}"
    );
  }
}
