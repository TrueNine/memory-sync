#![allow(dead_code)]

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

use testcontainers::core::{ExecCommand, WaitFor};
use testcontainers::runners::SyncRunner;
use testcontainers::{Container, GenericImage, ImageExt};

pub const DOCKER_IMAGE_NAME: &str = "node";
pub const DOCKER_IMAGE_TAG: &str = "22-trixie";
const EXIT_MARKER: &str = "__TNMSC_EXIT_CODE__=";

pub const EXPECTED_SUBCOMMANDS: &[&str] = &["install", "dry-run", "clean", "version", "help"];
pub const PACKAGED_PLATFORM_PACKAGE: &str = "@truenine/memory-sync-cli-linux-x64-gnu";

static RELEASE_BINARY_BUILT: OnceLock<()> = OnceLock::new();
static RELEASE_TEST_API_BINARY_BUILT: OnceLock<()> = OnceLock::new();

pub struct CommandResult {
  pub status: i32,
  pub stdout: String,
  pub stderr: String,
}

impl CommandResult {
  pub fn assert_success(&self, context: &str) {
    assert_eq!(
      self.status, 0,
      "{context} should succeed.\nexit: {}\nstdout:\n{}\nstderr:\n{}",
      self.status, self.stdout, self.stderr
    );
  }

  pub fn assert_failure(&self, context: &str) {
    assert_ne!(
      self.status, 0,
      "{context} should fail.\nstdout:\n{}\nstderr:\n{}",
      self.stdout, self.stderr
    );
  }
}

pub struct TestDir {
  path: PathBuf,
}

impl TestDir {
  pub fn new(prefix: &str) -> Self {
    let timestamp = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("system time should be after UNIX_EPOCH")
      .as_nanos();

    let base_dir = integration_tmp_root();
    fs::create_dir_all(&base_dir)
      .unwrap_or_else(|error| panic!("failed to create {}: {error}", base_dir.display()));

    let path = base_dir.join(format!("{prefix}-{}-{timestamp}", std::process::id()));
    fs::create_dir_all(&path).unwrap_or_else(|error| {
      panic!(
        "failed to create temp directory {}: {error}",
        path.display()
      )
    });

    Self { path }
  }

  pub fn path(&self) -> &Path {
    &self.path
  }
}

impl Drop for TestDir {
  fn drop(&mut self) {
    let _ = fs::remove_dir_all(&self.path);
  }
}

pub struct StagedPackageRoot {
  _temp_dir: TestDir,
  pub package_root: PathBuf,
  pub linux_binary: PathBuf,
  pub test_api_binary: PathBuf,
}

pub struct PackedArtifacts {
  _temp_dir: TestDir,
  pub cli_tarball: PathBuf,
  pub linux_tarball: PathBuf,
  pub test_api_binary: PathBuf,
}

pub struct TestContainer {
  container: Container<GenericImage>,
}

impl Drop for TestContainer {
  fn drop(&mut self) {
    let id = self.container.id();
    eprintln!("stopping and removing testcontainer: {id}");
    let _ = self.container.stop();
  }
}

impl TestContainer {
  pub fn start(artifacts: &PackedArtifacts) -> Self {
    assert!(
      artifacts.cli_tarball.is_file(),
      "CLI tarball does not exist: {}",
      artifacts.cli_tarball.display()
    );
    assert!(
      artifacts.linux_tarball.is_file(),
      "Linux tarball does not exist: {}",
      artifacts.linux_tarball.display()
    );
    assert!(
      artifacts.test_api_binary.is_file(),
      "Test API binary does not exist: {}",
      artifacts.test_api_binary.display()
    );

    let image = GenericImage::new(DOCKER_IMAGE_NAME, DOCKER_IMAGE_TAG)
      .with_wait_for(WaitFor::seconds(1))
      .with_cmd(vec![
        "sh".to_string(),
        "-lc".to_string(),
        "while true; do sleep 3600; done".to_string(),
      ])
      .with_copy_to("/artifacts/cli.tgz", artifacts.cli_tarball.as_path())
      .with_copy_to(
        "/artifacts/linux-x64-gnu.tgz",
        artifacts.linux_tarball.as_path(),
      )
      .with_copy_to(
        "/test-bin/tnmsc-test-api",
        artifacts.test_api_binary.as_path(),
      );

    eprintln!("[tnmsc-integrate-tests] starting testcontainer ({DOCKER_IMAGE_NAME}:{DOCKER_IMAGE_TAG})...");
    let start = std::time::Instant::now();
    let container = image
      .start()
      .unwrap_or_else(|error| panic!("failed to start testcontainer: {error}"));
    eprintln!(
      "[tnmsc-integrate-tests] testcontainer started in {:.2}s",
      start.elapsed().as_secs_f64()
    );

    Self { container }
  }

