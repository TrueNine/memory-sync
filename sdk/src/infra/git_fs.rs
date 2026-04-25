use std::fs;
use std::path::{Path, PathBuf};

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
    assert!(result.is_some());
    let result_str = result.as_ref().unwrap().to_string_lossy().replace('\\', "/");
    // On Windows, absolute paths starting with / get a drive letter prefix
    let result_normalized = result_str
      .strip_prefix("C:")
      .or_else(|| result_str.strip_prefix("c:"))
      .unwrap_or(&result_str);
    assert_eq!(result_normalized, "/absolute/path/to/git/info");
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
}
