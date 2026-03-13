#![deny(clippy::all)]

use std::ffi::OsString;
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

use serde::Deserialize;
use wait_timeout::ChildExt;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResolvePublicPathContext {
    aindex_dir: String,
    worker_path: Option<String>,
    timeout_ms: Option<u64>,
}

fn normalize_path(path: &Path) -> Result<PathBuf, String> {
    let mut normalized = PathBuf::new();

    for component in path.components() {
        match component {
            Component::Prefix(prefix) => {
                normalized.push(prefix.as_os_str());
            }
            Component::RootDir => {
                normalized.push(component.as_os_str());
            }
            Component::CurDir => {}
            Component::ParentDir => {
                if !normalized.pop() {
                    return Err(format!("Path escapes root: {}", path.display()));
                }
            }
            Component::Normal(segment) => {
                normalized.push(segment);
            }
        }
    }

    Ok(normalized)
}

fn absolute_base_path(path_str: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path_str);
    let base_path = if path.is_absolute() {
        path
    } else {
        std::env::current_dir()
            .map_err(|error| format!("Failed to resolve current directory: {error}"))?
            .join(path)
    };

    normalize_path(&base_path)
}

fn ensure_within_root(resolved: &Path, root: &Path, label: &str) -> Result<(), String> {
    if resolved.starts_with(root) {
        return Ok(());
    }

    Err(format!(
        "{label} escapes public root: {} is not within {}",
        resolved.display(),
        root.display()
    ))
}

pub fn validate_public_path_impl(
    resolved_path: &str,
    aindex_public_dir: &str,
) -> Result<String, String> {
    let trimmed_path = resolved_path.trim();
    if trimmed_path.is_empty() {
        return Err("Resolved public path cannot be empty".into());
    }

    let normalized_path = trimmed_path.replace('\\', "/");
    let candidate_path = PathBuf::from(&normalized_path);
    if candidate_path.is_absolute() {
        return Err(format!(
            "Resolved public path must be relative: {}",
            candidate_path.display()
        ));
    }

    let normalized_relative_path = normalize_path(&candidate_path)?;
    if normalized_relative_path.as_os_str().is_empty() {
        return Err("Resolved public path cannot be empty".into());
    }

    let aindex_public_root = absolute_base_path(aindex_public_dir)?;
    let normalized_absolute_path =
        normalize_path(&aindex_public_root.join(&normalized_relative_path))?;
    ensure_within_root(
        &normalized_absolute_path,
        &aindex_public_root,
        "Resolved public path",
    )?;

    Ok(normalized_relative_path.to_string_lossy().to_string())
}

fn candidate_node_commands() -> Vec<OsString> {
    let mut candidates: Vec<OsString> = Vec::new();

    if let Some(exec_path) = std::env::var_os("npm_node_execpath") {
        candidates.push(exec_path);
    }
    if let Some(exec_path) = std::env::var_os("NODE") {
        candidates.push(exec_path);
    }
    if let Ok(current_exe) = std::env::current_exe() {
        let file_name = current_exe
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        if file_name.contains("node") {
            candidates.push(current_exe.into_os_string());
        }
    }
    candidates.push(OsString::from("node"));

    candidates
}

fn find_node_command() -> Result<OsString, String> {
    for candidate in candidate_node_commands() {
        let status = Command::new(&candidate)
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();

        if status.is_ok_and(|value| value.success()) {
            return Ok(candidate);
        }
    }

    Err("Node.js executable was not found for resolve_public_path".into())
}

fn build_aindex_public_dir(aindex_dir: &str) -> Result<PathBuf, String> {
    let normalized = absolute_base_path(aindex_dir)?;
    Ok(normalize_path(&normalized.join("public"))?)
}

fn read_pipe_to_string<R: Read>(pipe: &mut Option<R>, label: &str) -> Result<String, String> {
    let mut buffer: Vec<u8> = Vec::new();

    if let Some(reader) = pipe {
        reader
            .read_to_end(&mut buffer)
            .map_err(|error| format!("Failed to read {label}: {error}"))?;
    }

    String::from_utf8(buffer).map_err(|error| format!("Invalid UTF-8 from {label}: {error}"))
}