  pub fn exec_with_retries_and_timeout(
    &self,
    command: &str,
    max_attempts: u32,
    delay_ms: u64,
    timeout_secs: u64,
  ) -> CommandResult {
    let mut last_result: Option<CommandResult> = None;
    for attempt in 1..=max_attempts {
      let result = self.exec_with_timeout(command, timeout_secs);
      if result.status == 0 {
        return result;
      }
      last_result = Some(result);
      if attempt < max_attempts {
        std::thread::sleep(std::time::Duration::from_millis(delay_ms));
      }
    }
    last_result.expect("should have at least one attempt")
  }

  pub fn exec_with_timeout(&self, command: &str, timeout_secs: u64) -> CommandResult {
    let script = shell_script(command);
    let mut exec_result = self
      .container
      .exec(ExecCommand::new(vec!["sh", "-lc", &script]))
      .unwrap_or_else(|error| panic!("failed to exec in testcontainer: {error}"));

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs);
    loop {
      if std::time::Instant::now() > deadline {
        panic!("command timed out after {timeout_secs}s: {command}");
      }

      if let Ok(Some(_code)) = exec_result.exit_code() {
        break;
      }

      std::thread::sleep(std::time::Duration::from_millis(100));
    }

    let fallback_status = exec_result.exit_code().ok().flatten().unwrap_or(0) as i32;
    let stdout = exec_result
      .stdout_to_vec()
      .unwrap_or_else(|error| panic!("failed to read exec stdout: {error}"));
    let stderr = exec_result
      .stderr_to_vec()
      .unwrap_or_else(|error| panic!("failed to read exec stderr: {error}"));
    let stderr = String::from_utf8_lossy(&stderr).into_owned();
    let (status, stderr) = extract_exit_code(&stderr).unwrap_or((fallback_status, stderr));

