use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::core::desk_paths::{compact_deletion_targets, delete_targets};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDistCleanupResult {
  pub success: bool,
  pub description: String,
  pub deleted_files: Vec<String>,
  pub deleted_dirs: Vec<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
}

fn has_source_prompt_extension(file_name: &str) -> bool {
  file_name.ends_with(".src.mdx")
}

fn should_retain_compiled_skill_file(file_name: &str) -> bool {
  file_name.ends_with(".mdx") && !has_source_prompt_extension(file_name)
}

fn collect_cleanup_plan(
  current_dir: &Path,
  files_to_delete: &mut Vec<String>,
  dirs_to_delete: &mut Vec<String>,
) -> bool {
  let entries = match std::fs::read_dir(current_dir) {
    Ok(entries) => entries,
    Err(_) => return false,
  };

  let mut has_retained_entries = false;

  for entry in entries.flatten() {
    let entry_path = entry.path();
    let file_type = match entry.file_type() {
      Ok(ft) => ft,
      Err(_) => {
        has_retained_entries = true;
        continue;
      }
    };

    if file_type.is_dir() {
      let child_will_be_empty = collect_cleanup_plan(&entry_path, files_to_delete, dirs_to_delete);
      if child_will_be_empty {
        dirs_to_delete.push(entry_path.to_string_lossy().into_owned());
      } else {
        has_retained_entries = true;
      }
      continue;
    }

    if !file_type.is_file() {
      has_retained_entries = true;
      continue;
    }

    let file_name = entry.file_name();
    let file_name_str = file_name.to_string_lossy();
    if should_retain_compiled_skill_file(&file_name_str) {
      has_retained_entries = true;
      continue;
    }

    files_to_delete.push(entry_path.to_string_lossy().into_owned());
  }

  !has_retained_entries
}

pub fn perform_skill_dist_cleanup(dist_skills_dir: &str, dry_run: bool) -> SkillDistCleanupResult {
  let dist_skills_dir_path = Path::new(dist_skills_dir);

  if !dist_skills_dir_path.exists() {
    return SkillDistCleanupResult {
      success: true,
      description: "dist skills directory does not exist, nothing to clean".to_string(),
      deleted_files: vec![],
      deleted_dirs: vec![],
      error: None,
    };
  }

  let mut files_to_delete: Vec<String> = Vec::new();
  let mut dirs_to_delete: Vec<String> = Vec::new();

  let root_will_be_empty = collect_cleanup_plan(
    dist_skills_dir_path,
    &mut files_to_delete,
    &mut dirs_to_delete,
  );
  if root_will_be_empty {
    dirs_to_delete.push(dist_skills_dir.to_string());
  }

  let compacted = compact_deletion_targets(&files_to_delete, &dirs_to_delete);

  if dry_run {
    return SkillDistCleanupResult {
      success: true,
      description: format!(
        "Would delete {} files and {} directories",
        compacted.files.len(),
        compacted.dirs.len()
      ),
      deleted_files: compacted.files,
      deleted_dirs: compacted.dirs,
      error: None,
    };
  }

  let delete_result = delete_targets(&compacted.files, &compacted.dirs);

  let has_errors = !delete_result.file_errors.is_empty() || !delete_result.dir_errors.is_empty();

  SkillDistCleanupResult {
    success: !has_errors,
    description: format!(
      "Deleted {} files and {} directories",
      delete_result.deleted_files.len(),
      delete_result.deleted_dirs.len()
    ),
    deleted_files: delete_result.deleted_files,
    deleted_dirs: delete_result.deleted_dirs,
    error: if has_errors {
      Some(format!(
        "{} errors occurred during cleanup",
        delete_result.file_errors.len() + delete_result.dir_errors.len()
      ))
    } else {
      None
    },
  }
}

#[cfg(feature = "napi")]
mod napi_binding {
  use napi_derive::napi;

