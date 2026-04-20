#![allow(dead_code)]

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::{Mutex, OnceLock};

static BINARY_BUILT: OnceLock<()> = OnceLock::new();
static PROJECT_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

pub const EXPECTED_SUBCOMMANDS: &[&str] = &["install", "dry-run", "clean", "version", "help"];

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

pub struct LocalTestRunner {
  binary: PathBuf,
  cwd: PathBuf,
  _lock_guard: std::sync::MutexGuard<'static, ()>,
}

impl LocalTestRunner {
  /// 默认在 ~/workspace/memory-sync/ 下运行测试。
  /// 若该目录不存在，则回退到当前目录。
  pub fn new() -> Self {
    ensure_binary();
    // 所有测试共享同一个真实项目目录，必须串行执行
    let guard = PROJECT_LOCK
      .get_or_init(|| Mutex::new(()))
      .lock()
      .expect("project lock should not be poisoned");
    let default_project = home_dir().join("workspace").join("memory-sync");
    let cwd = if default_project.is_dir() {
      default_project
    } else {
      std::env::current_dir().expect("should have current directory")
    };
    Self {
      binary: binary_path(),
      cwd,
      _lock_guard: guard,
    }
  }

  pub fn with_cwd(cwd: impl AsRef<Path>) -> Self {
    ensure_binary();
    let guard = PROJECT_LOCK
      .get_or_init(|| Mutex::new(()))
      .lock()
      .expect("project lock should not be poisoned");
    let cwd = cwd.as_ref().to_path_buf();
    assert!(
      cwd.is_dir(),
      "cwd does not exist or is not a directory: {}",
      cwd.display()
    );
    Self {
      binary: binary_path(),
      cwd,
      _lock_guard: guard,
    }
  }

  pub fn cwd(&self) -> &Path {
    &self.cwd
  }

  /// 解析 ~/.aindex/.tnmsc.json 中的 workspaceDir。
  /// 若未配置或解析失败，返回 None。
  pub fn resolve_workspace_dir(&self) -> Option<PathBuf> {
    let config_path = home_dir().join(".aindex").join(".tnmsc.json");
    if !config_path.is_file() {
      return None;
    }
    let raw = fs::read_to_string(&config_path).ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let ws_dir = parsed.get("workspaceDir")?.as_str()?;
    // 展开 ~/ 为 home_dir
    let expanded = if ws_dir.starts_with("~/") {
      home_dir().join(&ws_dir[2..])
    } else {
      PathBuf::from(ws_dir)
    };
    Some(expanded)
  }

  /// tnmsc 实际工作的目录（根据配置文件的 workspaceDir）。
  /// 若未配置，则回退到 cwd。
  pub fn effective_workspace(&self) -> PathBuf {
    self.resolve_workspace_dir().unwrap_or_else(|| self.cwd.clone())
  }

  pub fn run(&self, args: &[&str]) -> CommandResult {
    let mut cmd = Command::new(&self.binary);
    cmd.args(args).current_dir(&self.cwd);
    command_output(&mut cmd, &format!("tnmsc {}", args.join(" ")))
  }

  pub fn run_success(&self, args: &[&str]) -> CommandResult {
    let result = self.run(args);
    result.assert_success(&format!("tnmsc {}", args.join(" ")));
    result
  }

  pub fn assert_config_exists(&self) {
    let config_candidates = [
      self.cwd.join(".tnmsc.json"),
      home_dir().join(".aindex").join(".tnmsc.json"),
    ];
    let found = config_candidates.iter().any(|p| p.is_file());
    assert!(
      found,
      "no .tnmsc.json found in any of:\n{}",
      config_candidates
        .iter()
        .map(|p| format!("  - {}", p.display()))
        .collect::<Vec<_>>()
        .join("\n")
    );
  }

  pub fn assert_aindex_exists(&self) {
    let aindex_candidates = [
      self.cwd.join("aindex"),
      home_dir().join(".aindex"),
    ];
    let found = aindex_candidates.iter().any(|p| p.is_dir());
    assert!(
      found,
      "no aindex directory found in any of:\n{}",
      aindex_candidates
        .iter()
        .map(|p| format!("  - {}", p.display()))
        .collect::<Vec<_>>()
        .join("\n")
    );
  }

  pub fn assert_project_ready(&self) {
    self.assert_config_exists();
    self.assert_aindex_exists();
  }

  /// 在指定的真实项目目录下检查文件是否存在。
  /// 默认使用当前 cwd（~/workspace/memory-sync/）。
  pub fn file_exists(&self, relative: impl AsRef<Path>) -> bool {
    self.cwd.join(relative).is_file()
  }

  /// 在指定的真实项目目录下检查目录是否存在。
  pub fn dir_exists(&self, relative: impl AsRef<Path>) -> bool {
    self.cwd.join(relative).is_dir()
  }

  /// 在指定的真实项目目录下读取文件内容。
  pub fn read_file(&self, relative: impl AsRef<Path>) -> Option<String> {
    fs::read_to_string(self.cwd.join(relative)).ok()
  }

  /// 检查全局 ~/.claude/CLAUDE.md 是否存在。
  pub fn claude_global_file_exists(&self) -> bool {
    home_dir().join(".claude").join("CLAUDE.md").is_file()
  }

  /// 读取全局 ~/.claude/CLAUDE.md 内容。
  pub fn read_claude_global_file(&self) -> Option<String> {
    fs::read_to_string(home_dir().join(".claude").join("CLAUDE.md")).ok()
  }