    CommandResult {
      status,
      stdout: String::from_utf8_lossy(&stdout).into_owned(),
      stderr,
    }
  }

  pub fn exec_with_retries(
    &self,
    command: &str,
    max_attempts: u32,
    delay_ms: u64,
  ) -> CommandResult {
    let mut last_result: Option<CommandResult> = None;
    for attempt in 1..=max_attempts {
      let result = self.exec(command);
      if result.status == 0 {
        return result;
      }
      last_result = Some(result);
      if attempt < max_attempts {
        std::thread::sleep(std::time::Duration::from_millis(delay_ms));
      }
    }
    last_result.expect("should have at least one attempt")
  }

  pub fn exec(&self, command: &str) -> CommandResult {
    let script = shell_script(command);
    let mut exec_result = self
      .container
      .exec(ExecCommand::new(vec!["sh", "-lc", &script]))
      .unwrap_or_else(|error| panic!("failed to exec in testcontainer: {error}"));

    let fallback_status = exec_result
      .exit_code()
      .unwrap_or_else(|error| panic!("failed to read exec exit code: {error}"))
      .unwrap_or(0) as i32;
    let stdout = exec_result
      .stdout_to_vec()
      .unwrap_or_else(|error| panic!("failed to read exec stdout: {error}"));
    let stderr = exec_result
      .stderr_to_vec()
      .unwrap_or_else(|error| panic!("failed to read exec stderr: {error}"));
    let stderr = String::from_utf8_lossy(&stderr).into_owned();
    let (status, stderr) = extract_exit_code(&stderr).unwrap_or((fallback_status, stderr));

    CommandResult {
      status,
      stdout: String::from_utf8_lossy(&stdout).into_owned(),
      stderr,
    }
  }

  pub fn exec_success(&self, command: &str) -> CommandResult {
    let result = self.exec(command);
    result.assert_success(&format!("testcontainer exec `{command}`"));
    result
  }

  pub fn exec_tnmsc(&self, args: &[&str]) -> CommandResult {
    self.exec(&tnmsc_command(args))
  }

  pub fn exec_tnmsc_success(&self, args: &[&str]) -> CommandResult {
    let command = tnmsc_command(args);
    let result = self.exec(&command);
    result.assert_success(&command);
    result
  }

  pub fn cat(&self, path: &str) -> CommandResult {
    self.exec(&format!("cat {}", quote_shell(path)))
  }

  pub fn cat_success(&self, path: &str) -> CommandResult {
    let result = self.cat(path);
    result.assert_success(&format!("read {path}"));
    result
  }

  pub fn setup(&self) -> ContainerSetup<'_> {
    ContainerSetup::new(self)
  }
}

pub struct ContainerSetup<'a> {
  container: &'a TestContainer,
  lines: Vec<String>,
  heredoc_index: usize,
}

impl<'a> ContainerSetup<'a> {
  fn new(container: &'a TestContainer) -> Self {
    Self {
      container,
      lines: Vec::new(),
      heredoc_index: 0,
    }
  }

  pub fn mkdir_p(mut self, path: &str) -> Self {
    self.lines.push(format!("mkdir -p {}", quote_shell(path)));
    self
  }

  pub fn write_file(mut self, path: &str, content: &str) -> Self {
    let delimiter = format!("__TNMSC_{}__", self.heredoc_index);
    self.heredoc_index += 1;
    self.lines.push(format!(
      "cat <<'{delimiter}' > {path}\n{content}\n{delimiter}"
    ));
    self
  }

  pub fn rm_rf(mut self, path: &str) -> Self {
    self.lines.push(format!("rm -rf {}", quote_shell(path)));
    self
  }

  pub fn exec(self, context: &str) -> CommandResult {
    let script = self.lines.join("\n");
    let result = self.container.exec(&script);
    result.assert_success(context);
    result
  }
}

pub fn integration_tests_dir() -> PathBuf {
  PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

pub fn cli_manifest_dir() -> PathBuf {
  integration_tests_dir()
    .parent()
    .expect("integration test crate should live under cli/")
    .to_path_buf()
}

pub fn workspace_root() -> PathBuf {
  cli_manifest_dir()
    .parent()
    .expect("cli crate should live under the workspace root")
    .to_path_buf()
}

pub fn integration_tmp_root() -> PathBuf {
  integration_tests_dir().join(".tmp")
}

pub fn run_tnmsc(args: &[&str], cwd: &Path) -> CommandResult {
  run_tnmsc_with_env(args, cwd, &[])
}

pub fn run_tnmsc_with_env(args: &[&str], cwd: &Path, envs: &[(&str, &str)]) -> CommandResult {
  let mut command = Command::new("cargo");
  command
    .args(["run", "-p", "tnmsc", "--bin", "tnmsc", "--"])
    .args(args)
    .current_dir(cwd);
  for (key, value) in envs {
    command.env(key, value);
  }

  command_output(&mut command, "cargo run -p tnmsc --bin tnmsc")
}

pub fn run_program_inherit(program: &str, args: &[&str], cwd: &Path) -> bool {
  let mut command;
  #[cfg(unix)]
  {
    command = Command::new("sh");
    command.args(["-c", &format!("{} {}", program, args.join(" "))]);
    command.env_clear();
    if let Ok(path) = std::env::var("PATH") {
      command.env("PATH", path);
    }
    if let Ok(home) = std::env::var("HOME") {
      command.env("HOME", home);
    }
  }
  #[cfg(windows)]
  {
    command = Command::new("cmd");
    command.args(["/C", &format!("{} {}", program, args.join(" "))]);
  }
  command.current_dir(cwd);
  command.stdin(std::process::Stdio::null());
  command.stdout(std::process::Stdio::inherit());
  command.stderr(std::process::Stdio::inherit());

  match command.status() {
    Ok(status) => status.success(),
    Err(error) => {
      eprintln!("failed to run {program}: {error}");
      false
    }
  }
}

pub fn run_program(program: &str, args: &[&str], cwd: &Path) -> CommandResult {
  let mut command;
  #[cfg(unix)]
  {
    command = Command::new("sh");
    command.args(["-c", &format!("{} {}", program, args.join(" "))]);
    command.env_clear();
    if let Ok(path) = std::env::var("PATH") {
      command.env("PATH", path);
    }
    if let Ok(home) = std::env::var("HOME") {
      command.env("HOME", home);
    }
  }
  #[cfg(windows)]
  {
    command = Command::new("cmd");
    command.args(["/C", &format!("{} {}", program, args.join(" "))]);
  }
  command.current_dir(cwd);

  command_output(&mut command, program)
}

pub fn current_package_version() -> &'static str {
  env!("CARGO_PKG_VERSION")
}

