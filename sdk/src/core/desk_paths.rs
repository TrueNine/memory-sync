use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use thiserror::Error;

use crate::core::config;

const WINDOWS_DRIVE_PREFIX_LEN: usize = 2;

/// Errors emitted by the desk-paths helpers.
#[derive(Debug, Error)]
pub enum DeskPathsError {
  #[error("{0}")]
  Io(#[from] io::Error),
  #[error("unsupported platform: {0}")]
  UnsupportedPlatform(String),
}

pub type DeskPathsResult<T> = Result<T, DeskPathsError>;

/// Platform shim that mirrors the values used by the legacy TS module.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
  Win32,
  Linux,
  Darwin,
}

impl Platform {
  fn from_runtime(ctx: &config::RuntimeEnvironmentContext) -> Self {
    if ctx.is_wsl {
      return Platform::Win32;
    }
    match env::consts::OS {
      "macos" => Platform::Darwin,
      "windows" => Platform::Win32,
      _ => Platform::Linux,
    }
  }

  fn is_windows(self) -> bool {
    matches!(self, Platform::Win32)
  }
}

pub fn get_platform_fixed_dir() -> DeskPathsResult<String> {
  let ctx = config::resolve_runtime_environment();
  let platform = Platform::from_runtime(&ctx);
  let target = match platform {
    Platform::Win32 => get_windows_fixed_dir(&ctx),
    Platform::Darwin => get_home_dir(&ctx)
      .join("Library")
      .join("Application Support"),
    Platform::Linux => get_linux_data_dir(&ctx),
  };
  Ok(target.to_string_lossy().into_owned())
}

fn get_windows_fixed_dir(ctx: &config::RuntimeEnvironmentContext) -> PathBuf {
  let default = get_home_dir(ctx).join("AppData").join("Local");
  let candidate =
    env::var("LOCALAPPDATA").unwrap_or_else(|_| default.to_string_lossy().into_owned());
  PathBuf::from(resolve_user_path(&candidate, ctx))
}

fn get_linux_data_dir(ctx: &config::RuntimeEnvironmentContext) -> PathBuf {
  if let Ok(xdg_data_home) = env::var("XDG_DATA_HOME")
    && !xdg_data_home.trim().is_empty()
  {
    return PathBuf::from(resolve_user_path(&xdg_data_home, ctx));
  }
  get_home_dir(ctx).join(".local").join("share")
}

fn get_home_dir(ctx: &config::RuntimeEnvironmentContext) -> PathBuf {
  ctx
    .effective_home_dir
    .as_ref()
    .cloned()
    .or_else(|| ctx.native_home_dir.clone())
    .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| PathBuf::from("/")))
}

fn resolve_user_path(raw_path: &str, ctx: &config::RuntimeEnvironmentContext) -> String {
  let platform = Platform::from_runtime(ctx);
  let home_dir = get_home_dir(ctx);
  let expanded = expand_home_directory(raw_path, &home_dir);
  if ctx.is_wsl {
    if let Some(converted) = convert_windows_path_to_wsl(&expanded) {
      return normalize_posix_like_path(&converted, true);
    }
    return normalize_posix_like_path(&expanded, true);
  }
  if platform.is_windows() {
    normalize_windows_path(&expanded)
  } else {
    normalize_posix_like_path(&expanded, false)
  }
}

fn expand_home_directory(raw_path: &str, home_dir: &Path) -> String {
  if raw_path == "~" {
    return normalize_posix_like_path(&home_dir.to_string_lossy(), false);
  }
  if raw_path.starts_with("~/") || raw_path.starts_with("~\\") {
    let suffix = &raw_path[2..];
    let normalized = suffix.replace('\\', "/");
    let mut joined = PathBuf::from(home_dir);
    for component in normalized.split('/') {
      if component.is_empty() || component == "." {
        continue;
      }
      if component == ".." {
        joined.pop();
      } else {
        joined.push(component);
      }
    }
    return normalize_posix_like_path(&joined.to_string_lossy(), false);
  }
  raw_path.to_string()
}

