//! Shared helper for detecting project-name collisions across the series
//! directories (`zh`, `en`, …) under a single `aindex/` root.
//!
//! Pre-#199 the same body was implemented in both
//! [`aindex_resolvers`](super::aindex_resolvers) and
//! [`readme`](super::readme); the only difference between the two
//! copies was the error-message prefix (`"Aindex project …"` vs
//! `"Readme project …"`). Centralising here makes the contract one
//! place instead of two and lets either consumer pass its own prefix.

use std::collections::{HashMap, HashSet};
use std::path::Path;

/// Walk every immediate subdirectory under `aindex_dir/<series>` for
/// each `series` in `series_names`, group the project-name basenames
/// by which series each one appeared in, and return an error listing
/// any project name that showed up under more than one series.
///
/// `error_prefix` is plain text and is prepended verbatim to the
/// joined list of conflicting names — typical values are
/// `"Aindex project series name conflict"` or
/// `"Readme project series name conflict"`.
pub fn detect_project_name_conflicts<S: AsRef<str>>(
  aindex_dir: &Path,
  series_names: &[S],
  error_prefix: &str,
) -> Result<(), String> {
  let mut refs_by_project: HashMap<String, Vec<String>> = HashMap::new();

  for series in series_names {
    let series_name = series.as_ref();
    let series_src_dir = aindex_dir.join(series_name);
    if !series_src_dir.is_dir() {
      continue;
    }

    let entries = match std::fs::read_dir(&series_src_dir) {
      Ok(e) => e,
      Err(_) => continue,
    };

    for entry in entries.flatten() {
      if !entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
        continue;
      }
      let project_name = entry.file_name().to_string_lossy().into_owned();
      refs_by_project
        .entry(project_name)
        .or_default()
        .push(series_name.to_string());
    }
  }

  let conflicts: Vec<String> = refs_by_project
    .into_iter()
    .filter(|(_, series_names)| {
      let unique: HashSet<_> = series_names.iter().collect();
      unique.len() > 1
    })
    .map(|(project_name, _)| project_name)
    .collect();

  if conflicts.is_empty() {
    Ok(())
  } else {
    let mut conflicts_sorted = conflicts;
    conflicts_sorted.sort();
    Err(format!("{}: {}", error_prefix, conflicts_sorted.join(", ")))
  }
}

#[cfg(test)]
mod tests {
  use super::detect_project_name_conflicts;
  use std::fs;
  use tempfile::tempdir;

  #[test]
  fn returns_ok_when_no_conflicts() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("zh/projA")).unwrap();
    fs::create_dir_all(dir.path().join("en/projB")).unwrap();

    let result = detect_project_name_conflicts(dir.path(), &["zh", "en"], "Aindex");
    assert!(result.is_ok(), "no overlap should be Ok, got {:?}", result);
  }

  #[test]
  fn detects_single_conflict() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("zh/shared")).unwrap();
    fs::create_dir_all(dir.path().join("en/shared")).unwrap();

    let err = detect_project_name_conflicts(dir.path(), &["zh", "en"], "Test prefix").unwrap_err();
    assert!(err.starts_with("Test prefix: "));
    assert!(err.contains("shared"));
  }

  #[test]
  fn sorts_multiple_conflicts() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("zh/banana")).unwrap();
    fs::create_dir_all(dir.path().join("en/banana")).unwrap();
    fs::create_dir_all(dir.path().join("zh/apple")).unwrap();
    fs::create_dir_all(dir.path().join("en/apple")).unwrap();

    let err = detect_project_name_conflicts(dir.path(), &["zh", "en"], "Prefix").unwrap_err();
    assert_eq!(err, "Prefix: apple, banana");
  }

  #[test]
  fn ignores_files_among_project_dirs() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("zh")).unwrap();
    fs::create_dir_all(dir.path().join("en")).unwrap();
    // `notes.md` at the series root is not a project — it must be
    // ignored, not produce a phantom "notes.md" key.
    fs::write(dir.path().join("zh/notes.md"), b"x").unwrap();
    fs::write(dir.path().join("en/notes.md"), b"x").unwrap();

    let result = detect_project_name_conflicts(dir.path(), &["zh", "en"], "Prefix");
    assert!(result.is_ok(), "files at the series root must be ignored, got {:?}", result);
  }

  #[test]
  fn missing_series_dir_is_skipped() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("zh/onlyZh")).unwrap();
    // No "en" directory at all.

    let result = detect_project_name_conflicts(dir.path(), &["zh", "en"], "Prefix");
    assert!(result.is_ok(), "missing series dir is not a conflict, got {:?}", result);
  }
}