pub fn ensure_release_binary() {
  RELEASE_BINARY_BUILT.get_or_init(|| {
    eprintln!("[tnmsc-integrate-tests] compiling debug binary (cargo build -p tnmsc)...");
    let start = std::time::Instant::now();
    let status = run_program_inherit(
      "cargo",
      &["build", "-p", "tnmsc"],
      &workspace_root(),
    );
    eprintln!(
      "[tnmsc-integrate-tests] debug binary compilation finished in {:.2}s",
      start.elapsed().as_secs_f64()
    );
    assert!(status, "cargo build -p tnmsc failed");
  });

  let binary = release_binary_path();
  assert!(
    binary.is_file(),
    "missing binary at {}",
    binary.display()
  );
}

pub fn ensure_release_test_api_binary() {
  RELEASE_TEST_API_BINARY_BUILT.get_or_init(|| {
    eprintln!("[tnmsc-integrate-tests] compiling test-api debug binary (cargo build -p tnmsc --bin tnmsc-test-api)...");
    let start = std::time::Instant::now();
    let status = run_program_inherit(
      "cargo",
      &[
        "build",
        "-p",
        "tnmsc",
        "--bin",
        "tnmsc-test-api",
      ],
      &workspace_root(),
    );
    eprintln!(
      "[tnmsc-integrate-tests] test-api debug binary compilation finished in {:.2}s",
      start.elapsed().as_secs_f64()
    );
    assert!(status, "cargo build -p tnmsc --bin tnmsc-test-api failed");
  });

  let binary = release_test_api_binary_path();
  assert!(
    binary.is_file(),
    "missing test API binary at {}",
    binary.display()
  );
}

pub fn release_binary_path() -> PathBuf {
  let binary_name = if cfg!(windows) { "tnmsc.exe" } else { "tnmsc" };
  workspace_root()
    .join("target")
    .join("debug")
    .join(binary_name)
}

pub fn release_test_api_binary_path() -> PathBuf {
  let binary_name = if cfg!(windows) {
    "tnmsc-test-api.exe"
  } else {
    "tnmsc-test-api"
  };
  workspace_root()
    .join("target")
    .join("debug")
    .join(binary_name)
}

fn cached_linux_binary_path() -> PathBuf {
  workspace_root()
    .join("target")
    .join("debug")
    .join("tnmsc-linux-x64-gnu")
}