  /// 检查项目级 CLAUDE.md 是否存在。
  pub fn claude_project_file_exists(&self) -> bool {
    self.cwd.join("CLAUDE.md").is_file()
  }

  /// 读取项目级 CLAUDE.md 内容。
  pub fn read_claude_project_file(&self) -> Option<String> {
    fs::read_to_string(self.cwd.join("CLAUDE.md")).ok()
  }

  /// 检查子目录 CLAUDE.md 是否存在。
  pub fn claude_child_file_exists(&self, relative: impl AsRef<Path>) -> bool {
    self.cwd.join(relative).join("CLAUDE.md").is_file()
  }

  /// 读取子目录 CLAUDE.md 内容。
  pub fn read_claude_child_file(&self, relative: impl AsRef<Path>) -> Option<String> {
    fs::read_to_string(self.cwd.join(relative).join("CLAUDE.md")).ok()
  }

  /// 检查全局 ~/.config/opencode/AGENTS.md 是否存在。
  pub fn opencode_global_file_exists(&self) -> bool {
    home_dir().join(".config").join("opencode").join("AGENTS.md").is_file()
  }

  /// 读取全局 ~/.config/opencode/AGENTS.md 内容。
  pub fn read_opencode_global_file(&self) -> Option<String> {
    fs::read_to_string(home_dir().join(".config").join("opencode").join("AGENTS.md")).ok()
  }

  /// 检查项目级 .opencode/ 目录是否存在。
  pub fn opencode_project_dir_exists(&self) -> bool {
    self.cwd.join(".opencode").is_dir()
  }

  /// 检查项目级 .opencode/AGENTS.md 是否存在。
  pub fn opencode_project_file_exists(&self) -> bool {
    self.cwd.join(".opencode").join("AGENTS.md").is_file()
  }

  /// 检查项目级 AGENTS.md 是否存在。
  pub fn agents_md_project_file_exists(&self) -> bool {
    self.cwd.join("AGENTS.md").is_file()
  }

  /// 读取项目级 AGENTS.md 内容。
  pub fn read_agents_md_project_file(&self) -> Option<String> {
    fs::read_to_string(self.cwd.join("AGENTS.md")).ok()
  }

  /// 检查子目录 AGENTS.md 是否存在。
  pub fn agents_md_child_file_exists(&self, relative: impl AsRef<Path>) -> bool {
    self.cwd.join(relative).join("AGENTS.md").is_file()
  }

  /// 读取子目录 AGENTS.md 内容。
  pub fn read_agents_md_child_file(&self, relative: impl AsRef<Path>) -> Option<String> {
    fs::read_to_string(self.cwd.join(relative).join("AGENTS.md")).ok()
  }

  /// 推断 aindex 目录路径。
  /// 优先从 ~/.aindex/.tnmsc.json 的 workspaceDir 推导 workspaceDir/aindex，
  /// 回退到 cwd/../aindex。
  pub fn resolve_aindex_dir(&self) -> Option<PathBuf> {
    let workspace_dir = self.resolve_workspace_dir()?;
    let aindex_from_config = workspace_dir.join("aindex");
    if aindex_from_config.is_dir() {
      return Some(aindex_from_config);
    }
    let fallback = self.cwd.parent().map(|p| p.join("aindex"));
    fallback.filter(|p| p.is_dir())
  }

  /// 读取 aindex 源文件内容（基于 resolve_aindex_dir）。
  pub fn read_aindex_file(&self, relative: impl AsRef<Path>) -> Option<String> {
    let aindex_dir = self.resolve_aindex_dir()?;
    fs::read_to_string(aindex_dir.join(relative)).ok()
  }

  pub fn clean(&self) -> CommandResult {
    self.run(&["clean"])
  }

  pub fn install(&self) -> CommandResult {
    self.run(&["install"])
  }

  pub fn dry_run(&self) -> CommandResult {
    self.run(&["dry-run"])
  }
}

pub fn ensure_binary() {
  let binary = binary_path();

  if binary.is_file() {
    eprintln!(
      "[tnmsc-local-tests] using existing binary: {}",
      binary.display()
    );
    return;
  }

  BINARY_BUILT.get_or_init(|| {
    eprintln!("[tnmsc-local-tests] binary not found at {}", binary.display());
    eprintln!("[tnmsc-local-tests] compiling debug binary: cargo build -p tnmsc");
    eprintln!("[tnmsc-local-tests] hint: run `cargo build -p tnmsc` beforehand to skip compilation");
    let start = std::time::Instant::now();
    let status = run_program_inherit(
      "cargo",
      &["build", "-p", "tnmsc"],
      &workspace_root(),
    );
    eprintln!(
      "[tnmsc-local-tests] debug binary compilation finished in {:.2}s",
      start.elapsed().as_secs_f64()
    );
    assert!(status, "cargo build -p tnmsc failed");
  });

  assert!(binary.is_file(), "missing binary at {}", binary.display());
}

pub fn binary_path() -> PathBuf {
  let binary_name = if cfg!(windows) { "tnmsc.exe" } else { "tnmsc" };
  workspace_root()
    .join("target")
    .join("debug")
    .join(binary_name)
}

pub fn workspace_root() -> PathBuf {
  PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .parent()
    .expect("local-test crate should live under cli/")
    .parent()
    .expect("cli crate should live under workspace root")
    .to_path_buf()
}

pub fn home_dir() -> PathBuf {
  dirs::home_dir().expect("should have home directory")
}

pub fn current_package_version() -> &'static str {
  env!("CARGO_PKG_VERSION")
}

fn run_program_inherit(program: &str, args: &[&str], cwd: &Path) -> bool {
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
