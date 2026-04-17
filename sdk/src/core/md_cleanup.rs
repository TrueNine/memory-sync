use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MdCleanupResult {
  pub success: bool,
  pub description: String,
  pub modified_files: Vec<String>,
  pub skipped_files: Vec<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
}

fn detect_line_ending(content: &str) -> &str {
  if content.contains("\r\n") {
    "\r\n"
  } else {
    "\n"
  }
}

fn clean_markdown_content(content: &str) -> String {
  let line_ending = detect_line_ending(content);
  let lines: Vec<&str> = if content.contains("\r\n") {
    content.split("\r\n").collect()
  } else {
    content.split('\n').collect()
  };

  let trimmed_lines: Vec<String> = lines
    .into_iter()
    .map(|line| {
      let trimmed = line.trim_end_matches(|c: char| c == ' ' || c == '\t');
      trimmed.to_string()
    })
    .collect();

  let mut result: Vec<String> = Vec::new();
  let mut consecutive_blank_count = 0;

  for line in trimmed_lines {
    if line.is_empty() {
      consecutive_blank_count += 1;
      if consecutive_blank_count <= 2 {
        result.push(line);
      }
    } else {
      consecutive_blank_count = 0;
      result.push(line);
    }
  }

  result.join(line_ending)
}

fn process_markdown_file(
  file_path: &Path,
  modified_files: &mut Vec<String>,
  skipped_files: &mut Vec<String>,
  errors: &mut Vec<(String, String)>,
  dry_run: bool,
) {
  let content = match std::fs::read_to_string(file_path) {
    Ok(c) => c,
    Err(err) => {
      errors.push((file_path.to_string_lossy().into_owned(), err.to_string()));
      return;
    }
  };

  let cleaned = clean_markdown_content(&content);

  if content == cleaned {
    skipped_files.push(file_path.to_string_lossy().into_owned());
    return;
  }

  if !dry_run {
    if let Err(err) = std::fs::write(file_path, &cleaned) {
      errors.push((file_path.to_string_lossy().into_owned(), err.to_string()));
      return;
    }
  }

  modified_files.push(file_path.to_string_lossy().into_owned());
}

fn process_directory(
  dir: &Path,
  modified_files: &mut Vec<String>,
  skipped_files: &mut Vec<String>,
  errors: &mut Vec<(String, String)>,
  dry_run: bool,
) {
  let entries = match std::fs::read_dir(dir) {
    Ok(e) => e,
    Err(err) => {
      errors.push((dir.to_string_lossy().into_owned(), err.to_string()));
      return;
    }
  };

  for entry in entries.flatten() {
    let entry_path = entry.path();
    let file_type = match entry.file_type() {
      Ok(ft) => ft,
      Err(err) => {
        errors.push((entry_path.to_string_lossy().into_owned(), err.to_string()));
        continue;
      }
    };

    if file_type.is_dir() {
      process_directory(&entry_path, modified_files, skipped_files, errors, dry_run);
    } else if file_type.is_file() {
      if let Some(name) = entry_path.file_name() {
        let name_str = name.to_string_lossy();
        if name_str.ends_with(".md") {
          process_markdown_file(&entry_path, modified_files, skipped_files, errors, dry_run);
        }
      }
    }
  }
}

pub fn perform_md_cleanup(dirs: &[String], dry_run: bool) -> MdCleanupResult {
  let mut modified_files: Vec<String> = Vec::new();
  let mut skipped_files: Vec<String> = Vec::new();
  let mut errors: Vec<(String, String)> = Vec::new();

  for dir in dirs {
    let dir_path = Path::new(dir);
    if !dir_path.exists() {
      continue;
    }
    process_directory(
      dir_path,
      &mut modified_files,
      &mut skipped_files,
      &mut errors,
      dry_run,
    );
  }

  let has_errors = !errors.is_empty();

  MdCleanupResult {
    success: !has_errors,
    description: if dry_run {
      format!(
        "Would modify {} files, skip {} files",
        modified_files.len(),
        skipped_files.len()
      )
    } else {
      format!(
        "Modified {} files, skipped {} files",
        modified_files.len(),
        skipped_files.len()
      )
    },
    modified_files,
    skipped_files,
    error: if has_errors {
      Some(format!("{} errors occurred during cleanup", errors.len()))
    } else {
      None
    },
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;
  use tempfile::tempdir;

  #[test]
  fn trims_trailing_whitespace_and_collapses_blank_lines() {
    let content = "line1   \nline2\t \n\n\n\nline3\n";
    let cleaned = clean_markdown_content(content);
    assert_eq!(cleaned, "line1\nline2\n\n\nline3\n");
  }

  #[test]
  fn preserves_crlf_line_endings() {
    let content = "line1   \r\nline2\r\n\r\n\r\n\r\nline3\r\n";
    let cleaned = clean_markdown_content(content);
    assert_eq!(cleaned, "line1\r\nline2\r\n\r\n\r\nline3\r\n");
  }

  #[test]
  fn keeps_up_to_two_consecutive_blank_lines() {
    let content = "a\n\n\n\n\nb\n";
    let cleaned = clean_markdown_content(content);
    assert_eq!(cleaned, "a\n\n\nb\n");
  }

  #[test]
  fn processes_md_files_in_directory() {
    let dir = tempdir().unwrap();
    let file_path = dir.path().join("test.md");
    fs::write(&file_path, "hello   \n\n\n\nworld\n").unwrap();

    let result = perform_md_cleanup(&[dir.path().to_string_lossy().into_owned()], false);

    assert!(result.success);
    assert_eq!(result.modified_files.len(), 1);
    assert_eq!(result.skipped_files.len(), 0);

    let content = fs::read_to_string(&file_path).unwrap();
    assert_eq!(content, "hello\n\n\nworld\n");
  }

  #[test]
  fn skips_files_with_no_changes() {
    let dir = tempdir().unwrap();
    let file_path = dir.path().join("test.md");
    fs::write(&file_path, "hello\n\n\nworld\n").unwrap();

    let result = perform_md_cleanup(&[dir.path().to_string_lossy().into_owned()], false);

    assert!(result.success);
    assert_eq!(result.modified_files.len(), 0);
    assert_eq!(result.skipped_files.len(), 1);
  }

  #[test]
  fn dry_run_does_not_modify_files() {
    let dir = tempdir().unwrap();
    let file_path = dir.path().join("test.md");
    fs::write(&file_path, "hello   \nworld\n").unwrap();

    let result = perform_md_cleanup(&[dir.path().to_string_lossy().into_owned()], true);

    assert!(result.success);
    assert_eq!(result.modified_files.len(), 1);

    let content = fs::read_to_string(&file_path).unwrap();
    assert_eq!(content, "hello   \nworld\n");
  }

  #[test]
  fn ignores_non_md_files() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("test.txt"), "hello   \nworld\n").unwrap();

    let result = perform_md_cleanup(&[dir.path().to_string_lossy().into_owned()], false);

    assert!(result.success);
    assert_eq!(result.modified_files.len(), 0);
    assert_eq!(result.skipped_files.len(), 0);
  }

  #[test]
  fn skips_missing_directories() {
    let result = perform_md_cleanup(&["/nonexistent/path".to_string()], false);
    assert!(result.success);
    assert_eq!(result.modified_files.len(), 0);
    assert_eq!(result.skipped_files.len(), 0);
  }
}