fn normalize_posix_like_path(raw_path: &str, preserve_slashes: bool) -> String {
  let replaced = raw_path.replace('\\', "/");
  let is_absolute = replaced.starts_with('/');
  let mut components = Vec::new();
  for segment in replaced.split('/') {
    if segment.is_empty() || segment == "." {
      continue;
    }
    if segment == ".." {
      components.pop();
      continue;
    }
    components.push(segment);
  }
  let mut normalized = String::new();
  if is_absolute {
    normalized.push('/');
  }
  normalized.push_str(&components.join("/"));
  if normalized.is_empty() {
    if is_absolute {
      normalized.push('/');
    } else if preserve_slashes {
      normalized.push('.');
    }
  }
  normalized
}

fn normalize_windows_path(raw_path: &str) -> String {
  let replaced = raw_path.replace('/', "\\");
  let mut components = Vec::new();
  let mut rest = replaced.as_str();
  let mut prefix = String::new();
  if rest.len() >= WINDOWS_DRIVE_PREFIX_LEN && rest.as_bytes()[1] == b':' {
    prefix = rest[..WINDOWS_DRIVE_PREFIX_LEN].to_ascii_uppercase();
    rest = &rest[WINDOWS_DRIVE_PREFIX_LEN..];
  }
  for segment in rest.split('\\') {
    if segment.is_empty() || segment == "." {
      continue;
    }
    if segment == ".." {
      components.pop();
      continue;
    }
    components.push(segment);
  }
  let mut normalized = prefix.clone();
  if !normalized.is_empty() && !components.is_empty() {
    normalized.push('\\');
  }
  normalized.push_str(&components.join("\\"));
  if normalized.is_empty() {
    normalized.push('.');
  }
  normalized
}

fn convert_windows_path_to_wsl(raw_path: &str) -> Option<String> {
  let bytes = raw_path.as_bytes();
  if bytes.len() < WINDOWS_DRIVE_PREFIX_LEN + 1 || bytes[1] != b':' {
    return None;
  }
  let drive_letter = (bytes[0] as char).to_ascii_lowercase();
  if !drive_letter.is_ascii_alphabetic() {
    return None;
  }
  let mut rest = &raw_path[WINDOWS_DRIVE_PREFIX_LEN..];
  if rest.starts_with('\\') || rest.starts_with('/') {
    rest = &rest[1..];
  }
  let normalized = rest.replace('\\', "/");
  let prefix = format!("/mnt/{}", drive_letter);
  if normalized.is_empty() {
    return Some(prefix);
  }
  Some(format!("{}/{}", prefix, normalized))
}

pub fn ensure_dir<P: AsRef<Path>>(dir: P) -> io::Result<()> {
  fs::create_dir_all(dir)
}

pub fn exists_sync<P: AsRef<Path>>(path: P) -> bool {
  path.as_ref().exists()
}

pub fn delete_path_sync<P: AsRef<Path>>(path: P) -> io::Result<()> {
  delete_path(path).map(|_| ())
}

fn delete_path(path: impl AsRef<Path>) -> io::Result<bool> {
  let path = path.as_ref();
  let metadata = match fs::symlink_metadata(path) {
    Ok(metadata) => metadata,
    Err(err) if err.kind() == io::ErrorKind::NotFound => return Ok(false),
    Err(err) => return Err(err),
  };

  if metadata.file_type().is_symlink() {
    #[cfg(windows)]
    {
      return fs::metadata(path)
        .map(|resolved| resolved.is_dir())
        .unwrap_or(false)
        .then(|| fs::remove_dir(path).or_else(|_| fs::remove_file(path)))
        .unwrap_or_else(|| fs::remove_file(path).or_else(|_| fs::remove_dir(path)))
        .map(|_| true);
    }
    #[cfg(not(windows))]
    {
      return fs::remove_file(path).map(|_| true);
    }
  }

  if metadata.is_dir() {
    fs::remove_dir_all(path).map(|_| true)
  } else {
    fs::remove_file(path).map(|_| true)
  }
}

pub fn write_file_sync<P: AsRef<Path>>(path: P, content: &[u8]) -> io::Result<()> {
  if let Some(parent) = path.as_ref().parent() {
    fs::create_dir_all(parent)?;
  }
  fs::write(path, content)
}

pub fn read_file_sync<P: AsRef<Path>>(path: P) -> io::Result<String> {
  fs::read_to_string(&path).map_err(|err| {
    io::Error::new(
      err.kind(),
      format!(
        "Failed to read file \"{}\": {}",
        path.as_ref().display(),
        err
      ),
    )
  })
}

