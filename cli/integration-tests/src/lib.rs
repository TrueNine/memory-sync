#![allow(dead_code)]

use std::ffi::OsStr;
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

pub const EXPECTED_SUBCOMMANDS: &[&str] =
  &["install", "dry-run", "clean", "plugins", "version", "help"];

pub const PACKAGED_PLUGINS: &[&str] = &[
  "CodexCLIOutputAdaptor",
  "ClaudeCodeCLIOutputAdaptor",
  "TraeOutputAdaptor",
  "OpencodeCLIOutputAdaptor",
];

pub struct CommandTestCase<'a> {
  pub args: &'a [&'a str],
  pub command_name: &'a str,
  pub display: &'a str,
}

pub const NOT_IMPLEMENTED_CASES: &[CommandTestCase] = &[
  CommandTestCase {
    args: &["dry-run"],
    command_name: "dry-run",
    display: "tnmsc dry-run",
  },
  CommandTestCase {
    args: &["clean"],
    command_name: "clean",
    display: "tnmsc clean",
  },
  CommandTestCase {
    args: &["clean", "--dry-run"],
    command_name: "clean",
    display: "tnmsc clean --dry-run",
  },
];

static PNPM_VERSION: OnceLock<String> = OnceLock::new();
static RELEASE_BINARY_BUILT: OnceLock<()> = OnceLock::new();
static REAL_ENV_SKIP_REASON: OnceLock<Option<String>> = OnceLock::new();

pub struct CommandResult {
  pub status: i32,
  pub stdout: String,
  pub stderr: String,
}

impl CommandResult {
  pub fn assert_success(&self, context: &str) {
    assert!(
      self.status == 0,
      "{context} should succeed.\nexit: {}\nstdout:\n{}\nstderr:\n{}",
      self.status,
      self.stdout,
      self.stderr
    );
  }