pub fn create_staged_package_root() -> StagedPackageRoot {
  let cli_dir = cli_manifest_dir();
  assert!(
    cli_dir.exists(),
    "CLI manifest directory does not exist: {}",
    cli_dir.display()
  );
  assert!(
    cli_dir.join("package.json").is_file(),
    "CLI package.json not found at {}",
    cli_dir.join("package.json").display()
  );

  let temp_dir = TestDir::new("tnmsc-packaging");
  let package_root = temp_dir.path().join("cli");

  copy_file(
    &cli_manifest_dir().join("package.json"),
    &package_root.join("package.json"),
  );
  copy_dir_all(
    &cli_manifest_dir().join("schema"),
    &package_root.join("schema"),
  );
  copy_file(
    &cli_manifest_dir()
      .join("npm")
      .join("linux-x64-gnu")
      .join("package.json"),
    &package_root
      .join("npm")
      .join("linux-x64-gnu")
      .join("package.json"),
  );

  rewrite_main_package_json(&package_root.join("package.json"));

  let linux_binary = package_root
    .join("npm")
    .join("linux-x64-gnu")
    .join("bin")
    .join("tnmsc");
  let test_api_binary = release_test_api_binary_path();

  StagedPackageRoot {
    _temp_dir: temp_dir,
    package_root,
    linux_binary,
    test_api_binary,
  }
}

pub fn pack_cli_artifacts() -> Option<PackedArtifacts> {
  eprintln!("[tnmsc-integrate-tests] packing CLI artifacts...");
  let total_start = std::time::Instant::now();

  ensure_release_binary();
  ensure_release_test_api_binary();

  let temp_dir = TestDir::new("tnmsc-packed-artifacts");
  let staged = create_staged_package_root();
  let package_root = staged.package_root.to_string_lossy().into_owned();
  let workspace_root_dir = workspace_root().to_string_lossy().into_owned();

  eprintln!("[tnmsc-integrate-tests] running assemble-npm...");
  let assemble = run_tnmsc_with_env(
    &["assemble-npm"],
    &workspace_root(),
    &[
      ("TNMSC_NPM_PACKAGE_ROOT", package_root.as_str()),
      ("TNMSC_WORKSPACE_ROOT", workspace_root_dir.as_str()),
    ],
  );
  assemble.assert_success("tnmsc assemble-npm for staged package root");

  if !staged.linux_binary.is_file() {
    let cached = cached_linux_binary_path();
    if cached.is_file() {
      eprintln!(
        "[tnmsc-integrate-tests] using cached linux-x64-gnu binary from {}",
        cached.display(),
      );
      fs::copy(&cached, &staged.linux_binary).unwrap_or_else(|error| {
        panic!(
          "failed to copy cached linux binary from {} to {}: {error}",
          cached.display(),
          staged.linux_binary.display()
        )
      });
    } else {
      eprintln!(
        "[tnmsc-integrate-tests] linux-x64-gnu binary not found at {} — attempting cross-compilation with cargo-zigbuild...",
        staged.linux_binary.display(),
      );
      let cross_start = std::time::Instant::now();

      let cross_ok = run_program_inherit(
        "cargo",
        &["zigbuild", "--target", "x86_64-unknown-linux-gnu", "-p", "tnmsc"],
        &workspace_root(),
      );

      if !cross_ok {
        panic!(
          "cross-compilation to x86_64-unknown-linux-gnu failed. \
           ensure zig is installed (e.g., scoop install zig) and cargo-zigbuild is installed (cargo install cargo-zigbuild)."
        );
      }
      eprintln!(
        "[tnmsc-integrate-tests] cross-compilation finished in {:.2}s",
        cross_start.elapsed().as_secs_f64()
      );

      let assemble_cross = run_tnmsc_with_env(
        &["assemble-npm"],
        &workspace_root(),
        &[
          ("TNMSC_NPM_PACKAGE_ROOT", package_root.as_str()),
          ("TNMSC_WORKSPACE_ROOT", workspace_root_dir.as_str()),
        ],
      );
      assemble_cross.assert_success("tnmsc assemble-npm after cross-compilation");

      assert!(
        staged.linux_binary.is_file(),
        "linux-x64-gnu binary still missing after cross-compilation at {}",
        staged.linux_binary.display()
      );

      // Persist cross-compiled binary for future test runs
      if let Err(error) = fs::copy(&staged.linux_binary, &cached) {
        eprintln!(
          "[tnmsc-integrate-tests] warning: failed to cache linux binary to {}: {error}",
          cached.display()
        );
      }
    }
  }

  let cli_tarball = pack_package(&staged.package_root, temp_dir.path(), "cli");
  let linux_tarball = pack_package(
    &staged.package_root.join("npm").join("linux-x64-gnu"),
    temp_dir.path(),
    "linux-x64-gnu",
  );

  eprintln!(
    "[tnmsc-integrate-tests] artifact packing finished in {:.2}s",
    total_start.elapsed().as_secs_f64()
  );

  Some(PackedArtifacts {
    _temp_dir: temp_dir,
    cli_tarball,
    linux_tarball,
    test_api_binary: staged.test_api_binary,
  })
}

