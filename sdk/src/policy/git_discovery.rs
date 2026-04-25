pub use crate::infra::git_fs::{find_all_git_repos, resolve_git_info_dir};

use std::fs;
use std::path::{Path, PathBuf};

/// Scans `.git/modules/` directory recursively to find all submodule `info/` dirs.
/// Handles nested submodules (modules within modules). Returns absolute paths of
/// `info/` directories.
pub fn find_git_module_info_dirs(dot_git_dir: &Path) -> Vec<PathBuf> {
  let modules_dir = dot_git_dir.join("modules");
  if !modules_dir.is_dir() {
    return Vec::new();
  }

  let mut results = Vec::new();

  fn walk(dir: &Path, results: &mut Vec<PathBuf>) {
    let entries = match fs::read_dir(dir) {
      Ok(e) => e,
      Err(_) => return,
    };

    let mut has_info = false;
    let mut nested_modules = None;

    for entry in entries.flatten() {
      let name = entry.file_name();
      let name_str = name.to_string_lossy();
      if name_str == "info"
        && let Ok(ft) = entry.file_type()
        && ft.is_dir()
      {
        has_info = true;
      } else if name_str == "modules"
        && let Ok(ft) = entry.file_type()
        && ft.is_dir()
      {
        nested_modules = Some(entry.path());
      }
    }

    if has_info {
      results.push(dir.join("info"));
    }

    if let Some(nested) = nested_modules {
      let sub_entries = match fs::read_dir(&nested) {
        Ok(e) => e,
        Err(_) => return,
      };
      for entry in sub_entries.flatten() {
        if let Ok(ft) = entry.file_type()
          && ft.is_dir()
        {
          walk(&entry.path(), results);
        }
      }
    }
  }

  let top_entries = match fs::read_dir(&modules_dir) {
    Ok(e) => e,
    Err(_) => return results,
  };

  for entry in top_entries.flatten() {
    if let Ok(ft) = entry.file_type()
      && ft.is_dir()
    {
      walk(&entry.path(), &mut results);
    }
  }

  results
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;
  use tempfile::TempDir;

  #[test]
  fn test_find_git_module_info_dirs_finds_submodules() {
    let tmp = TempDir::new().unwrap();
    let dot_git = tmp.path().join(".git");
    let module_info = dot_git.join("modules").join("sub").join("info");
    fs::create_dir_all(&module_info).unwrap();

    let result = find_git_module_info_dirs(&dot_git);
    assert_eq!(result.len(), 1);
    assert_eq!(result[0], module_info);
  }

  #[test]
  fn test_find_git_module_info_dirs_finds_nested_submodules() {
    let tmp = TempDir::new().unwrap();
    let dot_git = tmp.path().join(".git");
    let nested_info = dot_git
      .join("modules")
      .join("parent")
      .join("modules")
      .join("child")
      .join("info");
    fs::create_dir_all(&nested_info).unwrap();

    let result = find_git_module_info_dirs(&dot_git);
    assert_eq!(result.len(), 1);
    assert_eq!(result[0], nested_info);
  }

  #[test]
  fn test_find_git_module_info_dirs_empty_when_no_modules() {
    let tmp = TempDir::new().unwrap();
    let dot_git = tmp.path().join(".git");
    fs::create_dir_all(&dot_git).unwrap();

    let result = find_git_module_info_dirs(&dot_git);
    assert!(result.is_empty());
  }
}
