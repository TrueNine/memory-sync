//! Node.js process spawning for plugin runtime commands.
//!
//! Locates the bundled JS entry point and spawns `node` to execute
//! plugin-dependent commands (execute, dry-run, clean, plugins).

use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode, Stdio};
use std::sync::{Mutex, OnceLock};

use crate::{
    BridgeCommandResult, CliError,
    diagnostic_helpers::{diagnostic, line, optional_details},
};

use serde_json::Value;
use tnmsc_logger::create_logger;

/// Strip Windows extended-length path prefix (`\\?\`) which Node.js cannot handle.
fn strip_win_prefix(path: PathBuf) -> PathBuf {
    let s = path.to_string_lossy();
    if let Some(stripped) = s.strip_prefix(r"\\?\") {
        PathBuf::from(stripped)
    } else {
        path
    }
}

const PACKAGE_NAME: &str = "@truenine/memory-sync-cli";
static PLUGIN_RUNTIME_CACHE: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();
static NODE_CACHE: OnceLock<Mutex<Option<String>>> = OnceLock::new();

fn read_cached_success<T: Clone>(cache: &Mutex<Option<T>>) -> Option<T> {
    match cache.lock() {
        Ok(guard) => guard.clone(),
        Err(poisoned) => poisoned.into_inner().clone(),
    }
}

fn store_cached_success<T: Clone>(cache: &Mutex<Option<T>>, value: &T) {
    match cache.lock() {
        Ok(mut guard) => {
            *guard = Some(value.clone());
        }
        Err(poisoned) => {
            *poisoned.into_inner() = Some(value.clone());
        }
    }
}

fn detect_with_cached_success<T: Clone, F>(cache: &Mutex<Option<T>>, detect: F) -> Option<T>
where
    F: FnOnce() -> Option<T>,
{
    if let Some(cached) = read_cached_success(cache) {
        return Some(cached);
    }

    let detected = detect();
    if let Some(value) = detected.as_ref() {
        store_cached_success(cache, value);
    }
    detected
}

/// Locate the plugin runtime JS entry point.
///
/// Search order:
/// 1. `<binary_dir>/plugin-runtime.mjs` (release archive: binary + JS co-located)
/// 2. `<binary_dir>/../dist/plugin-runtime.mjs` (dev mode: cli/dist/)
/// 3. `<binary_dir>/../cli/dist/plugin-runtime.mjs` (repo-root fallback)
/// 4. `<cwd>/dist/plugin-runtime.mjs` (fallback)
/// 5. `<cwd>/cli/dist/plugin-runtime.mjs` (repo-root fallback from cwd)
/// 6. npm/pnpm global install: `<global_root>/@truenine/memory-sync-cli/dist/plugin-runtime.mjs`
/// 7. Embedded JS extracted to `~/.aindex/.cache/plugin-runtime-<version>.mjs`
pub(crate) fn find_plugin_runtime() -> Option<PathBuf> {
    let cache = PLUGIN_RUNTIME_CACHE.get_or_init(|| Mutex::new(None));
    detect_with_cached_success(cache, detect_plugin_runtime)
}

fn detect_plugin_runtime() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    // Relative to binary location
    if let Ok(exe) = std::env::current_exe()
        && let Some(exe_dir) = exe.parent()
    {
        candidates.push(exe_dir.join("plugin-runtime.mjs"));
        candidates.push(exe_dir.join("../dist/plugin-runtime.mjs"));
        candidates.push(exe_dir.join("../cli/dist/plugin-runtime.mjs"));
    }

    // Relative to CWD
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("dist/plugin-runtime.mjs"));
        candidates.push(cwd.join("cli/dist/plugin-runtime.mjs"));
    }

    // npm/pnpm global package locations
    for global_root in find_npm_global_roots() {
        candidates.push(
            global_root
                .join(PACKAGE_NAME)
                .join("dist/plugin-runtime.mjs"),
        );
    }

    for candidate in &candidates {
        let normalized = candidate
            .canonicalize()
            .ok()
            .unwrap_or_else(|| candidate.clone());
        if normalized.exists() {
            return Some(strip_win_prefix(normalized));
        }
    }

    // Last resort: extract embedded JS to cache
    extract_embedded_runtime()
}