pub fn resolve_public_path_impl(
    file_path: &str,
    ctx_json: &str,
    logical_path: &str,
) -> Result<String, String> {
    let ctx: ResolvePublicPathContext = serde_json::from_str(ctx_json)
        .map_err(|error| format!("Invalid resolve_public_path context JSON: {error}"))?;

    let worker_path = match ctx.worker_path {
        Some(worker_path) if !worker_path.trim().is_empty() => worker_path,
        _ => {
            return Err("resolve_public_path requires ctxJson.workerPath".into());
        }
    };

    let timeout = Duration::from_millis(ctx.timeout_ms.unwrap_or(5_000));
    let node_command = find_node_command()?;

    let temp_dir = tempfile::tempdir()
        .map_err(|error| format!("Failed to create resolve_public_path temp directory: {error}"))?;
    let ctx_path = temp_dir.path().join("proxy-context.json");
    fs::write(&ctx_path, ctx_json)
        .map_err(|error| format!("Failed to write resolve_public_path context file: {error}"))?;

    let mut child = Command::new(node_command)
        .arg(worker_path)
        .arg(file_path)
        .arg(&ctx_path)
        .arg(logical_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to spawn proxy worker: {error}"))?;

    match child
        .wait_timeout(timeout)
        .map_err(|error| format!("Failed while waiting for proxy worker: {error}"))?
    {
        Some(_) => {}
        None => {
            child
                .kill()
                .map_err(|error| format!("Failed to terminate timed out proxy worker: {error}"))?;
            let _ = child.wait();
            return Err(format!(
                "proxy.ts execution timed out after {}ms",
                timeout.as_millis()
            ));
        }
    }

    let stdout = read_pipe_to_string(&mut child.stdout, "proxy worker stdout")?;
    let stderr = read_pipe_to_string(&mut child.stderr, "proxy worker stderr")?;
    let _ = child.wait();

    if !stderr.trim().is_empty() {
        return Err(stderr.trim().to_string());
    }
    if stdout.trim().is_empty() {
        return Err("proxy worker produced no output".into());
    }

    let aindex_public_dir = build_aindex_public_dir(&ctx.aindex_dir)?;
    validate_public_path_impl(stdout.trim(), &aindex_public_dir.to_string_lossy())
}

#[cfg(feature = "napi")]
mod napi_binding {
    use super::{resolve_public_path_impl, validate_public_path_impl};
    use napi::bindgen_prelude::Error;
    use napi_derive::napi;

    #[napi]
    pub fn validate_public_path(
        resolved_path: String,
        aindex_public_dir: String,
    ) -> napi::Result<String> {
        validate_public_path_impl(&resolved_path, &aindex_public_dir).map_err(Error::from_reason)
    }

    #[napi]
    pub fn resolve_public_path(
        file_path: String,
        ctx_json: String,
        logical_path: String,
    ) -> napi::Result<String> {
        resolve_public_path_impl(&file_path, &ctx_json, &logical_path).map_err(Error::from_reason)
    }
}

#[cfg(test)]
mod tests {
    use super::validate_public_path_impl;
    use std::path::PathBuf;

    #[test]
    fn validate_public_path_rejects_absolute_paths() {
        let absolute_path = if cfg!(windows) {
            String::from(r"C:\escape.txt")
        } else {
            String::from("/escape.txt")
        };

        let result = validate_public_path_impl(&absolute_path, "/tmp/workspace/aindex/public");
        assert!(result.is_err());
    }

    #[test]
    fn validate_public_path_rejects_public_root_escape() {
        let result = validate_public_path_impl("../escape.txt", "/tmp/workspace/aindex/public");
        assert!(result.is_err());
    }

    #[test]
    fn validate_public_path_rejects_backslash_parent_segments() {
        let result = validate_public_path_impl(r"..\escape.txt", "/tmp/workspace/aindex/public");
        assert!(result.is_err());
    }

    #[test]
    fn validate_public_path_normalizes_segments() -> Result<(), String> {
        let validated = validate_public_path_impl(
            "./____git/./info/../info/exclude",
            "/tmp/workspace/aindex/public",
        )?;

        let validated_path = PathBuf::from(validated);
        assert!(validated_path.ends_with(PathBuf::from("____git").join("info").join("exclude")));
        Ok(())
    }
}