pub struct DeletionError {
  pub path: String,
  pub error: String,
}

pub struct DeletionResult {
  pub deleted: usize,
  pub deleted_paths: Vec<String>,
  pub errors: Vec<DeletionError>,
}

pub struct DeleteTargetsResult {
  pub deleted_files: Vec<String>,
  pub deleted_dirs: Vec<String>,
  pub file_errors: Vec<DeletionError>,
  pub dir_errors: Vec<DeletionError>,
}

fn delete_empty_directory(path: impl AsRef<Path>) -> io::Result<bool> {
  let path = path.as_ref();
  let metadata = match fs::symlink_metadata(path) {
    Ok(metadata) => metadata,
    Err(err) if err.kind() == io::ErrorKind::NotFound => return Ok(false),
    Err(err) => return Err(err),
  };

  if metadata.file_type().is_symlink() || !metadata.is_dir() {
    return Ok(false);
  }

  match fs::remove_dir(path) {
    Ok(()) => Ok(true),
    Err(err)
      if err.kind() == io::ErrorKind::NotFound
        || err.kind() == io::ErrorKind::DirectoryNotEmpty =>
    {
      Ok(false)
    }
    Err(err) => Err(err),
  }
}

pub fn delete_files(paths: &[String]) -> DeletionResult {
  let mut result = DeletionResult {
    deleted: 0,
    deleted_paths: Vec::new(),
    errors: Vec::new(),
  };
  for path in paths {
    match delete_path(Path::new(path)) {
      Ok(true) => {
        result.deleted += 1;
        result.deleted_paths.push(path.clone());
      }
      Ok(false) => {}
      Err(err) => result.errors.push(DeletionError {
        path: path.clone(),
        error: err.to_string(),
      }),
    }
  }
  result
}

pub fn delete_directories(paths: &[String]) -> DeletionResult {
  let mut sorted_paths = paths.to_vec();
  sorted_paths.sort_by(|a, b| b.len().cmp(&a.len()).then_with(|| b.cmp(a)));

  let mut result = DeletionResult {
    deleted: 0,
    deleted_paths: Vec::new(),
    errors: Vec::new(),
  };
  for path in &sorted_paths {
    match delete_path(Path::new(path)) {
      Ok(true) => {
        result.deleted += 1;
        result.deleted_paths.push(path.clone());
      }
      Ok(false) => {}
      Err(err) => result.errors.push(DeletionError {
        path: path.clone(),
        error: err.to_string(),
      }),
    }
  }
  result
}

pub fn delete_empty_directories(paths: &[String]) -> DeletionResult {
  let mut sorted_paths = paths.to_vec();
  sorted_paths.sort_by(|a, b| b.len().cmp(&a.len()).then_with(|| b.cmp(a)));

  let mut result = DeletionResult {
    deleted: 0,
    deleted_paths: Vec::new(),
    errors: Vec::new(),
  };
  for path in &sorted_paths {
    match delete_empty_directory(Path::new(path)) {
      Ok(true) => {
        result.deleted += 1;
        result.deleted_paths.push(path.clone());
      }
      Ok(false) => {}
      Err(err) => result.errors.push(DeletionError {
        path: path.clone(),
        error: err.to_string(),
      }),
    }
  }
  result
}

pub fn delete_targets(files: &[String], dirs: &[String]) -> DeleteTargetsResult {
  let file_result = delete_files(files);
  let dir_result = delete_directories(dirs);
  DeleteTargetsResult {
    deleted_files: file_result.deleted_paths,
    deleted_dirs: dir_result.deleted_paths,
    file_errors: file_result.errors,
    dir_errors: dir_result.errors,
  }
}

pub struct CompactedDeletionTargets {
  pub files: Vec<String>,
  pub dirs: Vec<String>,
}

fn path_starts_with(child: &str, parent: &str) -> bool {
  if child == parent {
    return true;
  }
  let sep = std::path::MAIN_SEPARATOR_STR;
  child.starts_with(&format!("{}{sep}", parent))
}