/// Find pnpm/npm global node_modules roots.
fn find_npm_global_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();

    // `pnpm root -g` output (preferred)
    if let Some(path) = run_silent("pnpm", &["root", "-g"]) {
        roots.push(PathBuf::from(path));
    }

    // `npm root -g` output
    if let Some(path) = run_silent("npm", &["root", "-g"]) {
        roots.push(PathBuf::from(path));
    }

    // Common fallback locations (pnpm first)
    if let Some(home) = dirs::home_dir() {
        roots.push(home.join("AppData/Local/pnpm/global/5/node_modules"));
        roots.push(home.join("AppData/Local/pnpm/global/node_modules"));
        roots.push(home.join(".local/share/pnpm/global/5/node_modules"));
        roots.push(home.join(".local/share/pnpm/global/node_modules"));
        roots.push(home.join("AppData/Roaming/npm/node_modules"));
        roots.push(home.join(".npm-global/lib/node_modules"));
    }

    // nvm-managed node paths
    #[cfg(not(windows))]
    if let Some(home) = dirs::home_dir() {
        let nvm_dir = home.join(".nvm/versions/node");
        if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
            for entry in entries.flatten() {
                roots.push(entry.path().join("lib/node_modules"));
            }
        }
    }

    roots
}

/// Run a command silently and return trimmed stdout.
fn run_silent(cmd: &str, args: &[&str]) -> Option<String> {
    Command::new(cmd)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                String::from_utf8(o.stdout)
                    .ok()
                    .map(|s| s.trim().to_string())
            } else {
                None
            }
        })
        .filter(|s| !s.is_empty())
}

/// Embedded plugin-runtime.mjs content (set by build.rs, empty if not available).
/// This allows the standalone binary to work without an external JS file.
#[cfg(feature = "embedded-runtime")]
const EMBEDDED_RUNTIME: &str = include_str!(concat!(env!("OUT_DIR"), "/plugin-runtime.mjs"));

/// Extract embedded JS to `~/.aindex/.cache/plugin-runtime-<version>.mjs`.
#[cfg(not(feature = "embedded-runtime"))]
fn extract_embedded_runtime() -> Option<PathBuf> {
    None
}

/// Extract embedded JS to `~/.aindex/.cache/plugin-runtime-<version>.mjs`.
#[cfg(feature = "embedded-runtime")]
fn extract_embedded_runtime() -> Option<PathBuf> {
    let version = env!("CARGO_PKG_VERSION");
    let cache_dir = dirs::home_dir()?.join(".aindex/.cache");
    let cache_file = cache_dir.join(format!("plugin-runtime-{version}.mjs"));

    // Already extracted and up-to-date
    if cache_file.exists() {
        return Some(cache_file);
    }

    // Extract
    std::fs::create_dir_all(&cache_dir).ok()?;
    std::fs::write(&cache_file, EMBEDDED_RUNTIME).ok()?;
    Some(cache_file)
}

/// Find the `node` executable.
pub(crate) fn find_node() -> Option<String> {
    let cache = NODE_CACHE.get_or_init(|| Mutex::new(None));
    detect_with_cached_success(cache, detect_node)
}

fn detect_node() -> Option<String> {
    // Try `node` in PATH
    if Command::new("node")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok()
    {
        return Some("node".to_string());
    }
    None
}