  pub fn assert_failure(&self, context: &str) {
    assert!(
      self.status != 0,
      "{context} should fail.\nstdout:\n{}\nstderr:\n{}",
      self.stdout,
      self.stderr
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
}

pub struct PackedArtifacts {
  _temp_dir: TestDir,
  pub cli_tarball: PathBuf,
  pub linux_tarball: PathBuf,
}

pub struct TestContainer {
  container: Container<GenericImage>,
}

impl TestContainer {
  pub fn start(artifacts: &PackedArtifacts) -> Self {
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
      );

    let container = image
      .start()
      .unwrap_or_else(|error| panic!("failed to start testcontainer: {error}"));

    Self { container }
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

pub fn run_program(program: &str, args: &[&str], cwd: &Path) -> CommandResult {
  let mut command = Command::new(program);
  command.args(args).current_dir(cwd);

  command_output(&mut command, program)
}

pub fn current_package_version() -> &'static str {
  env!("CARGO_PKG_VERSION")
}

pub fn not_implemented_message(command: &str) -> String {
  format!(
    "Error: Execution not yet fully implemented in Rust: Pure Rust `{command}` is not implemented yet. The CLI npm package no longer ships the legacy TypeScript fallback bridge."
  )
}

pub fn is_linux_x64_host() -> bool {
  std::env::consts::OS == "linux" && std::env::consts::ARCH == "x86_64"
}

pub fn real_env_test_skip_reason() -> Option<String> {
  REAL_ENV_SKIP_REASON
    .get_or_init(compute_real_env_skip_reason)
    .clone()
}

pub fn pnpm_version() -> &'static str {
  PNPM_VERSION.get_or_init(|| {
    let package_json_path = workspace_root().join("package.json");
    let raw = fs::read_to_string(&package_json_path)
      .unwrap_or_else(|error| panic!("failed to read {}: {error}", package_json_path.display()));
    let parsed: serde_json::Value = serde_json::from_str(&raw)
      .unwrap_or_else(|error| panic!("failed to parse {}: {error}", package_json_path.display()));
    let package_manager = parsed
      .get("packageManager")
      .and_then(|value| value.as_str())
      .unwrap_or("pnpm@latest");

    package_manager
      .rsplit_once('@')
      .map(|(_, version)| version.to_string())
      .unwrap_or_else(|| "latest".to_string())
  })
}

pub fn ensure_release_binary() {
  RELEASE_BINARY_BUILT.get_or_init(|| {
    let result = run_program(
      "cargo",
      &["build", "--release", "-p", "tnmsc"],
      &workspace_root(),
    );
    result.assert_success("cargo build --release -p tnmsc");
  });

  let binary = release_binary_path();
  assert!(
    binary.is_file(),
    "missing release binary at {}",
    binary.display()
  );
}

pub fn release_binary_path() -> PathBuf {
  let binary_name = if cfg!(windows) { "tnmsc.exe" } else { "tnmsc" };
  workspace_root()
    .join("target")
    .join("release")
    .join(binary_name)
}

pub fn create_staged_package_root() -> StagedPackageRoot {
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

  StagedPackageRoot {
    _temp_dir: temp_dir,
    package_root,
    linux_binary,
  }
}

pub fn pack_cli_artifacts() -> PackedArtifacts {
  ensure_release_binary();

  let temp_dir = TestDir::new("tnmsc-packed-artifacts");
  let staged = create_staged_package_root();
  let package_root = staged.package_root.to_string_lossy().into_owned();
  let workspace_root_dir = workspace_root().to_string_lossy().into_owned();

  let assemble = run_tnmsc_with_env(
    &["assemble-npm", "--profile", "release"],
    &workspace_root(),
    &[
      ("TNMSC_NPM_PACKAGE_ROOT", package_root.as_str()),
      ("TNMSC_WORKSPACE_ROOT", workspace_root_dir.as_str()),
    ],
  );
  assemble.assert_success("tnmsc assemble-npm for staged package root");

  let cli_tarball = pack_package(&staged.package_root, temp_dir.path(), "cli");
  let linux_tarball = pack_package(
    &staged.package_root.join("npm").join("linux-x64-gnu"),
    temp_dir.path(),
    "linux-x64-gnu",
  );

  PackedArtifacts {
    _temp_dir: temp_dir,
    cli_tarball,
    linux_tarball,
  }
}

pub fn install_packaged_cli_container() -> TestContainer {
  let artifacts = pack_cli_artifacts();
  let container = TestContainer::start(&artifacts);
  let install_command = format!(
    "corepack enable && corepack prepare pnpm@{} --activate && pnpm add -g {} {}",
    quote_shell(pnpm_version()),
    quote_shell("/artifacts/cli.tgz"),
    quote_shell("/artifacts/linux-x64-gnu.tgz")
  );
  container.exec_success(&install_command);
  container
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

fn compute_real_env_skip_reason() -> Option<String> {
  if !is_linux_x64_host() {
    return Some("unsupported host platform; real-env tests only run on linux x86_64".to_string());
  }

  let result = run_program(
    "docker",
    &["info", "--format", "{{.ServerVersion}}"],
    &workspace_root(),
  );
  if result.status == 0 {
    return None;
  }

  let detail = trim_output(&result.stderr)
    .or_else(|| trim_output(&result.stdout))
    .unwrap_or_else(|| "docker daemon is unavailable".to_string());
  Some(format!("docker unavailable: {detail}"))
}

fn pack_package(package_dir: &Path, target_root: &Path, name: &str) -> PathBuf {
  let pack_destination = target_root.join(name);
  fs::create_dir_all(&pack_destination).unwrap_or_else(|error| {
    panic!(
      "failed to create pack destination {}: {error}",
      pack_destination.display()
    )
  });

  let package_dir = package_dir.to_string_lossy().into_owned();
  let pack_destination = pack_destination.to_string_lossy().into_owned();
  let result = run_program(
    "pnpm",
    &[
      "-C",
      &package_dir,
      "pack",
      "--pack-destination",
      &pack_destination,
    ],
    &workspace_root(),
  );
  result.assert_success(&format!("pnpm pack for {}", package_dir));

  let mut tarballs = fs::read_dir(&pack_destination)
    .unwrap_or_else(|error| panic!("failed to read {}: {error}", pack_destination))
    .filter_map(|entry| entry.ok())
    .map(|entry| entry.path())
    .filter(|path| path.extension().and_then(OsStr::to_str) == Some("tgz"))
    .collect::<Vec<_>>();

  tarballs.sort();
  assert!(
    tarballs.len() == 1,
    "expected exactly one tarball in {}, found {}",
    pack_destination,
    tarballs.len()
  );

  tarballs.remove(0)
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
    serde_json::json!({
      "@truenine/memory-sync-cli-linux-x64-gnu": current_package_version()
    }),
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
  let output = command
    .output()
    .unwrap_or_else(|error| panic!("failed to run {label}: {error}"));
  decode_output(output)
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
    &format!("export HOME={}", quote_shell("/root")),
    "export PNPM_HOME=/pnpm",
    "export PATH=\"$PNPM_HOME:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\"",
    "mkdir -p \"$PNPM_HOME\" /artifacts",
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

fn trim_output(output: &str) -> Option<String> {
  let trimmed = output.trim();
  (!trimmed.is_empty()).then(|| trimmed.to_string())
}