pub fn compact_deletion_targets(files: &[String], dirs: &[String]) -> CompactedDeletionTargets {
  let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/"));

  let resolve = |p: &str| -> String {
    match std::path::absolute(Path::new(p)) {
      Ok(abs) => abs.to_string_lossy().into_owned(),
      Err(_) => cwd.join(p).to_string_lossy().into_owned(),
    }
  };

  let files_by_key: std::collections::HashMap<String, String> = files
    .iter()
    .map(|f| {
      let resolved = resolve(f);
      (resolved.clone(), resolved)
    })
    .collect();

  let dirs_by_key: std::collections::HashMap<String, String> = dirs
    .iter()
    .map(|d| {
      let resolved = resolve(d);
      (resolved.clone(), resolved)
    })
    .collect();

  let mut sorted_dir_entries: Vec<(String, String)> = dirs_by_key.into_iter().collect();
  sorted_dir_entries.sort_by(|a, b| a.0.len().cmp(&b.0.len()));

  let mut compacted_dirs: std::collections::HashMap<String, String> =
    std::collections::HashMap::new();
  for (dir_key, dir_path) in sorted_dir_entries {
    let covered_by_parent = compacted_dirs
      .keys()
      .any(|parent_key| path_starts_with(&dir_key, parent_key));
    if !covered_by_parent {
      compacted_dirs.insert(dir_key, dir_path);
    }
  }

  let mut compacted_files: Vec<String> = Vec::new();
  for (file_key, file_path) in files_by_key {
    let covered_by_dir = compacted_dirs
      .keys()
      .any(|dir_key| path_starts_with(&file_key, dir_key));
    if !covered_by_dir {
      compacted_files.push(file_path);
    }
  }

  compacted_files.sort();
  let mut compacted_dir_paths: Vec<String> = compacted_dirs.into_values().collect();
  compacted_dir_paths.sort();

  CompactedDeletionTargets {
    files: compacted_files,
    dirs: compacted_dir_paths,
  }
}

pub struct WorkspaceEmptyDirectoryPlan {
  pub empty_dirs_to_delete: Vec<String>,
}

const EMPTY_DIRECTORY_SCAN_EXCLUDED_BASENAMES: &[&str] = &[
  ".git",
  "node_modules",
  "dist",
  "target",
  ".next",
  ".turbo",
  "coverage",
  ".nyc_output",
  ".cache",
  ".vite",
  ".vite-temp",
  ".pnpm-store",
  ".yarn",
  ".idea",
  ".volumes",
  "volumes",
];

fn should_skip_empty_directory_tree(workspace_dir: &Path, current_dir: &Path) -> bool {
  if current_dir == workspace_dir {
    return false;
  }
  current_dir
    .file_name()
    .and_then(|name| name.to_str())
    .map(|name| EMPTY_DIRECTORY_SCAN_EXCLUDED_BASENAMES.contains(&name))
    .unwrap_or(false)
}

fn collect_empty_directories(
  current_dir: &Path,
  workspace_dir: &Path,
  files_to_delete_set: &std::collections::HashSet<String>,
  dirs_to_delete_set: &std::collections::HashSet<String>,
  empty_dirs: &mut std::collections::HashSet<String>,
) -> bool {
  let current_dir_str = current_dir.to_string_lossy().into_owned();
  if dirs_to_delete_set.contains(&current_dir_str) || empty_dirs.contains(&current_dir_str) {
    return true;
  }
  if should_skip_empty_directory_tree(workspace_dir, current_dir) {
    return false;
  }

  let entries = match std::fs::read_dir(current_dir) {
    Ok(read_dir) => read_dir,
    Err(_) => return false,
  };

  let mut has_retained_entries = false;

  for entry in entries.flatten() {
    let entry_path = entry.path();
    let entry_path_str = entry_path.to_string_lossy().into_owned();

    if dirs_to_delete_set.contains(&entry_path_str) || empty_dirs.contains(&entry_path_str) {
      continue;
    }

    let file_type = match entry.file_type() {
      Ok(ft) => ft,
      Err(_) => {
        has_retained_entries = true;
        continue;
      }
    };

    if file_type.is_dir() {
      if should_skip_empty_directory_tree(workspace_dir, &entry_path) {
        has_retained_entries = true;
        continue;
      }
      if collect_empty_directories(
        &entry_path,
        workspace_dir,
        files_to_delete_set,
        dirs_to_delete_set,
        empty_dirs,
      ) {
        empty_dirs.insert(entry_path_str);
        continue;
      }
      has_retained_entries = true;
      continue;
    }

    if files_to_delete_set.contains(&entry_path_str) {
      continue;
    }
    has_retained_entries = true;
  }

  !has_retained_entries
}

