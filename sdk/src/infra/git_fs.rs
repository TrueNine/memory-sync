use std::path::{Path, PathBuf};

/// Resolve the `info/` directory from a project directory using libgit2.
///
/// Properly handles:
/// - Regular repos (`.git` is a directory)
/// - Gitlinked submodules/worktrees (`.git` is a file containing `gitdir:`)
/// - Bare repos (the directory itself is the git dir)
///
/// Implements #345 — replaces manual `.git` file/directory parsing with `git2`.
pub fn resolve_git_info_dir(project_dir: &Path) -> Option<PathBuf> {
  let repo = git2::Repository::open(project_dir).ok()?;
  Some(repo.path().join("info"))
}

const SKIP_DIRS: &[&str] = &[
  ".git",
  "node_modules",
  ".turbo",
  "dist",
  "build",
  "out",
  ".cache",
];

/// Walks the filesystem tree under `root_dir` up to `max_depth` deep and returns
/// all directories that contain a valid git repository (excluding the root itself).
///
/// Uses `git2::Repository::open()` for detection — handles bare repos,
/// linked worktrees, and gitlinked submodules in addition to regular `.git` directories.
///
/// Implements #345 — replaces filesystem `.git` detection with libgit2.
pub fn find_all_git_repos(root_dir: &Path, max_depth: usize) -> Vec<PathBuf> {
  let mut results = Vec::new();

  fn walk(dir: &Path, root_dir: &Path, depth: usize, max_depth: usize, results: &mut Vec<PathBuf>) {
    if depth > max_depth {
      return;
    }

    let entries = match std::fs::read_dir(dir) {
      Ok(e) => e,
      Err(_) => return,
    };

    let mut subdirs = Vec::new();

    for entry in entries.flatten() {
      let name = entry.file_name();
      let name_str = name.to_string_lossy();
      if let Ok(ft) = entry.file_type()
        && ft.is_dir()
        && !SKIP_DIRS.contains(&name_str.as_ref())
      {
        subdirs.push(entry.path());
      }
    }

    // git2::Repository::open() is the sole detection mechanism — it handles
    // bare repos, linked worktrees, and gitlinked submodules. Implements #345.
    if git2::Repository::open(dir).is_ok() && dir != root_dir {
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
    // Initialize a real git repo via git2 (#345)
    let _repo = git2::Repository::init(tmp.path()).unwrap();
    let dot_git = tmp.path().join(".git");

    let result = resolve_git_info_dir(tmp.path());
    assert_eq!(
      result,
      Some(dot_git.join("info")),
      "regular repo: {:?}",
      result
    );
  }

  #[test]
  fn test_resolve_git_info_dir_for_gitlink() {
    let tmp = TempDir::new().unwrap();
    let actual_git = tmp.path().join("actual-git");
    let repo = git2::Repository::init(&actual_git).unwrap();
    let dot_git = tmp.path().join(".git");
    // Write a gitlink pointing to the real git dir
    let git_dir = repo.path().canonicalize().unwrap();
    fs::write(&dot_git, format!("gitdir: {}\n", git_dir.display())).unwrap();

    let result = resolve_git_info_dir(tmp.path());
    assert!(result.is_some(), "gitlink should resolve");
    let result_path = result.unwrap();
    assert_eq!(
      result_path.file_name().unwrap().to_string_lossy(),
      "info",
      "should end with info dir"
    );
  }

  #[test]
  fn test_resolve_git_info_dir_for_relative_gitlink() {
    let tmp = TempDir::new().unwrap();
    // Create the real git dir inside tmp so the relative path resolves correctly
    let real_repo_dir = tmp.path().join("worktrees").join("feature");
    fs::create_dir_all(&real_repo_dir).unwrap();
    let _repo = git2::Repository::init(&real_repo_dir).unwrap();

    // Put .git file in a subdirectory of tmp, pointing with a relative path
    let sub_dir = tmp.path().join("sub");
    fs::create_dir_all(&sub_dir).unwrap();
    let dot_git = sub_dir.join(".git");
    fs::write(&dot_git, "gitdir: ../worktrees/feature/.git\n").unwrap();

    let result = resolve_git_info_dir(&sub_dir);
    assert!(
      result.is_some(),
      "relative gitlink should resolve: {:?}",
      result
    );
    let result_path = result.unwrap();
    assert_eq!(
      result_path.file_name().unwrap().to_string_lossy(),
      "info",
      "should end with info dir"
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
    fs::create_dir_all(&child).unwrap();
    // Initialize both root and child as real git repos (#345)
    let _root_repo = git2::Repository::init(root).unwrap();
    let _child_repo = git2::Repository::init(&child).unwrap();

    let result = find_all_git_repos(root, 5);
    assert_eq!(
      result.len(),
      1,
      "should find exactly 1 nested repo (root excluded)"
    );
    assert_eq!(result[0], child);
  }

  #[test]
  fn test_find_all_git_repos_excludes_root() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    // Initialize root as a real git repo (#345)
    let _repo = git2::Repository::init(root).unwrap();

    let result = find_all_git_repos(root, 5);
    assert!(
      result.is_empty(),
      "root should be excluded even when it is a repo: {result:?}"
    );
  }

  #[test]
  fn test_find_all_git_repos_skips_skip_dirs() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    // node_modules/some-lib/.git is never walked into because node_modules is in SKIP_DIRS
    let node_modules = root.join("node_modules").join("some-lib");
    fs::create_dir_all(&node_modules).unwrap();
    let _repo = git2::Repository::init(&node_modules).unwrap();

    let result = find_all_git_repos(root, 5);
    assert!(
      result.is_empty(),
      "repos inside SKIP_DIRS should not be found: {result:?}"
    );
  }

  #[test]
  fn test_find_all_git_repos_respects_max_depth() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    let deep = root.join("a").join("b").join("c").join("d");
    fs::create_dir_all(&deep).unwrap();
    // Initialize deep as a real git repo (#345)
    let _repo = git2::Repository::init(&deep).unwrap();

    let result = find_all_git_repos(root, 3);
    assert!(
      result.is_empty(),
      "depth 3 should not find depth 4 repo: {result:?}"
    );

    let result = find_all_git_repos(root, 4);
    assert_eq!(result.len(), 1, "depth 4 should find repo");
    assert_eq!(result[0], deep);
  }

  #[test]
  fn test_find_all_git_repos_detects_bare_repo() {
    // A bare repo doesn't have a .git subdirectory — the directory itself is
    // the git dir. libgit2 detects this via HEAD presence. Implements #345.
    let tmp = TempDir::new().unwrap();
    let root = tmp.path();
    let bare = root.join("bare-repo");
    fs::create_dir_all(&bare).unwrap();
    // Write a minimal HEAD file to simulate a bare repo
    fs::write(bare.join("HEAD"), "ref: refs/heads/main\n").unwrap();
    fs::write(bare.join("config"), "[core]\n\tbare = true\n").unwrap();
    fs::create_dir_all(bare.join("objects")).unwrap();
    fs::create_dir_all(bare.join("refs").join("heads")).unwrap();

    // git2::Repository::open() should detect the bare repo
    let repo_result = git2::Repository::open(&bare);
    assert!(repo_result.is_ok(), "bare repo should be detected by git2");
  }
}