/// Run a Node.js plugin runtime command.
///
/// Spawns: `node <plugin-runtime.mjs> <subcommand> [extra_args...]`
/// Inherits stdin/stdout/stderr so the Node.js process output goes directly to terminal.
pub fn run_node_command(subcommand: &str, extra_args: &[&str]) -> ExitCode {
    let logger = create_logger("NodeBridge", None);

    // Find node
    let node = match find_node() {
        Some(n) => n,
        None => {
            logger.error(diagnostic(
                "NODE_RUNTIME_NOT_FOUND",
                "Node.js runtime is required",
                line("The `node` executable was not found in PATH."),
                Some(line(
                    "Install Node.js and reopen this shell so `node --version` succeeds.",
                )),
                Some(vec![line(
                    "If Node.js is already installed, add its install directory to PATH.",
                )]),
                optional_details(serde_json::json!({ "subcommand": subcommand })),
            ));
            return ExitCode::FAILURE;
        }
    };

    // Find plugin runtime
    let runtime_path = match find_plugin_runtime() {
        Some(p) => p,
        None => {
            logger.error(diagnostic(
                "PLUGIN_RUNTIME_NOT_FOUND",
                "Plugin runtime entry is missing",
                line("No `plugin-runtime.mjs` file was found in the expected locations."),
                Some(line(
                    "Build `@truenine/memory-sync-sdk` or install `@truenine/memory-sync-cli` so `plugin-runtime.mjs` is available.",
                )),
                Some(vec![line(
                    "Run `pnpm -F @truenine/memory-sync-sdk build` in the repository.",
                )]),
                optional_details(serde_json::json!({ "subcommand": subcommand })),
            ));
            logger.debug(
                Value::String("Searched: binary dir, CWD, npm/pnpm global, embedded cache".into()),
                None,
            );
            return ExitCode::FAILURE;
        }
    };

    logger.debug(
        Value::String("spawning node process".into()),
        Some(serde_json::json!({
            "node": &node,
            "runtime": runtime_path.to_string_lossy(),
            "subcommand": subcommand,
        })),
    );

    let mut cmd = Command::new(&node);
    cmd.arg(&runtime_path);
    cmd.arg(subcommand);

    for arg in extra_args {
        cmd.arg(arg);
    }

    // Inherit stdio so Node.js output goes directly to terminal
    cmd.stdin(Stdio::inherit());
    cmd.stdout(Stdio::inherit());
    cmd.stderr(Stdio::inherit());

    match cmd.status() {
        Ok(status) => {
            if status.success() {
                ExitCode::SUCCESS
            } else {
                ExitCode::from(status.code().unwrap_or(1) as u8)
            }
        }
        Err(e) => {
            logger.error(diagnostic(
                "NODE_PROCESS_SPAWN_FAILED",
                "Failed to start the Node.js subprocess",
                line("The CLI could not spawn the `node` process."),
                Some(line(
                    "Check that `node` is runnable in this shell and retry.",
                )),
                None,
                optional_details(serde_json::json!({
                    "subcommand": subcommand,
                    "error": e.to_string()
                })),
            ));
            ExitCode::FAILURE
        }
    }
}

/// Library mode: capture Node.js subprocess output and return structured result.
///
/// Used by GUI backend and other Rust callers via [`crate::run_bridge_command`].
/// Unlike [`run_node_command`] which inherits stdio for CLI terminal use,
/// this variant pipes stdout/stderr so the caller can inspect the output.
pub fn run_node_command_captured(
    subcommand: &str,
    cwd: &Path,
    extra_args: &[&str],
) -> Result<BridgeCommandResult, CliError> {
    let node = find_node().ok_or(CliError::NodeNotFound)?;
    let runtime_path = find_plugin_runtime()
        .ok_or_else(|| CliError::PluginRuntimeNotFound(
            "plugin-runtime.mjs not found. Install via 'pnpm add -g @truenine/memory-sync-cli' or place plugin-runtime.mjs next to the binary.".into(),
        ))?;

    let mut cmd = Command::new(&node);
    cmd.arg(&runtime_path);
    cmd.arg(subcommand);

    for arg in extra_args {
        cmd.arg(arg);
    }

    cmd.current_dir(cwd);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let output = cmd.output()?;

    let exit_code = output.status.code().unwrap_or(-1);
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let expects_structured_stdout = extra_args.iter().any(|arg| *arg == "--bridge-json");

    if output.status.success() || (expects_structured_stdout && !stdout.trim().is_empty()) {
        Ok(BridgeCommandResult {
            stdout,
            stderr,
            exit_code,
        })
    } else {
        Err(CliError::NodeProcessFailed {
            code: exit_code,
            stderr,
        })
    }
}