pub fn plan_workspace_empty_directory_cleanup(
  workspace_dir: &str,
  files_to_delete: &[String],
  dirs_to_delete: &[String],
) -> WorkspaceEmptyDirectoryPlan {
  let resolved_workspace_dir =
    std::path::absolute(Path::new(workspace_dir)).unwrap_or_else(|_| PathBuf::from(workspace_dir));

  let files_to_delete_set: std::collections::HashSet<String> = files_to_delete
    .iter()
    .map(|p| {
      std::path::absolute(Path::new(p))
        .unwrap_or_else(|_| PathBuf::from(p))
        .to_string_lossy()
        .into_owned()
    })
    .collect();

  let dirs_to_delete_set: std::collections::HashSet<String> = dirs_to_delete
    .iter()
    .map(|p| {
      std::path::absolute(Path::new(p))
        .unwrap_or_else(|_| PathBuf::from(p))
        .to_string_lossy()
        .into_owned()
    })
    .collect();

  let mut empty_dirs_to_delete: std::collections::HashSet<String> =
    std::collections::HashSet::new();

  let mut previous_size = usize::MAX;
  while empty_dirs_to_delete.len() != previous_size {
    previous_size = empty_dirs_to_delete.len();
    let mut new_empty_dirs = empty_dirs_to_delete.clone();
    collect_empty_directories(
      &resolved_workspace_dir,
      &resolved_workspace_dir,
      &files_to_delete_set,
      &dirs_to_delete_set,
      &mut new_empty_dirs,
    );
    empty_dirs_to_delete = new_empty_dirs;
  }

  let mut empty_dirs_to_delete: Vec<String> = empty_dirs_to_delete.into_iter().collect();
  empty_dirs_to_delete.sort();

  WorkspaceEmptyDirectoryPlan {
    empty_dirs_to_delete,
  }
}

#[cfg(feature = "napi")]
mod napi_binding {
  use napi::bindgen_prelude::*;
  use napi_derive::napi;

  use super::DeletionError;

  #[napi]
  pub fn get_platform_fixed_dir() -> napi::Result<String> {
    super::get_platform_fixed_dir().map_err(|err| napi::Error::from_reason(err.to_string()))
  }

  #[napi]
  pub fn ensure_dir(path: String) -> napi::Result<()> {
    super::ensure_dir(path).map_err(|err| napi::Error::from_reason(err.to_string()))
  }

  #[napi]
  pub fn exists_sync(path: String) -> bool {
    super::exists_sync(path)
  }

  #[napi]
  pub fn delete_path_sync(path: String) -> napi::Result<()> {
    super::delete_path_sync(path).map_err(|err| napi::Error::from_reason(err.to_string()))
  }

  #[napi]
  pub fn write_file_sync(
    path: String,
    data: Either<String, Buffer>,
    encoding: Option<String>,
  ) -> napi::Result<()> {
    if let Some(value) = encoding.as_deref() {
      let normalized = value.to_ascii_lowercase();
      if normalized != "utf8" && normalized != "utf-8" {
        return Err(napi::Error::from_reason(format!(
          "unsupported encoding: {}",
          value
        )));
      }
    }

    let bytes = match data {
      Either::A(text) => text.into_bytes(),
      Either::B(buffer) => buffer.to_vec(),
    };
    super::write_file_sync(path, &bytes).map_err(|err| napi::Error::from_reason(err.to_string()))
  }

  #[napi]
  pub fn read_file_sync(path: String, encoding: Option<String>) -> napi::Result<String> {
    if let Some(value) = encoding.as_deref() {
      let normalized = value.to_ascii_lowercase();
      if normalized != "utf8" && normalized != "utf-8" {
        return Err(napi::Error::from_reason(format!(
          "unsupported encoding: {}",
          value
        )));
      }
    }
    super::read_file_sync(path).map_err(|err| napi::Error::from_reason(err.to_string()))
  }

