use std::collections::HashSet;
use std::path::Path;

use crate::repositories::prompt_artifact::{PromptArtifact, read_prompt_artifact};

#[derive(Debug, Clone)]
pub struct FlatFileEntry {
  pub name: String,
  pub dist: Option<PromptArtifact>,
  pub src_zh: Option<PromptArtifact>,
  pub src_en: Option<PromptArtifact>,
}

pub fn read_flat_files(
  src_dir: &str,
  dist_dir: &str,
  global_scope_json: Option<&str>,
) -> Result<Vec<FlatFileEntry>, crate::CliError> {
  let mut entries: Vec<FlatFileEntry> = Vec::new();
  let mut seen: HashSet<String> = HashSet::new();

  let src_path = Path::new(src_dir);
  if src_path.is_dir() {
    scan_source(
      src_path,
      src_path,
      &mut seen,
      &mut entries,
      global_scope_json,
    )?;
  }

  let dist_path = Path::new(dist_dir);
  if dist_path.is_dir() {
    scan_dist(
      dist_path,
      dist_path,
      &mut seen,
      &mut entries,
      global_scope_json,
    )?;
  }

  Ok(entries)
}

fn scan_source(
  root: &Path,
  current: &Path,
  seen: &mut HashSet<String>,
  entries: &mut Vec<FlatFileEntry>,
  global_scope_json: Option<&str>,
) -> Result<(), crate::CliError> {
  for entry in std::fs::read_dir(current).map_err(crate::CliError::IoError)? {
    let entry = entry.map_err(crate::CliError::IoError)?;
    let path = entry.path();
    if path.is_dir() {
      scan_source(root, &path, seen, entries, global_scope_json)?;
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

    let base_name = if file_name.ends_with(".zh.src.mdx") {
      &file_name[..file_name.len() - ".zh.src.mdx".len()]
    } else if file_name.ends_with(".en.src.mdx") {
      &file_name[..file_name.len() - ".en.src.mdx".len()]
    } else if file_name.ends_with(".src.mdx") {
      &file_name[..file_name.len() - ".src.mdx".len()]
    } else {
      continue;
    };

    let full_name = if relative_parent_str.is_empty() {
      base_name.to_string()
    } else {
      format!("{}/{}", relative_parent_str, base_name)
    };

    let artifact = read_prompt_artifact(path.to_str().unwrap_or(""), "source", global_scope_json)
      .map_err(|e| crate::CliError::ConfigError(e))?;

    if let Some(existing) = entries.iter_mut().find(|e| e.name == full_name) {
      if file_name.ends_with(".en.src.mdx") {
        existing.src_en = Some(artifact);
      } else {
        existing.src_zh = Some(artifact);
      }
    } else {
      seen.insert(full_name.clone());
      let mut e = FlatFileEntry {
        name: full_name,
        dist: None,
        src_zh: None,
        src_en: None,
      };
      if file_name.ends_with(".en.src.mdx") {
        e.src_en = Some(artifact);
      } else {
        e.src_zh = Some(artifact);
      }
      entries.push(e);
    }
  }
  Ok(())
}

fn scan_dist(
  root: &Path,
  current: &Path,
  seen: &mut HashSet<String>,
  entries: &mut Vec<FlatFileEntry>,
  global_scope_json: Option<&str>,
) -> Result<(), crate::CliError> {
  for entry in std::fs::read_dir(current).map_err(crate::CliError::IoError)? {
    let entry = entry.map_err(crate::CliError::IoError)?;
    let path = entry.path();
    if path.is_dir() {
      scan_dist(root, &path, seen, entries, global_scope_json)?;
      continue;
    }
    let Some(file_name) = path.file_name().and_then(|s| s.to_str()) else {
      continue;
    };
    if !file_name.ends_with(".mdx") {
      continue;
    }
    let base_name = &file_name[..file_name.len() - ".mdx".len()];

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

    let full_name = if relative_parent_str.is_empty() {
      base_name.to_string()
    } else {
      format!("{}/{}", relative_parent_str, base_name)
    };

    let artifact = read_prompt_artifact(path.to_str().unwrap_or(""), "dist", global_scope_json)
      .map_err(|e| crate::CliError::ConfigError(e))?;

    if let Some(existing) = entries.iter_mut().find(|e| e.name == full_name) {
      existing.dist = Some(artifact);
    } else {
      seen.insert(full_name.clone());
      entries.push(FlatFileEntry {
        name: full_name,
        dist: Some(artifact),
        src_zh: None,
        src_en: None,
      });
    }
  }
  Ok(())
}