/// Run the fallback: spawn `node <index.mjs>` with full process.argv passthrough.
/// Used when plugin-runtime.mjs is not available but index.mjs is.
#[allow(dead_code)]
pub fn run_node_fallback(args: &[String]) -> ExitCode {
    let logger = create_logger("NodeBridge", None);

    let node = match find_node() {
        Some(n) => n,
        None => {
            logger.error(diagnostic(
                "NODE_RUNTIME_NOT_FOUND",
                "Node.js runtime is required",
                line("The `node` executable was not found in PATH."),
                Some(line(
                    "Install Node.js and reopen this shell so `node --version` succeeds.",
                )),
                Some(vec![line(
                    "If Node.js is already installed, add its install directory to PATH.",
                )]),
                optional_details(serde_json::json!({ "args": args })),
            ));
            return ExitCode::FAILURE;
        }
    };

    // Find index.mjs (the existing TS CLI entry)
    let index_path = find_index_mjs();
    let runtime = match index_path {
        Some(p) => p,
        None => {
            logger.error(diagnostic(
                "CLI_ENTRY_NOT_FOUND",
                "CLI JavaScript entry is missing",
                line("No `index.mjs` entry point was found for the fallback Node.js launcher."),
                Some(line(
                    "Build `@truenine/memory-sync-sdk` before running the fallback launcher.",
                )),
                Some(vec![line(
                    "Run `pnpm -F @truenine/memory-sync-sdk build` in the repository.",
                )]),
                optional_details(serde_json::json!({ "args": args })),
            ));
            return ExitCode::FAILURE;
        }
    };

    let mut cmd = Command::new(&node);
    cmd.arg(&runtime);
    for arg in args {
        cmd.arg(arg);
    }
    cmd.stdin(Stdio::inherit());
    cmd.stdout(Stdio::inherit());
    cmd.stderr(Stdio::inherit());

    match cmd.status() {
        Ok(status) => {
            if status.success() {
                ExitCode::SUCCESS
            } else {
                ExitCode::from(status.code().unwrap_or(1) as u8)
            }
        }
        Err(e) => {
            logger.error(diagnostic(
                "NODE_PROCESS_SPAWN_FAILED",
                "Failed to start the Node.js subprocess",
                line("The CLI could not spawn the `node` process."),
                Some(line(
                    "Check that `node` is runnable in this shell and retry.",
                )),
                None,
                optional_details(serde_json::json!({
                    "args": args,
                    "error": e.to_string()
                })),
            ));
            ExitCode::FAILURE
        }
    }
}

#[allow(dead_code)]
fn find_index_mjs() -> Option<PathBuf> {
    let candidates: Vec<PathBuf> = {
        let mut c = Vec::new();
        if let Ok(exe) = std::env::current_exe()
            && let Some(exe_dir) = exe.parent()
        {
            c.push(exe_dir.join("index.mjs"));
            c.push(exe_dir.join("../dist/index.mjs"));
            c.push(exe_dir.join("../sdk/dist/index.mjs"));
            c.push(exe_dir.join("../cli/dist/index.mjs"));
        }
        if let Ok(cwd) = std::env::current_dir() {
            c.push(cwd.join("dist/index.mjs"));
            c.push(cwd.join("sdk/dist/index.mjs"));
            c.push(cwd.join("cli/dist/index.mjs"));
        }
        c
    };

    for candidate in &candidates {
        let normalized = candidate
            .canonicalize()
            .ok()
            .unwrap_or_else(|| candidate.clone());
        if normalized.exists() {
            return Some(strip_win_prefix(normalized));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    use std::sync::Mutex;

    #[test]
    fn test_strip_win_prefix_with_prefix() {
        let path = PathBuf::from(r"\\?\C:\Users\test\file.mjs");
        let result = strip_win_prefix(path);
        assert_eq!(result, PathBuf::from(r"C:\Users\test\file.mjs"));
    }

    #[test]
    fn test_strip_win_prefix_without_prefix() {
        let path = PathBuf::from(r"C:\Users\test\file.mjs");
        let result = strip_win_prefix(path.clone());
        assert_eq!(result, path);
    }

    #[test]
    fn test_strip_win_prefix_unix_path() {
        let path = PathBuf::from("/home/user/file.mjs");
        let result = strip_win_prefix(path.clone());
        assert_eq!(result, path);
    }

    #[test]
    fn test_detect_with_cached_success_retries_until_success() {
        let cache = Mutex::new(None);
        let attempts = Cell::new(0);

        let first = detect_with_cached_success(&cache, || {
            attempts.set(attempts.get() + 1);
            Option::<String>::None
        });
        assert_eq!(first, None);

        let second = detect_with_cached_success(&cache, || {
            attempts.set(attempts.get() + 1);
            Some(String::from("node"))
        });
        assert_eq!(second, Some(String::from("node")));

        let third = detect_with_cached_success(&cache, || {
            attempts.set(attempts.get() + 1);
            Some(String::from("other"))
        });
        assert_eq!(third, Some(String::from("node")));
        assert_eq!(attempts.get(), 2);
    }
}
