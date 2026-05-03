use std::collections::HashMap;
use std::path::Path;

use crate::repositories::prompt_artifact::{PromptArtifact, read_prompt_artifact};

#[derive(Debug, Clone)]
pub struct FlatFileEntry {
  pub name: String,
  pub compiled: Option<PromptArtifact>,
  pub src_zh: Option<PromptArtifact>,
  pub src_en: Option<PromptArtifact>,
}

pub fn read_flat_files(
  dir: &str,
  global_scope_json: Option<&str>,
) -> Result<Vec<FlatFileEntry>, crate::CliError> {
  let mut entries: Vec<FlatFileEntry> = Vec::new();
  // #253 replaces linear name lookup with an index so adding localized
  // variants does not degenerate into an O(n²) walk over `entries`.
  let mut by_name: HashMap<String, usize> = HashMap::new();

  let dir_path = Path::new(dir);
  if dir_path.is_dir() {
    scan_directory(
      dir_path,
      dir_path,
      &mut by_name,
      &mut entries,
      global_scope_json,
    )?;
  }

  Ok(entries)
}

fn scan_directory(
  root: &Path,
  current: &Path,
  by_name: &mut HashMap<String, usize>,
  entries: &mut Vec<FlatFileEntry>,
  global_scope_json: Option<&str>,
) -> Result<(), crate::CliError> {
  for entry in std::fs::read_dir(current).map_err(crate::CliError::IoError)? {
    let entry = entry.map_err(crate::CliError::IoError)?;
    let path = entry.path();
    if path.is_dir() {
      scan_directory(root, &path, by_name, entries, global_scope_json)?;
      continue;
    }
    let Some(file_name) = path.file_name().and_then(|s| s.to_str()) else {
      continue;
    };

    let relative_parent = path
      .parent()
      .unwrap_or(root)
      .strip_prefix(root)
      .unwrap_or(Path::new(""));
    let relative_parent_str = if relative_parent.as_os_str().is_empty() {
      ""
    } else {
      relative_parent.to_str().unwrap_or("")
    };

    let (base_name, is_zh_source, is_en_source) =
      if let Some(stripped) = file_name.strip_suffix(".zh.src.mdx") {
        (stripped, true, false)
      } else if let Some(stripped) = file_name.strip_suffix(".en.src.mdx") {
        (stripped, false, true)
      } else if let Some(stripped) = file_name.strip_suffix(".src.mdx") {
        (stripped, true, false)
      } else if file_name.ends_with(".cn.mdx") {
        continue;
      } else if let Some(stripped) = file_name.strip_suffix(".mdx") {
        (stripped, false, false)
      } else {
        continue;
      };

    let full_name = if relative_parent_str.is_empty() {
      base_name.to_string()
    } else {
      format!("{}/{}", relative_parent_str, base_name)
    };

    let artifact = read_prompt_artifact(
      path.to_str().unwrap_or(""),
      if is_zh_source || is_en_source {
        "source"
      } else {
        "dist"
      },
      global_scope_json,
    )
    .map_err(crate::CliError::ConfigError)?;

    if let Some(&idx) = by_name.get(&full_name) {
      let existing = &mut entries[idx];
      if is_zh_source {
        existing.src_zh = Some(artifact);
      } else if is_en_source {
        existing.src_en = Some(artifact);
      } else {
        existing.compiled = Some(artifact);
      }
    } else {
      by_name.insert(full_name.clone(), entries.len());
      let mut e = FlatFileEntry {
        name: full_name,
        compiled: None,
        src_zh: None,
        src_en: None,
      };
      if is_zh_source {
        e.src_zh = Some(artifact);
      } else if is_en_source {
        e.src_en = Some(artifact);
      } else {
        e.compiled = Some(artifact);
      }
      entries.push(e);
    }
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;
  use tempfile::tempdir;

  #[test]
  fn regression_issue_253_read_flat_files_keeps_localized_variants_grouped() {
    let temp_dir = tempdir().unwrap();
    let rules_dir = temp_dir.path().join("rules").join("nested");
    fs::create_dir_all(&rules_dir).unwrap();

    fs::write(rules_dir.join("alpha.zh.src.mdx"), "zh source").unwrap();
    fs::write(rules_dir.join("alpha.en.src.mdx"), "en source").unwrap();
    fs::write(rules_dir.join("alpha.mdx"), "compiled").unwrap();

    let entries = read_flat_files(temp_dir.path().join("rules").to_str().unwrap(), None).unwrap();

    assert_eq!(entries.len(), 1);
    let entry = &entries[0];
    assert_eq!(entry.name, "nested/alpha");
    assert!(entry.src_zh.is_some());
    assert!(entry.src_en.is_some());
    assert!(entry.compiled.is_some());
  }
}