pub fn install_packaged_cli_container() -> Option<TestContainer> {
  let artifacts = pack_cli_artifacts()?;
  let container = TestContainer::start(&artifacts);
  let install_command = format!(
    "npm install -g {} {}",
    quote_shell("/artifacts/cli.tgz"),
    quote_shell("/artifacts/linux-x64-gnu.tgz")
  );
  let result = container.exec_with_retries_and_timeout(&install_command, 3, 2000, 120);
  result.assert_success(&format!(
    "install tnmsc globally (attempted up to 3 times): {}",
    install_command
  ));
  Some(container)
}

pub fn tnmsc_command(args: &[&str]) -> String {
  let mut command = String::from("tnmsc");
  for arg in args {
    command.push(' ');
    command.push_str(&quote_shell(arg));
  }
  command
}

pub fn quote_shell(value: &str) -> String {
  format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn npm_tarball_name(pkg_name: &str) -> String {
  pkg_name
    .strip_prefix('@')
    .unwrap_or(pkg_name)
    .replace('/', "-")
}

fn pack_package(package_dir: &Path, target_root: &Path, name: &str) -> PathBuf {
  assert!(
    package_dir.exists(),
    "package directory does not exist: {}",
    package_dir.display()
  );

  let pack_destination = target_root.join(name);
  fs::create_dir_all(&pack_destination).unwrap_or_else(|error| {
    panic!(
      "failed to create pack destination {}: {error}",
      pack_destination.display()
    )
  });

  let package_json_path = package_dir.join("package.json");
  let raw = fs::read_to_string(&package_json_path)
    .unwrap_or_else(|error| panic!("failed to read {}: {error}", package_json_path.display()));
  let parsed: serde_json::Value = serde_json::from_str(&raw)
    .unwrap_or_else(|error| panic!("failed to parse {}: {error}", package_json_path.display()));
  let pkg_name = parsed.get("name").and_then(|v| v.as_str()).unwrap_or(name);
  let pkg_version = parsed
    .get("version")
    .and_then(|v| v.as_str())
    .unwrap_or("0.0.0");
  let tarball_name = format!("{}-{}.tgz", npm_tarball_name(pkg_name), pkg_version);
  let tarball_path = pack_destination.join(&tarball_name);

  let gz_file = fs::File::create(&tarball_path)
    .unwrap_or_else(|error| panic!("failed to create {}: {error}", tarball_path.display()));
  let gz_encoder = flate2::GzBuilder::new().write(gz_file, flate2::Compression::default());
  let mut tar_builder = tar::Builder::new(gz_encoder);

  tar_builder
    .append_dir_all("package", package_dir)
    .unwrap_or_else(|error| {
      panic!(
        "failed to append {} to tarball: {error}",
        package_dir.display()
      )
    });

  let gz_encoder = tar_builder
    .into_inner()
    .unwrap_or_else(|error| panic!("failed to finalize tarball: {error}"));
  gz_encoder
    .finish()
    .unwrap_or_else(|error| panic!("failed to finalize gzip: {error}"));

  assert!(
    tarball_path.is_file(),
    "expected tarball at {}",
    tarball_path.display()
  );

  tarball_path
}

fn rewrite_main_package_json(path: &Path) {
  let raw = fs::read_to_string(path)
    .unwrap_or_else(|error| panic!("failed to read {}: {error}", path.display()));
  let mut parsed: serde_json::Value = serde_json::from_str(&raw)
    .unwrap_or_else(|error| panic!("failed to parse {}: {error}", path.display()));

  let object = parsed.as_object_mut().unwrap_or_else(|| {
    panic!(
      "expected top-level package.json object at {}",
      path.display()
    )
  });
  object.insert(
    "optionalDependencies".to_string(),
    serde_json::Value::Object(
      [(
        PACKAGED_PLATFORM_PACKAGE.to_string(),
        serde_json::Value::String(current_package_version().to_string()),
      )]
      .into_iter()
      .collect(),
    ),
  );

  fs::write(
    path,
    serde_json::to_string_pretty(&parsed)
      .unwrap_or_else(|error| panic!("failed to serialize {}: {error}", path.display())),
  )
  .unwrap_or_else(|error| panic!("failed to write {}: {error}", path.display()));
}

fn copy_dir_all(source: &Path, destination: &Path) {
  fs::create_dir_all(destination)
    .unwrap_or_else(|error| panic!("failed to create {}: {error}", destination.display()));

  for entry in fs::read_dir(source)
    .unwrap_or_else(|error| panic!("failed to read {}: {error}", source.display()))
  {
    let entry =
      entry.unwrap_or_else(|error| panic!("failed to read entry in {}: {error}", source.display()));
    let file_type = entry.file_type().unwrap_or_else(|error| {
      panic!(
        "failed to read file type for {}: {error}",
        entry.path().display()
      )
    });
    let destination_path = destination.join(entry.file_name());

    if file_type.is_dir() {
      copy_dir_all(&entry.path(), &destination_path);
    } else {
      copy_file(&entry.path(), &destination_path);
    }
  }
}

fn copy_file(source: &Path, destination: &Path) {
  if let Some(parent) = destination.parent() {
    fs::create_dir_all(parent)
      .unwrap_or_else(|error| panic!("failed to create {}: {error}", parent.display()));
  }

  fs::copy(source, destination).unwrap_or_else(|error| {
    panic!(
      "failed to copy {} to {}: {error}",
      source.display(),
      destination.display()
    )
  });
}

fn command_output(command: &mut Command, label: &str) -> CommandResult {
  match command.output() {
    Ok(output) => decode_output(output),
    Err(error) => CommandResult {
      status: 1,
      stdout: String::new(),
      stderr: format!("failed to run {label}: {error}"),
    },
  }
}

fn decode_output(output: Output) -> CommandResult {
  CommandResult {
    status: output.status.code().unwrap_or(1),
    stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
    stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
  }
}

fn shell_script(command: &str) -> String {
  [
    "set +e",
    "export HOME=/root",
    "export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "mkdir -p /artifacts",
    "cd /",
    command,
    "status=$?",
    &format!("printf '{}%s\\n' \"$status\" >&2", EXIT_MARKER),
    "exit 0",
  ]
  .join("\n")
}

fn extract_exit_code(stderr: &str) -> Option<(i32, String)> {
  let mut lines = stderr.lines().map(str::to_string).collect::<Vec<_>>();
  let marker_index = lines
    .iter()
    .rposition(|line| line.starts_with(EXIT_MARKER))?;
  let marker = lines.remove(marker_index);
  let exit_code = marker[EXIT_MARKER.len()..].parse::<i32>().ok()?;
  let cleaned = if lines.is_empty() {
    String::new()
  } else {
    let mut joined = lines.join("\n");
    joined.push('\n');
    joined
  };

  Some((exit_code, cleaned))
}
