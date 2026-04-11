use std::path::{Path, PathBuf};

pub fn is_directory_structure_mismatch_error(error: &str) -> bool {
  let normalized = error.to_lowercase();
  normalized.contains("enotdir")
    || normalized.contains("not a directory")
    || normalized.contains("eexist")
    || normalized.contains("file exists")
}

pub fn find_blocking_non_directory_path(expected_dir_path: &str) -> Option<String> {
  // If the path itself does not exist, we still want to walk up from the deepest component.
  // Use the normalized path for segment walk.
  let walk_path = Path::new(expected_dir_path);

  let mut current = if let Some(parent) = walk_path.parent() {
    parent.to_path_buf()
  } else {
    return None;
  };

  for component in walk_path.components() {
    if let std::path::Component::Normal(_) = component {
      let segment_path = current.join(component.as_os_str());
      if !segment_path.exists() {
        current = segment_path;
        continue;
      }
      match std::fs::symlink_metadata(&segment_path) {
        Ok(meta) if !meta.is_dir() => return Some(segment_path.to_string_lossy().into_owned()),
        Ok(_) => {
          current = segment_path;
          continue;
        }
        Err(_) => return None,
      }
    } else {
      // Prefix / RootDir handling: keep current as the accumulating base
      if let std::path::Component::RootDir = component {
        current = PathBuf::from(std::path::MAIN_SEPARATOR_STR);
      } else if let std::path::Component::Prefix(prefix) = component {
        current = PathBuf::from(prefix.as_os_str());
      }
    }
  }

  None
}

pub fn resolve_blocking_file_path(path: &str, target_kind: &str, error: &str) -> Option<String> {
  if !is_directory_structure_mismatch_error(error) {
    return None;
  }
  let expected_dir_path = if target_kind == "file" {
    Path::new(path).parent()?.to_string_lossy().into_owned()
  } else {
    path.to_string()
  };
  find_blocking_non_directory_path(&expected_dir_path)
}

pub fn remove_blocking_file(blocking_path: &str) -> Result<bool, String> {
  let path = Path::new(blocking_path);
  if !path.exists() {
    return Ok(false);
  }
  match std::fs::symlink_metadata(path) {
    Ok(meta) if meta.is_dir() => Ok(false),
    Ok(_) => std::fs::remove_file(path)
      .map(|_| true)
      .map_err(|e| e.to_string()),
    Err(e) => Err(e.to_string()),
  }
}

#[cfg(feature = "napi")]
mod napi_binding {
  use napi_derive::napi;

  #[napi(js_name = "isDirectoryStructureMismatchError")]
  pub fn is_directory_structure_mismatch_error_binding(error: String) -> bool {
    super::is_directory_structure_mismatch_error(&error)
  }

  #[napi(js_name = "findBlockingNonDirectoryPath")]
  pub fn find_blocking_non_directory_path_binding(expected_dir_path: String) -> Option<String> {
    super::find_blocking_non_directory_path(&expected_dir_path)
  }

  #[napi(js_name = "resolveBlockingFilePath")]
  pub fn resolve_blocking_file_path_binding(
    path: String,
    target_kind: String,
    error: String,
  ) -> Option<String> {
    super::resolve_blocking_file_path(&path, &target_kind, &error)
  }

  #[napi(js_name = "removeBlockingFile")]
  pub fn remove_blocking_file_binding(blocking_path: String) -> napi::Result<bool> {
    super::remove_blocking_file(&blocking_path).map_err(|e| napi::Error::from_reason(e))
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;
  use tempfile::tempdir;

  #[test]
  fn detects_mismatch_errors() {
    assert!(is_directory_structure_mismatch_error(
      "ENOTDIR: not a directory"
    ));
    assert!(is_directory_structure_mismatch_error(
      "EEXIST: file already exists"
    ));
    assert!(!is_directory_structure_mismatch_error(
      "ENOENT: no such file"
    ));
  }

  #[test]
  fn finds_blocking_file_in_directory_path() {
    let dir = tempdir().unwrap();
    let blocking_file = dir.path().join("blocking.txt");
    fs::write(&blocking_file, "block").unwrap();
    let target_dir = dir.path().join("blocking.txt").join("nested");

    let result = find_blocking_non_directory_path(&target_dir.to_string_lossy());
    assert_eq!(result, Some(blocking_file.to_string_lossy().into_owned()));
  }

  #[test]
  fn resolve_blocking_for_file_target() {
    let dir = tempdir().unwrap();
    let blocking_file = dir.path().join("blocking.txt");
    fs::write(&blocking_file, "block").unwrap();
    let target_file = dir.path().join("blocking.txt").join("file.txt");

    let result = resolve_blocking_file_path(&target_file.to_string_lossy(), "file", "ENOTDIR");
    assert_eq!(result, Some(blocking_file.to_string_lossy().into_owned()));
  }

  #[test]
  fn remove_blocking_file_deletes_file() {
    let dir = tempdir().unwrap();
    let blocking_file = dir.path().join("blocking.txt");
    fs::write(&blocking_file, "block").unwrap();

    assert!(remove_blocking_file(&blocking_file.to_string_lossy()).unwrap());
    assert!(!blocking_file.exists());
  }

  #[test]
  fn remove_blocking_file_skips_directory() {
    let dir = tempdir().unwrap();
    let blocking_dir = dir.path().join("blocking_dir");
    fs::create_dir(&blocking_dir).unwrap();

    assert!(!remove_blocking_file(&blocking_dir.to_string_lossy()).unwrap());
    assert!(blocking_dir.exists());
  }
}
