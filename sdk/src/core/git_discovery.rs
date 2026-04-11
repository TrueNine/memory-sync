use std::fs;
use std::path::{Path, PathBuf};

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/// Resolves the actual `.git/info` directory for a given project path.
/// Handles both regular git repos (`.git` is a directory) and submodules/worktrees
/// (`.git` is a file with `gitdir:` pointer). Returns `None` if no valid git info
/// directory can be resolved.
pub fn resolve_git_info_dir(project_dir: &Path) -> Option<PathBuf> {
  let dot_git = project_dir.join(".git");
  if !dot_git.exists() {
    return None;
  }

  let metadata = fs::symlink_metadata(&dot_git).ok()?;
  if metadata.is_dir() {
    return Some(dot_git.join("info"));
  }

  if metadata.is_file() {
    let content = fs::read_to_string(&dot_git).ok()?;
    for line in content.lines() {
      let line = line.trim();
      if let Some(gitdir) = line.strip_prefix("gitdir:") {
        let gitdir = Path::new(gitdir.trim());
        let resolved = if gitdir.is_absolute() {
          gitdir.to_path_buf()
        } else {
          project_dir.join(gitdir)
        };
        return Some(resolved.join("info"));
      }
    }
  }

  None
}

const SKIP_DIRS: &[&str] = &["node_modules", ".turbo", "dist", "build", "out", ".cache"];

/// Recursively discovers all `.git` entries (directories or files) under a given root,
/// skipping common non-source directories. Returns absolute paths of directories
/// containing a `.git` entry. The `root_dir` itself is excluded from results.
pub fn find_all_git_repos(root_dir: &Path, max_depth: usize) -> Vec<PathBuf> {
  let mut results = Vec::new();

  fn walk(dir: &Path, root_dir: &Path, depth: usize, max_depth: usize, results: &mut Vec<PathBuf>) {
    if depth > max_depth {
      return;
    }

    let entries = match fs::read_dir(dir) {
      Ok(e) => e,
      Err(_) => return,
    };

    let mut has_git = false;
    let mut subdirs = Vec::new();

    for entry in entries.flatten() {
      let name = entry.file_name();
      let name_str = name.to_string_lossy();
      if name_str == ".git" {
        has_git = true;
        continue;
      }
      if let Ok(ft) = entry.file_type()
        && ft.is_dir()
        && !SKIP_DIRS.contains(&name_str.as_ref())
      {
        subdirs.push(entry.path());
      }
    }

    if has_git && dir != root_dir {
      results.push(dir.to_path_buf());
    }

    for subdir in subdirs {
      walk(&subdir, root_dir, depth + 1, max_depth, results);
    }
  }

  walk(root_dir, root_dir, 0, max_depth, &mut results);
  results
}

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
// NAPI binding layer
// ---------------------------------------------------------------------------

#[cfg(feature = "napi")]
mod napi_binding {
  use napi_derive::napi;
  use std::path::Path;

  #[napi]
  pub fn resolve_git_info_dir(project_dir: String) -> Option<String> {
    super::resolve_git_info_dir(Path::new(&project_dir)).map(|p| p.to_string_lossy().into_owned())
  }

  #[napi]
  pub fn find_all_git_repos(root_dir: String, max_depth: Option<i32>) -> Vec<String> {
    let depth = max_depth.map(|d| d.max(0) as usize).unwrap_or(5);
    super::find_all_git_repos(Path::new(&root_dir), depth)
      .into_iter()
      .map(|p| p.to_string_lossy().into_owned())
      .collect()
  }

  #[napi]
  pub fn find_git_module_info_dirs(dot_git_dir: String) -> Vec<String> {
    super::find_git_module_info_dirs(Path::new(&dot_git_dir))
      .into_iter()
      .map(|p| p.to_string_lossy().into_owned())
      .collect()
  }
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
  fn test_resolve_git_info_dir_for_regular_repo() {
    let tmp = TempDir::new().unwrap();
    let dot_git = tmp.path().join(".git");
    fs::create_dir_all(&dot_git).unwrap();

    let result = resolve_git_info_dir(tmp.path());
    assert_eq!(result, Some(dot_git.join("info")));
  }

  #[test]
  fn test_resolve_git_info_dir_for_gitlink() {
    let tmp = TempDir::new().unwrap();
    let dot_git = tmp.path().join(".git");
    fs::write(&dot_git, "gitdir: /absolute/path/to/git\n").unwrap();

    let result = resolve_git_info_dir(tmp.path());
    assert_eq!(result, Some(PathBuf::from("/absolute/path/to/git/info")));
  }

  #[test]
  fn test_resolve_git_info_dir_for_relative_gitlink() {
    let tmp = TempDir::new().unwrap();
    let dot_git = tmp.path().join(".git");
    fs::write(&dot_git, "gitdir: ../.git/modules/foo\n").unwrap();

    let result = resolve_git_info_dir(tmp.path());
    assert_eq!(
      result,
      Some(
        tmp
          .path()
          .join("..")
          .join(".git")
          .join("modules")
          .join("foo")
          .join("info")
          .canonicalize()
          .unwrap_or_else(|_| tmp
            .path()
            .join("..")
            .join(".git")
            .join("modules")
            .join("foo")
            .join("info"))
      )
    );
  }

  #[test]
  fn test_resolve_git_info_dir_missing() {
    let tmp = TempDir::new().unwrap();
    assert_eq!(resolve_git_info_dir(tmp.path()), None);
  }

  #[test]
  fn test_find_all_git_repos_finds_nested() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    let child = root.join("packages").join("app");
    fs::create_dir_all(root.join(".git")).unwrap();
    fs::create_dir_all(child.join(".git")).unwrap();

    let result = find_all_git_repos(root, 5);
    assert_eq!(result.len(), 1);
    assert_eq!(result[0], child);
  }

  #[test]
  fn test_find_all_git_repos_excludes_root() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    fs::create_dir_all(root.join(".git")).unwrap();

    let result = find_all_git_repos(root, 5);
    assert!(result.is_empty());
  }

  #[test]
  fn test_find_all_git_repos_skips_skip_dirs() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    let node_modules = root.join("node_modules").join("some-lib");
    fs::create_dir_all(node_modules.join(".git")).unwrap();

    let result = find_all_git_repos(root, 5);
    assert!(result.is_empty());
  }

  #[test]
  fn test_find_all_git_repos_respects_max_depth() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    let deep = root.join("a").join("b").join("c").join("d");
    fs::create_dir_all(deep.join(".git")).unwrap();

    let result = find_all_git_repos(root, 3);
    assert!(result.is_empty());

    let result = find_all_git_repos(root, 4);
    assert_eq!(result.len(), 1);
    assert_eq!(result[0], deep);
  }

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
