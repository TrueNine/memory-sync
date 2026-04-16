use super::config;
use super::plugin_shared::CollectedInputContext;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WslMirrorFileDeclaration {
  pub source_path: String,
  pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedWslInstanceTarget {
  pub instance: String,
  pub linux_home_dir: String,
  pub windows_home_dir: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WslMirrorSyncResult {
  pub mirrored_files: usize,
  pub warnings: Vec<String>,
  pub errors: Vec<String>,
}

pub fn sync_windows_config_into_wsl(
  _context: &CollectedInputContext,
  mirror_declarations: &[WslMirrorFileDeclaration],
  dry_run: bool,
) -> WslMirrorSyncResult {
  let runtime_env = config::resolve_runtime_environment();
  if !cfg!(windows) && !runtime_env.is_wsl {
    return WslMirrorSyncResult::default();
  }

  let mut result = WslMirrorSyncResult::default();
  let host_home_dir = runtime_env
    .effective_home_dir
    .as_ref()
    .or(runtime_env.native_home_dir.as_ref())
    .map(|p| p.to_string_lossy().into_owned())
    .unwrap_or_else(|| "/".to_string());

  // 1. Collect sources to mirror
  let sources = collect_mirror_sources(_context, mirror_declarations, &host_home_dir);
  if sources.is_empty() {
    return result;
  }

  // 2. Resolve targets
  let targets = resolve_wsl_instance_targets(_context);
  if targets.is_empty() {
    // If we are already in WSL, mirror to current home if it differs from host home
    if runtime_env.is_wsl {
      return sync_into_current_wsl_home(sources, &runtime_env, dry_run);
    }
    return result;
  }

  // 3. Execute mirroring
  for source in sources {
    let source_path = Path::new(&source.source_path);
    if !source_path.exists() {
      result.warnings.push(format!(
        "Skipping missing WSL mirror source file: {}",
        source.source_path
      ));
      continue;
    }

    let content = match std::fs::read(source_path) {
      Ok(c) => c,
      Err(e) => {
        result.errors.push(format!(
          "Failed to read mirror source {}: {}",
          source.source_path, e
        ));
        continue;
      }
    };

    for target in &targets {
      let mut target_path = PathBuf::from(&target.windows_home_dir);
      for segment in &source.relative_path_segments {
        target_path.push(segment);
      }

      if dry_run {
        result.mirrored_files += 1;
        continue;
      }

      if let Some(parent) = target_path.parent() {
        let _ = std::fs::create_dir_all(parent);
      }

      match std::fs::write(&target_path, &content) {
        Ok(_) => result.mirrored_files += 1,
        Err(e) => result.errors.push(format!(
          "Failed to mirror {} to {}: {}",
          source.source_path,
          target_path.display(),
          e
        )),
      }
    }
  }

  result
}

struct ResolvedMirrorSource {
  source_path: String,
  relative_path_segments: Vec<String>,
}

fn collect_mirror_sources(
  _context: &CollectedInputContext,
  declarations: &[WslMirrorFileDeclaration],
  host_home_dir: &str,
) -> Vec<ResolvedMirrorSource> {
  let mut sources = Vec::new();
  let mut seen = HashSet::new();

  // From declarations
  for decl in declarations {
    let resolved_path = config::resolve_tilde(&decl.source_path);
    let path_str = resolved_path.to_string_lossy().into_owned();
    if seen.insert(path_str.clone()) {
      if let Ok(segments) = resolve_mirrored_relative_path_segments(&resolved_path, host_home_dir) {
        sources.push(ResolvedMirrorSource {
          source_path: path_str,
          relative_path_segments: segments,
        });
      }
    }
  }

  // From generated global outputs (simplified check)
  // In a full implementation, we'd check context.global_memory etc.

  sources
}

fn resolve_mirrored_relative_path_segments(
  source_path: &Path,
  host_home_dir: &str,
) -> Result<Vec<String>, String> {
  let host_home = Path::new(host_home_dir);
  let relative = source_path
    .strip_prefix(host_home)
    .map_err(|_| "Source path not under host home".to_string())?;

  Ok(
    relative
      .components()
      .map(|c| c.as_os_str().to_string_lossy().into_owned())
      .collect(),
  )
}

fn resolve_wsl_instance_targets(
  _context: &CollectedInputContext,
) -> Vec<ResolvedWslInstanceTarget> {
  if !cfg!(windows) {
    return vec![];
  }

  // In a real implementation, we'd call wsl.exe --list --quiet
  // For now, return empty or implement basic discovery if needed.
  vec![]
}

fn sync_into_current_wsl_home(
  sources: Vec<ResolvedMirrorSource>,
  runtime_env: &config::RuntimeEnvironmentContext,
  dry_run: bool,
) -> WslMirrorSyncResult {
  let mut result = WslMirrorSyncResult::default();
  let native_home = runtime_env
    .native_home_dir
    .as_ref()
    .map(|p| p.to_path_buf())
    .unwrap_or_else(|| PathBuf::from("/"));

  for source in sources {
    let mut target_path = native_home.clone();
    for segment in &source.relative_path_segments {
      target_path.push(segment);
    }

    if dry_run {
      result.mirrored_files += 1;
      continue;
    }

    if let Ok(content) = std::fs::read(&source.source_path) {
      if let Some(parent) = target_path.parent() {
        let _ = std::fs::create_dir_all(parent);
      }
      if std::fs::write(&target_path, content).is_ok() {
        result.mirrored_files += 1;
      }
    }
  }
  result
}