  #[napi(object)]
  pub struct NapiDeletionError {
    pub path: String,
    pub error: String,
  }

  #[napi(object)]
  pub struct NapiDeletionResult {
    pub deleted: u32,
    #[napi(js_name = "deletedPaths")]
    pub deleted_paths: Vec<String>,
    pub errors: Vec<NapiDeletionError>,
  }

  #[napi(object)]
  pub struct NapiDeleteTargetsResult {
    #[napi(js_name = "deletedFiles")]
    pub deleted_files: Vec<String>,
    #[napi(js_name = "deletedDirs")]
    pub deleted_dirs: Vec<String>,
    #[napi(js_name = "fileErrors")]
    pub file_errors: Vec<NapiDeletionError>,
    #[napi(js_name = "dirErrors")]
    pub dir_errors: Vec<NapiDeletionError>,
  }

  fn to_napi_error(err: DeletionError) -> NapiDeletionError {
    NapiDeletionError {
      path: err.path,
      error: err.error,
    }
  }

  #[napi]
  pub fn delete_files(paths: Vec<String>) -> NapiDeletionResult {
    let result = super::delete_files(&paths);
    NapiDeletionResult {
      deleted: result.deleted as u32,
      deleted_paths: result.deleted_paths,
      errors: result.errors.into_iter().map(to_napi_error).collect(),
    }
  }

  #[napi]
  pub fn delete_directories(paths: Vec<String>) -> NapiDeletionResult {
    let result = super::delete_directories(&paths);
    NapiDeletionResult {
      deleted: result.deleted as u32,
      deleted_paths: result.deleted_paths,
      errors: result.errors.into_iter().map(to_napi_error).collect(),
    }
  }

  #[napi]
  pub fn delete_empty_directories(paths: Vec<String>) -> NapiDeletionResult {
    let result = super::delete_empty_directories(&paths);
    NapiDeletionResult {
      deleted: result.deleted as u32,
      deleted_paths: result.deleted_paths,
      errors: result.errors.into_iter().map(to_napi_error).collect(),
    }
  }

  #[napi(object)]
  pub struct DeleteTargetsInput {
    pub files: Option<Vec<String>>,
    pub dirs: Option<Vec<String>>,
  }

  #[napi]
  pub fn delete_targets(paths: DeleteTargetsInput) -> NapiDeleteTargetsResult {
    let files = paths.files.unwrap_or_default();
    let dirs = paths.dirs.unwrap_or_default();
    let result = super::delete_targets(&files, &dirs);
    NapiDeleteTargetsResult {
      deleted_files: result.deleted_files,
      deleted_dirs: result.deleted_dirs,
      file_errors: result.file_errors.into_iter().map(to_napi_error).collect(),
      dir_errors: result.dir_errors.into_iter().map(to_napi_error).collect(),
    }
  }

  #[napi(object)]
  pub struct NapiCompactedDeletionTargets {
    pub files: Vec<String>,
    pub dirs: Vec<String>,
  }

  #[napi(js_name = "compactDeletionTargets")]
  pub fn compact_deletion_targets_binding(
    files: Vec<String>,
    dirs: Vec<String>,
  ) -> NapiCompactedDeletionTargets {
    let result = super::compact_deletion_targets(&files, &dirs);
    NapiCompactedDeletionTargets {
      files: result.files,
      dirs: result.dirs,
    }
  }

  #[napi(object)]
  pub struct NapiWorkspaceEmptyDirectoryPlan {
    #[napi(js_name = "emptyDirsToDelete")]
    pub empty_dirs_to_delete: Vec<String>,
  }