  #[napi(js_name = "performSkillDistCleanup")]
  pub fn perform_skill_dist_cleanup_binding(
    dist_skills_dir: String,
    dry_run: bool,
  ) -> napi::Result<String> {
    let result = super::perform_skill_dist_cleanup(&dist_skills_dir, dry_run);
    serde_json::to_string(&result).map_err(|e| napi::Error::from_reason(e.to_string()))
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;
  use tempfile::tempdir;

  #[test]
  fn deletes_non_mdx_mirrored_files_while_preserving_compiled_mdx_files() {
    let dir = tempdir().unwrap();
    let dist_skill_dir = dir
      .path()
      .join("aindex")
      .join("dist")
      .join("skills")
      .join("demo");
    let nested_legacy_dir = dist_skill_dir.join("legacy");

    fs::create_dir_all(&nested_legacy_dir).unwrap();
    fs::write(dist_skill_dir.join("skill.mdx"), "Compiled skill").unwrap();
    fs::write(dist_skill_dir.join("guide.mdx"), "Compiled guide").unwrap();
    fs::write(dist_skill_dir.join("guide.src.mdx"), "Stale source mirror").unwrap();
    fs::write(dist_skill_dir.join("notes.md"), "Legacy note").unwrap();
    fs::write(dist_skill_dir.join("demo.kts"), "println(\"legacy\")").unwrap();
    fs::write(dist_skill_dir.join("mcp.json"), "{\"mcpServers\":{}}").unwrap();
    fs::write(nested_legacy_dir.join("diagram.svg"), "<svg />").unwrap();

    let result = perform_skill_dist_cleanup(&dist_skill_dir.to_string_lossy().into_owned(), false);

    assert!(result.success);
    assert!(dist_skill_dir.join("skill.mdx").exists());
    assert!(dist_skill_dir.join("guide.mdx").exists());
    assert!(!dist_skill_dir.join("guide.src.mdx").exists());
    assert!(!dist_skill_dir.join("notes.md").exists());
    assert!(!dist_skill_dir.join("demo.kts").exists());
    assert!(!dist_skill_dir.join("mcp.json").exists());
    assert!(!nested_legacy_dir.join("diagram.svg").exists());
    assert!(!nested_legacy_dir.exists());
    assert!(
      result.deleted_files.contains(
        &dist_skill_dir
          .join("guide.src.mdx")
          .to_string_lossy()
          .into_owned()
      )
    );
    assert!(
      result.deleted_files.contains(
        &dist_skill_dir
          .join("notes.md")
          .to_string_lossy()
          .into_owned()
      )
    );
    assert!(
      result
        .deleted_dirs
        .contains(&nested_legacy_dir.to_string_lossy().into_owned())
    );
  }

  #[test]
  fn respects_configured_skills_dist_paths() {
    let dir = tempdir().unwrap();
    let dist_skill_dir = dir
      .path()
      .join("aindex")
      .join("compiled")
      .join("skills")
      .join("demo");

    fs::create_dir_all(&dist_skill_dir).unwrap();
    fs::write(dist_skill_dir.join("skill.mdx"), "Compiled skill").unwrap();
    fs::write(dist_skill_dir.join("legacy.txt"), "Legacy attachment").unwrap();

    let result = perform_skill_dist_cleanup(&dist_skill_dir.to_string_lossy().into_owned(), false);

    assert!(result.success);
    assert!(dist_skill_dir.join("skill.mdx").exists());
    assert!(!dist_skill_dir.join("legacy.txt").exists());
    assert!(
      result.deleted_files.contains(
        &dist_skill_dir
          .join("legacy.txt")
          .to_string_lossy()
          .into_owned()
      )
    );
  }

  #[test]
  fn collapses_nested_removable_skill_dist_directories_to_the_highest_safe_root() {
    let dir = tempdir().unwrap();
    let dist_skills_dir = dir.path().join("aindex").join("dist").join("skills");
    let dist_skill_dir = dist_skills_dir.join("demo");
    let nested_legacy_dir = dist_skill_dir.join("legacy").join("deep");

    fs::create_dir_all(&nested_legacy_dir).unwrap();
    fs::write(nested_legacy_dir.join("diagram.svg"), "<svg />").unwrap();

    let result = perform_skill_dist_cleanup(&dist_skills_dir.to_string_lossy().into_owned(), false);

    assert!(result.success);
    assert!(result.deleted_files.is_empty());
    assert!(
      result
        .deleted_dirs
        .contains(&dist_skills_dir.to_string_lossy().into_owned())
    );
    assert!(!dist_skills_dir.exists());
  }
}