  #[napi(js_name = "planWorkspaceEmptyDirectoryCleanup")]
  pub fn plan_workspace_empty_directory_cleanup_binding(
    workspace_dir: String,
    files_to_delete: Vec<String>,
    dirs_to_delete: Vec<String>,
  ) -> NapiWorkspaceEmptyDirectoryPlan {
    let result = super::plan_workspace_empty_directory_cleanup(
      &workspace_dir,
      &files_to_delete,
      &dirs_to_delete,
    );
    NapiWorkspaceEmptyDirectoryPlan {
      empty_dirs_to_delete: result.empty_dirs_to_delete,
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;
  use tempfile::tempdir;

  #[test]
  fn delete_targets_batch() {
    let dir = tempdir().unwrap();
    let files_dir = dir.path().join("files");
    let dirs_dir = dir.path().join("dirs");
    fs::create_dir_all(&files_dir).unwrap();
    fs::create_dir_all(dirs_dir.join("nested")).unwrap();
    let file = files_dir.join("artifact.txt");
    fs::write(&file, b"data").unwrap();
    let leaf = dirs_dir.join("nested").join("inner.txt");
    fs::write(&leaf, b"payload").unwrap();

    let result = delete_targets(
      &[file.to_string_lossy().into_owned()],
      &[dirs_dir.to_string_lossy().into_owned()],
    );

    assert_eq!(
      result.deleted_files,
      vec![file.to_string_lossy().into_owned()]
    );
    assert!(
      result
        .deleted_dirs
        .contains(&dirs_dir.to_string_lossy().into_owned())
    );
    assert!(result.file_errors.is_empty());
    assert!(result.dir_errors.is_empty());
  }

  #[test]
  fn delete_empty_directories_only_removes_empty_paths() {
    let dir = tempdir().unwrap();
    let parent_dir = dir.path().join("empty-parent");
    let child_dir = parent_dir.join("leaf");
    let non_empty_dir = dir.path().join("non-empty");
    fs::create_dir_all(&child_dir).unwrap();
    fs::create_dir_all(&non_empty_dir).unwrap();
    fs::write(non_empty_dir.join("keep.txt"), b"keep").unwrap();

    let result = delete_empty_directories(&[
      parent_dir.to_string_lossy().into_owned(),
      child_dir.to_string_lossy().into_owned(),
      non_empty_dir.to_string_lossy().into_owned(),
    ]);

    assert_eq!(result.deleted, 2);
    assert_eq!(
      result.deleted_paths,
      vec![
        child_dir.to_string_lossy().into_owned(),
        parent_dir.to_string_lossy().into_owned(),
      ]
    );
    assert!(result.errors.is_empty());
    assert!(!parent_dir.exists());
    assert!(non_empty_dir.exists());
  }

  #[test]
  fn delete_empty_directories_skips_non_empty_and_missing_paths() {
    let dir = tempdir().unwrap();
    let target_dir = dir.path().join("maybe-empty");
    fs::create_dir_all(&target_dir).unwrap();
    fs::write(target_dir.join("new-file.txt"), b"late write").unwrap();

    let result = delete_empty_directories(&[
      target_dir.to_string_lossy().into_owned(),
      dir.path().join("missing").to_string_lossy().into_owned(),
    ]);

    assert_eq!(result.deleted, 0);
    assert!(result.deleted_paths.is_empty());
    assert!(result.errors.is_empty());
    assert!(target_dir.exists());
  }

  #[test]
  fn compact_deletion_targets_removes_covered_paths() {
    let dir = tempdir().unwrap();
    let parent_dir = dir.path().join("parent");
    let child_dir = parent_dir.join("child");
    let covered_file = child_dir.join("file.txt");
    let standalone_file = dir.path().join("standalone.txt");

    fs::create_dir_all(&child_dir).unwrap();
    fs::write(&covered_file, b"data").unwrap();
    fs::write(&standalone_file, b"data").unwrap();

    let result = compact_deletion_targets(
      &[
        covered_file.to_string_lossy().into_owned(),
        standalone_file.to_string_lossy().into_owned(),
      ],
      &[
        parent_dir.to_string_lossy().into_owned(),
        child_dir.to_string_lossy().into_owned(),
      ],
    );

    assert_eq!(
      result.files,
      vec![standalone_file.to_string_lossy().into_owned()]
    );
    assert_eq!(result.dirs, vec![parent_dir.to_string_lossy().into_owned()]);
  }

  #[test]
  fn compact_deletion_targets_keeps_uncovered_paths() {
    let dir = tempdir().unwrap();
    let file_a = dir.path().join("a.txt");
    let file_b = dir.path().join("b.txt");
    let dir_a = dir.path().join("dir_a");
    let dir_b = dir.path().join("dir_b");

    fs::create_dir_all(&dir_a).unwrap();
    fs::create_dir_all(&dir_b).unwrap();
    fs::write(&file_a, b"a").unwrap();
    fs::write(&file_b, b"b").unwrap();

    let mut result = compact_deletion_targets(
      &[
        file_a.to_string_lossy().into_owned(),
        file_b.to_string_lossy().into_owned(),
      ],
      &[
        dir_a.to_string_lossy().into_owned(),
        dir_b.to_string_lossy().into_owned(),
      ],
    );

    result.files.sort();
    result.dirs.sort();

    assert_eq!(
      result.files,
      vec![
        file_a.to_string_lossy().into_owned(),
        file_b.to_string_lossy().into_owned()
      ]
    );
    assert_eq!(
      result.dirs,
      vec![
        dir_a.to_string_lossy().into_owned(),
        dir_b.to_string_lossy().into_owned()
      ]
    );
  }

  #[test]
  fn plan_workspace_empty_directory_cleanup_finds_empty_dirs() {
    let dir = tempdir().unwrap();
    let workspace = dir.path().join("workspace");
    let empty_parent = workspace.join("empty-parent");
    let empty_child = empty_parent.join("leaf");
    let non_empty = workspace.join("non-empty");

    fs::create_dir_all(&empty_child).unwrap();
    fs::create_dir_all(&non_empty).unwrap();
    fs::write(non_empty.join("keep.txt"), b"keep").unwrap();

    let result =
      plan_workspace_empty_directory_cleanup(&workspace.to_string_lossy().into_owned(), &[], &[]);

    assert_eq!(
      result.empty_dirs_to_delete,
      vec![
        empty_parent.to_string_lossy().into_owned(),
        empty_child.to_string_lossy().into_owned(),
      ]
    );
  }

  #[test]
  fn plan_workspace_empty_directory_cleanup_respects_scheduled_deletions() {
    let dir = tempdir().unwrap();
    let workspace = dir.path().join("workspace");
    let parent = workspace.join("parent");
    let child = parent.join("child");
    let file_to_delete = child.join("delete_me.txt");

    fs::create_dir_all(&child).unwrap();
    fs::write(&file_to_delete, b"delete").unwrap();

    let result = plan_workspace_empty_directory_cleanup(
      &workspace.to_string_lossy().into_owned(),
      &[file_to_delete.to_string_lossy().into_owned()],
      &[],
    );

    assert_eq!(
      result.empty_dirs_to_delete,
      vec![
        parent.to_string_lossy().into_owned(),
        child.to_string_lossy().into_owned(),
      ]
    );
  }

  #[test]
  fn plan_workspace_empty_directory_cleanup_skips_excluded_basenames() {
    let dir = tempdir().unwrap();
    let workspace = dir.path().join("workspace");
    let node_modules = workspace.join("node_modules");
    let empty_in_nm = node_modules.join("pkg");

    fs::create_dir_all(&empty_in_nm).unwrap();

    let result =
      plan_workspace_empty_directory_cleanup(&workspace.to_string_lossy().into_owned(), &[], &[]);

    assert!(
      !result
        .empty_dirs_to_delete
        .contains(&node_modules.to_string_lossy().into_owned())
    );
    assert!(
      !result
        .empty_dirs_to_delete
        .contains(&empty_in_nm.to_string_lossy().into_owned())
    );
  }

  #[test]
  fn plan_workspace_empty_directory_cleanup_excludes_children_of_scheduled_dirs() {
    let dir = tempdir().unwrap();
    let workspace = dir.path().join("workspace");
    let scheduled_dir = workspace.join("scheduled");
    let nested_empty = scheduled_dir.join("nested");

    fs::create_dir_all(&nested_empty).unwrap();

    let result = plan_workspace_empty_directory_cleanup(
      &workspace.to_string_lossy().into_owned(),
      &[],
      &[scheduled_dir.to_string_lossy().into_owned()],
    );

    // Children of scheduled dirs are not listed separately because
    // the scheduled parent deletion will remove them.
    assert!(
      !result
        .empty_dirs_to_delete
        .contains(&nested_empty.to_string_lossy().into_owned()),
      "nested empty dir inside scheduled dir should not be listed separately"
    );
    assert!(
      !result
        .empty_dirs_to_delete
        .contains(&scheduled_dir.to_string_lossy().into_owned()),
      "scheduled dir itself should not appear in emptyDirsToDelete"
    );
  }
}
